"""Owner-only API for programmatic TechWiki authoring."""

from __future__ import annotations

import os
import uuid
from typing import Any

from django.db import transaction
from django.db.models import Q
from django.http import HttpRequest
from django.utils import timezone
from django.utils.text import slugify
from ninja import Router, Schema
from ninja.errors import HttpError
from ninja.security import HttpBearer

from apps.wiki.authoring_models import AuthoringApiToken, AuthoringAuditLog
from apps.wiki.compatibility import ArticleCompatibility, VerificationStatus
from apps.wiki.models import Article, ArticleRevision, ArticleStatus, ArticleType, Category, Tag
from apps.wiki.views import article_to_response, article_to_summary, render_markdown

ARTICLE_READ = "articles:read"
ARTICLE_CREATE = "articles:draft:create"
ARTICLE_UPDATE = "articles:draft:update"
CATEGORY_READ = "categories:read"
CATEGORY_CREATE = "categories:create"
TAG_READ = "tags:read"
TAG_CREATE = "tags:create"
COMPATIBILITY_WRITE = "compatibility:write"

SAFE_AUTHORING_SCOPES = {
    ARTICLE_READ,
    ARTICLE_CREATE,
    ARTICLE_UPDATE,
    CATEGORY_READ,
    CATEGORY_CREATE,
    TAG_READ,
    TAG_CREATE,
    COMPATIBILITY_WRITE,
}


class AuthoringBearer(HttpBearer):
    """Authenticate a scoped token belonging to the single configured owner."""

    def authenticate(self, request: HttpRequest, token: str) -> AuthoringApiToken | None:
        credential = AuthoringApiToken.authenticate(token)
        if not credential:
            return None

        owner_id = os.environ.get("TECHWIKI_AUTHORING_USER_ID", "").strip()
        if not owner_id or str(credential.user_id) != owner_id:
            return None
        if not credential.user.is_active:
            return None
        return credential


authoring_auth = AuthoringBearer()
authoring_router = Router(tags=["private-authoring"], auth=authoring_auth)


class CategoryCreatePayload(Schema):
    name: str
    slug: str | None = None
    description: str = ""
    icon: str = ""
    parent_id: uuid.UUID | None = None
    order: int = 0


class TagCreatePayload(Schema):
    name: str
    slug: str | None = None
    description: str = ""


class ArticleDraftCreatePayload(Schema):
    title: str
    content: str
    slug: str | None = None
    excerpt: str = ""
    article_type: str = ArticleType.DOCUMENTATION
    category_id: uuid.UUID | None = None
    category_ids: list[uuid.UUID] = []
    tag_ids: list[uuid.UUID] = []
    meta_title: str = ""
    meta_description: str = ""
    allow_comments: bool = True
    change_summary: str = "Created through private authoring API"


class ArticleDraftUpdatePayload(Schema):
    title: str | None = None
    content: str | None = None
    slug: str | None = None
    excerpt: str | None = None
    article_type: str | None = None
    category_id: uuid.UUID | None = None
    category_ids: list[uuid.UUID] | None = None
    tag_ids: list[uuid.UUID] | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    allow_comments: bool | None = None
    change_summary: str = "Updated through private authoring API"


class CompatibilityPayload(Schema):
    technology: str
    version: str = ""
    environment: str = ""
    status: str = VerificationStatus.VERIFIED
    notes: str = ""


def _credential(request: HttpRequest) -> AuthoringApiToken:
    credential = getattr(request, "auth", None)
    if not isinstance(credential, AuthoringApiToken):
        raise HttpError(401, "Authoring authentication required")
    return credential


def _require_scope(request: HttpRequest, scope: str) -> AuthoringApiToken:
    credential = _credential(request)
    if scope not in credential.scopes:
        raise HttpError(403, f"Missing required scope: {scope}")
    return credential


def _request_id(request: HttpRequest) -> str:
    return request.headers.get("Idempotency-Key", "").strip()[:100]


def _category_dict(category: Category) -> dict[str, Any]:
    return {
        "id": str(category.id),
        "name": category.name,
        "slug": category.slug,
        "description": category.description,
        "icon": category.icon,
        "order": category.order,
        "parent_id": str(category.parent_id) if category.parent_id else None,
        "full_path": category.full_path,
        "is_active": category.is_active,
    }


def _tag_dict(tag: Tag) -> dict[str, Any]:
    return {
        "id": str(tag.id),
        "name": tag.name,
        "slug": tag.slug,
        "description": tag.description,
    }


def _audit(
    request: HttpRequest,
    *,
    action: str,
    object_type: str,
    object_id: str,
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
) -> None:
    credential = _credential(request)
    AuthoringAuditLog.objects.create(
        actor=credential.user,
        token=credential,
        action=action,
        object_type=object_type,
        object_id=object_id,
        request_id=_request_id(request),
        before=before,
        after=after,
        metadata={"user_agent": request.headers.get("User-Agent", "")[:500]},
    )


def _existing_idempotent_result(request: HttpRequest, action: str) -> dict[str, Any] | None:
    request_id = _request_id(request)
    if not request_id:
        return None
    event = AuthoringAuditLog.objects.filter(
        token=_credential(request), request_id=request_id, action=action
    ).first()
    return event.after if event and isinstance(event.after, dict) else None


def _get_draft(article_id: uuid.UUID) -> Article:
    try:
        article = (
            Article.objects.select_related("category", "author", "featured_image")
            .prefetch_related("categories", "tags")
            .get(id=article_id)
        )
    except Article.DoesNotExist as exc:
        raise HttpError(404, "Article not found") from exc
    if article.status == ArticleStatus.PUBLISHED:
        raise HttpError(409, "Published articles cannot be changed through the private draft API")
    return article


@authoring_router.get("/", response=dict)
def authoring_root(request: HttpRequest) -> dict[str, Any]:
    credential = _credential(request)
    return {
        "name": "TechWiki Private Authoring API",
        "version": "1.0",
        "actor": str(credential.user_id),
        "scopes": credential.scopes,
        "safe_scopes": sorted(SAFE_AUTHORING_SCOPES),
        "publishing_enabled": False,
        "mcp": "/admin-mcp",
    }


@authoring_router.get("/categories", response=dict)
def authoring_list_categories(request: HttpRequest) -> dict[str, Any]:
    _require_scope(request, CATEGORY_READ)
    categories = Category.objects.select_related("parent").order_by("order", "name")
    return {"success": True, "categories": [_category_dict(item) for item in categories]}


@authoring_router.post("/categories", response=dict)
def authoring_create_category(request: HttpRequest, data: CategoryCreatePayload) -> dict[str, Any]:
    _require_scope(request, CATEGORY_CREATE)
    cached = _existing_idempotent_result(request, "category.create")
    if cached:
        return cached

    name = data.name.strip()
    if not name:
        raise HttpError(422, "Category name is required")
    slug = slugify(data.slug or name)
    if Category.objects.filter(Q(name__iexact=name) | Q(slug=slug)).exists():
        raise HttpError(409, "Category name or slug already exists")

    parent = None
    if data.parent_id:
        try:
            parent = Category.objects.get(id=data.parent_id)
        except Category.DoesNotExist as exc:
            raise HttpError(404, "Parent category not found") from exc

    category = Category.objects.create(
        name=name,
        slug=slug,
        description=data.description.strip(),
        icon=data.icon.strip(),
        parent=parent,
        order=data.order,
        is_active=True,
    )
    result = {"success": True, "category": _category_dict(category)}
    _audit(
        request,
        action="category.create",
        object_type="category",
        object_id=str(category.id),
        after=result,
    )
    return result


@authoring_router.get("/tags", response=dict)
def authoring_list_tags(request: HttpRequest) -> dict[str, Any]:
    _require_scope(request, TAG_READ)
    return {"success": True, "tags": [_tag_dict(tag) for tag in Tag.objects.order_by("name")]}


@authoring_router.post("/tags", response=dict)
def authoring_create_tag(request: HttpRequest, data: TagCreatePayload) -> dict[str, Any]:
    _require_scope(request, TAG_CREATE)
    cached = _existing_idempotent_result(request, "tag.create")
    if cached:
        return cached

    name = data.name.strip()
    if not name:
        raise HttpError(422, "Tag name is required")
    slug = slugify(data.slug or name)
    if Tag.objects.filter(Q(name__iexact=name) | Q(slug=slug)).exists():
        raise HttpError(409, "Tag name or slug already exists")

    tag = Tag.objects.create(name=name, slug=slug, description=data.description.strip())
    result = {"success": True, "tag": _tag_dict(tag)}
    _audit(request, action="tag.create", object_type="tag", object_id=str(tag.id), after=result)
    return result


@authoring_router.get("/articles", response=dict)
def authoring_list_articles(
    request: HttpRequest,
    q: str = "",
    status: str = "",
    limit: int = 20,
) -> dict[str, Any]:
    _require_scope(request, ARTICLE_READ)
    limit = min(max(limit, 1), 100)
    articles = Article.objects.select_related(
        "category", "author", "featured_image"
    ).prefetch_related("tags")
    if status:
        articles = articles.filter(status=status)
    if q.strip():
        terms = q.strip()
        articles = articles.filter(
            Q(title__icontains=terms)
            | Q(slug__icontains=terms)
            | Q(excerpt__icontains=terms)
            | Q(content__icontains=terms)
        )
    return {
        "success": True,
        "articles": [article_to_summary(article) for article in articles[:limit]],
    }


@authoring_router.get("/articles/{article_id}", response=dict)
def authoring_get_article(request: HttpRequest, article_id: uuid.UUID) -> dict[str, Any]:
    _require_scope(request, ARTICLE_READ)
    try:
        article = (
            Article.objects.select_related("category", "author", "featured_image")
            .prefetch_related("categories", "tags")
            .get(id=article_id)
        )
    except Article.DoesNotExist as exc:
        raise HttpError(404, "Article not found") from exc
    return {"success": True, "article": article_to_response(article)}


@authoring_router.post("/articles", response=dict)
def authoring_create_article(
    request: HttpRequest, data: ArticleDraftCreatePayload
) -> dict[str, Any]:
    credential = _require_scope(request, ARTICLE_CREATE)
    cached = _existing_idempotent_result(request, "article.draft.create")
    if cached:
        return cached

    title = data.title.strip()
    content = data.content.strip()
    if not title or not content:
        raise HttpError(422, "Article title and content are required")
    if data.article_type not in ArticleType.values:
        raise HttpError(422, "Invalid article_type")

    category = None
    if data.category_id:
        try:
            category = Category.objects.get(id=data.category_id, is_active=True)
        except Category.DoesNotExist as exc:
            raise HttpError(404, "Primary category not found") from exc

    slug = slugify(data.slug or title)
    if Article.objects.filter(category=category, slug=slug).exists():
        raise HttpError(409, "An article with this slug already exists in the category")

    with transaction.atomic():
        article = Article.objects.create(
            title=title,
            slug=slug,
            excerpt=data.excerpt.strip(),
            content=content,
            rendered_html=render_markdown(content),
            article_type=data.article_type,
            category=category,
            author=credential.user,
            status=ArticleStatus.DRAFT,
            meta_title=(data.meta_title.strip() or title[:60]),
            meta_description=(data.meta_description.strip() or data.excerpt.strip()[:160]),
            allow_comments=data.allow_comments,
        )
        category_ids = set(data.category_ids)
        if category:
            category_ids.add(category.id)
        if category_ids:
            categories = list(Category.objects.filter(id__in=category_ids, is_active=True))
            if len(categories) != len(category_ids):
                raise HttpError(422, "One or more category_ids are invalid")
            article.categories.set(categories)
        if data.tag_ids:
            tags = list(Tag.objects.filter(id__in=data.tag_ids))
            if len(tags) != len(set(data.tag_ids)):
                raise HttpError(422, "One or more tag_ids are invalid")
            article.tags.set(tags)

        ArticleRevision.objects.create(
            article=article,
            version=1,
            title=article.title,
            content=article.content,
            author=credential.user,
            change_summary=data.change_summary[:255],
        )

    result = {"success": True, "article": article_to_response(article)}
    _audit(
        request,
        action="article.draft.create",
        object_type="article",
        object_id=str(article.id),
        after=result,
    )
    return result


@authoring_router.patch("/articles/{article_id}", response=dict)
def authoring_update_article(
    request: HttpRequest,
    article_id: uuid.UUID,
    data: ArticleDraftUpdatePayload,
) -> dict[str, Any]:
    credential = _require_scope(request, ARTICLE_UPDATE)
    cached = _existing_idempotent_result(request, "article.draft.update")
    if cached:
        return cached

    article = _get_draft(article_id)
    before = article_to_response(article)

    if data.article_type is not None and data.article_type not in ArticleType.values:
        raise HttpError(422, "Invalid article_type")

    with transaction.atomic():
        if data.title is not None:
            article.title = data.title.strip()
        if data.slug is not None:
            article.slug = slugify(data.slug)
        if data.excerpt is not None:
            article.excerpt = data.excerpt.strip()
        if data.content is not None:
            article.content = data.content.strip()
            article.rendered_html = render_markdown(article.content)
        if data.article_type is not None:
            article.article_type = data.article_type
        if data.meta_title is not None:
            article.meta_title = data.meta_title.strip()[:60]
        if data.meta_description is not None:
            article.meta_description = data.meta_description.strip()[:160]
        if data.allow_comments is not None:
            article.allow_comments = data.allow_comments
        if data.category_id is not None:
            try:
                article.category = Category.objects.get(id=data.category_id, is_active=True)
            except Category.DoesNotExist as exc:
                raise HttpError(404, "Primary category not found") from exc

        if (
            Article.objects.exclude(id=article.id)
            .filter(category=article.category, slug=article.slug)
            .exists()
        ):
            raise HttpError(409, "An article with this slug already exists in the category")

        article.version += 1
        article.save()

        if data.category_ids is not None:
            category_ids = set(data.category_ids)
            if article.category_id:
                category_ids.add(article.category_id)
            categories = list(Category.objects.filter(id__in=category_ids, is_active=True))
            if len(categories) != len(category_ids):
                raise HttpError(422, "One or more category_ids are invalid")
            article.categories.set(categories)
        if data.tag_ids is not None:
            tags = list(Tag.objects.filter(id__in=data.tag_ids))
            if len(tags) != len(set(data.tag_ids)):
                raise HttpError(422, "One or more tag_ids are invalid")
            article.tags.set(tags)

        ArticleRevision.objects.create(
            article=article,
            version=article.version,
            title=article.title,
            content=article.content,
            author=credential.user,
            change_summary=data.change_summary[:255],
        )

    result = {"success": True, "article": article_to_response(article)}
    _audit(
        request,
        action="article.draft.update",
        object_type="article",
        object_id=str(article.id),
        before=before,
        after=result,
    )
    return result


@authoring_router.get("/articles/{article_id}/validate", response=dict)
def authoring_validate_article(request: HttpRequest, article_id: uuid.UUID) -> dict[str, Any]:
    _require_scope(request, ARTICLE_READ)
    article = _get_draft(article_id)
    errors: list[str] = []
    warnings: list[str] = []

    if not article.title.strip():
        errors.append("Title is required.")
    if not article.content.strip():
        errors.append("Content is required.")
    if not article.category:
        errors.append("A primary category is required before publication.")
    if not article.excerpt.strip():
        warnings.append("Add an excerpt for search and article previews.")
    if not article.meta_description.strip():
        warnings.append("Add a meta description.")
    if len(article.meta_title) > 60:
        warnings.append("Meta title exceeds 60 characters.")
    if len(article.meta_description) > 160:
        warnings.append("Meta description exceeds 160 characters.")
    if article.reading_time <= 1:
        warnings.append("Article is very short; verify that it fully solves the problem.")
    if not article.tags.exists():
        warnings.append("Article has no tags.")

    duplicates = Article.objects.exclude(id=article.id).filter(
        Q(title__iexact=article.title) | Q(slug=article.slug)
    )[:10]
    duplicate_matches = [article_to_summary(item) for item in duplicates]
    if duplicate_matches:
        warnings.append("Potential duplicate articles were found.")

    return {
        "success": True,
        "valid": not errors,
        "errors": errors,
        "warnings": warnings,
        "potential_duplicates": duplicate_matches,
        "article": article_to_summary(article),
    }


@authoring_router.put("/articles/{article_id}/compatibility", response=dict)
def authoring_set_compatibility(
    request: HttpRequest,
    article_id: uuid.UUID,
    data: CompatibilityPayload,
) -> dict[str, Any]:
    credential = _require_scope(request, COMPATIBILITY_WRITE)
    article = _get_draft(article_id)
    if data.status not in VerificationStatus.values:
        raise HttpError(422, "Invalid compatibility status")

    record, _created = ArticleCompatibility.objects.update_or_create(
        article=article,
        technology=data.technology.strip(),
        version=data.version.strip(),
        environment=data.environment.strip(),
        defaults={
            "status": data.status,
            "notes": data.notes.strip(),
            "verified_at": timezone.now(),
            "verified_by": credential.user,
        },
    )
    result = {
        "success": True,
        "compatibility": {
            "id": str(record.id),
            "technology": record.technology,
            "version": record.version,
            "environment": record.environment,
            "status": record.status,
            "notes": record.notes,
            "verified_at": record.verified_at,
        },
    }
    _audit(
        request,
        action="article.compatibility.upsert",
        object_type="article_compatibility",
        object_id=str(record.id),
        after=result,
    )
    return result
