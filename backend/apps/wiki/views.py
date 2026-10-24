"""API views for TechWiki documentation platform."""

import contextlib
import logging
import re
from typing import Any
from uuid import UUID

import markdown
from django.conf import settings
from django.db import transaction
from django.db.models import Q
from django.http import HttpRequest
from django.utils import timezone
from django.utils.text import slugify
from ninja import Form, Router
from ninja.files import UploadedFile

from apps.wiki.models import (
    Article,
    ArticleImage,
    ArticleRevision,
    ArticleStatus,
    Category,
    ModerationLog,
    Redirect,
    Tag,
    WikiUserProfile,
)
from apps.wiki.schemas import (
    ArticleCreateRequest,
    ArticleUpdateRequest,
    ModerationActionRequest,
    RedirectCreateRequest,
    TagCreateRequest,
)
from authentication.models import User

logger = logging.getLogger(__name__)

wiki_router = Router(tags=["wiki"])


# ============================================================================
# Helper Functions
# ============================================================================


MAX_PER_PAGE = 100


def clamp_pagination(page: int, per_page: int) -> tuple[int, int]:
    """Keep page at least 1 and per_page between 1 and MAX_PER_PAGE."""
    return max(page, 1), min(max(per_page, 1), MAX_PER_PAGE)


def render_markdown(content: str) -> str:
    """Render markdown to HTML with extensions."""
    md = markdown.Markdown(
        extensions=[
            "fenced_code",
            "codehilite",
            "tables",
            "toc",
            "nl2br",
            "sane_lists",
            "smarty",
            "meta",
        ],
        extension_configs={
            "codehilite": {
                "css_class": "highlight",
                "guess_lang": True,
                "linenums": False,
            },
        },
    )
    return md.convert(content)


def get_user_profile(user: User | None) -> WikiUserProfile | None:
    """Get or create wiki user profile."""
    if not user or not user.is_authenticated:
        return None
    profile, _ = WikiUserProfile.objects.get_or_create(user=user)
    return profile


def article_to_summary(article: Article) -> dict[str, Any]:
    """Convert article to summary dict."""
    category_data = None
    if article.category:
        category_data = {
            "id": str(article.category.id),
            "name": article.category.name,
            "slug": article.category.slug,
            "description": article.category.description,
            "icon": article.category.icon,
            "order": article.category.order,
            "parent_id": str(article.category.parent_id) if article.category.parent_id else None,
            "is_active": article.category.is_active,
            "article_count": article.category.article_count,
            "full_path": article.category.full_path,
        }

    # Get all categories
    categories_data = [
        {
            "id": str(cat.id),
            "name": cat.name,
            "slug": cat.slug,
            "icon": cat.icon,
        }
        for cat in article.categories.all()
    ]

    author_data = None
    if article.author:
        profile = get_user_profile(article.author)
        author_data = {
            "id": str(article.author.id),
            "first_name": article.author.first_name,
            "last_name": article.author.last_name,
            "bio": profile.bio if profile else "",
            "photo": profile.photo.url if profile and profile.photo else None,
            "website": profile.website if profile else "",
            "github": profile.github if profile else "",
            "twitter": profile.twitter if profile else "",
            "bluesky": profile.bluesky if profile else "",
            "linkedin": profile.linkedin if profile else "",
            "instagram": profile.instagram if profile else "",
            "facebook": profile.facebook if profile else "",
            "devto": profile.devto if profile else "",
            "stackoverflow": profile.stackoverflow if profile else "",
            "youtube": profile.youtube if profile else "",
            "twitch": profile.twitch if profile else "",
        }

    return {
        "id": str(article.id),
        "title": article.title,
        "slug": article.slug,
        "excerpt": article.excerpt,
        "article_type": article.article_type,
        "category": category_data,
        "categories": categories_data,
        "author": author_data,
        "status": article.status,
        "published_at": article.published_at,
        "created_at": article.created_at,
        "updated_at": article.updated_at,
        "view_count": article.view_count,
        "reading_time": article.reading_time,
        "is_featured": article.is_featured,
        "featured_image_url": article.featured_image.url if article.featured_image else None,
    }


def article_to_response(article: Article) -> dict[str, Any]:
    """Convert article to full response dict."""
    data = article_to_summary(article)
    data.update(
        {
            "content": article.content,
            "rendered_html": article.rendered_html or render_markdown(article.content),
            "tags": [
                {"id": str(t.id), "name": t.name, "slug": t.slug, "description": t.description}
                for t in article.tags.all()
            ],
            "meta_title": article.meta_title,
            "meta_description": article.meta_description,
            "allow_comments": article.allow_comments,
            "version": article.version,
            "full_url": article.full_url,
        }
    )
    return data


# ============================================================================
# Category Endpoints
# ============================================================================


@wiki_router.get("/categories", response={200: dict})
def list_categories(request: HttpRequest) -> tuple[int, dict[str, Any]]:
    """List all active categories."""
    categories = Category.objects.filter(is_active=True).select_related("parent")

    return 200, {
        "success": True,
        "categories": [
            {
                "id": str(c.id),
                "name": c.name,
                "slug": c.slug,
                "description": c.description,
                "icon": c.icon,
                "order": c.order,
                "parent_id": str(c.parent_id) if c.parent_id else None,
                "is_active": c.is_active,
                "article_count": c.article_count,
                "full_path": c.full_path,
            }
            for c in categories
        ],
    }


@wiki_router.get("/categories/{slug}", response={200: dict})
def get_category(request: HttpRequest, slug: str) -> tuple[int, dict[str, Any]]:
    """Get category by slug."""
    try:
        category = Category.objects.get(slug=slug, is_active=True)
        return 200, {
            "success": True,
            "category": {
                "id": str(category.id),
                "name": category.name,
                "slug": category.slug,
                "description": category.description,
                "icon": category.icon,
                "order": category.order,
                "parent_id": str(category.parent_id) if category.parent_id else None,
                "is_active": category.is_active,
                "article_count": category.article_count,
                "full_path": category.full_path,
            },
        }
    except Category.DoesNotExist:
        return 200, {"success": False, "message": "Category not found"}


# ============================================================================
# Admin Category Management
# ============================================================================


@wiki_router.post("/admin/categories", response={200: dict})
def create_category(  # noqa: PLR0917
    request: HttpRequest,
    name: str = Form[str](""),
    slug: str = Form[str](""),
    description: str = Form[str](""),
    icon: str = Form[str](""),
    parent_id: str = Form[str](""),
) -> tuple[int, dict[str, Any]]:
    """Create a new category (staff/moderators only)."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Permission denied"}

    profile = get_user_profile(request.user)
    if not (request.user.is_staff or (profile and profile.can_moderate)):
        return 200, {"success": False, "message": "Permission denied"}

    try:
        parent = None
        if parent_id:
            try:
                parent = Category.objects.get(id=parent_id)
            except Category.DoesNotExist:
                return 200, {"success": False, "message": "Parent category not found"}

        category = Category.objects.create(
            name=name,
            slug=slug or slugify(name),
            description=description or "",
            icon=icon or "",
            parent=parent,
            is_active=True,
        )

        return 200, {
            "success": True,
            "category": {
                "id": str(category.id),
                "name": category.name,
                "slug": category.slug,
                "description": category.description,
                "icon": category.icon,
                "parent_id": str(category.parent_id) if category.parent_id else None,
            },
        }
    except Exception as e:
        logger.error("Failed to create category: %s", e)
        return 200, {"success": False, "message": "Failed to create category"}


@wiki_router.put("/admin/categories/{category_id}", response={200: dict})
def update_category(  # noqa: PLR0917
    request: HttpRequest,
    category_id: str,
    name: str = Form[str](""),
    slug: str = Form[str](""),
    description: str = Form[str](""),
    icon: str = Form[str](""),
    parent_id: str = Form[str](""),
) -> tuple[int, dict[str, Any]]:
    """Update a category (staff/moderators only)."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Permission denied"}

    profile = get_user_profile(request.user)
    if not (request.user.is_staff or (profile and profile.can_moderate)):
        return 200, {"success": False, "message": "Permission denied"}

    try:
        category = Category.objects.get(id=category_id)

        parent = None
        if parent_id and parent_id != str(category.id):  # Prevent self-parenting
            try:
                parent = Category.objects.get(id=parent_id)
            except Category.DoesNotExist:
                return 200, {"success": False, "message": "Parent category not found"}

        category.name = name
        category.slug = slug or slugify(name)
        category.description = description or ""
        category.icon = icon or ""
        category.parent = parent
        category.save()

        return 200, {
            "success": True,
            "category": {
                "id": str(category.id),
                "name": category.name,
                "slug": category.slug,
                "description": category.description,
                "icon": category.icon,
                "parent_id": str(category.parent_id) if category.parent_id else None,
            },
        }
    except Category.DoesNotExist:
        return 200, {"success": False, "message": "Category not found"}
    except Exception as e:
        logger.error("Failed to update category: %s", e)
        return 200, {"success": False, "message": "Failed to update category"}


@wiki_router.delete("/admin/categories/{category_id}", response={200: dict})
def delete_category(request: HttpRequest, category_id: str) -> tuple[int, dict[str, Any]]:
    """Delete a category (staff/moderators only)."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Permission denied"}

    profile = get_user_profile(request.user)
    if not (request.user.is_staff or (profile and profile.can_moderate)):
        return 200, {"success": False, "message": "Permission denied"}

    try:
        category = Category.objects.get(id=category_id)

        # Check if category has articles
        if category.article_count > 0:
            return 200, {"success": False, "message": "Cannot delete category with articles"}

        # Check if category has subcategories
        if Category.objects.filter(parent=category).exists():
            return 200, {"success": False, "message": "Cannot delete category with subcategories"}

        category.delete()
        return 200, {"success": True, "message": "Category deleted"}
    except Category.DoesNotExist:
        return 200, {"success": False, "message": "Category not found"}
    except Exception as e:
        logger.error("Failed to delete category: %s", e)
        return 200, {"success": False, "message": "Failed to delete category"}


# ============================================================================
# Tag Endpoints
# ============================================================================


@wiki_router.get("/tags", response={200: dict})
def list_tags(request: HttpRequest) -> tuple[int, dict[str, Any]]:
    """List all tags."""
    tags = Tag.objects.all()
    return 200, {
        "success": True,
        "tags": [
            {"id": str(t.id), "name": t.name, "slug": t.slug, "description": t.description}
            for t in tags
        ],
    }


@wiki_router.post("/tags", response={200: dict})
def create_tag(request: HttpRequest, data: TagCreateRequest) -> tuple[int, dict[str, Any]]:
    """Create a new tag."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Authentication required"}

    # Check if user is staff or has moderation rights
    profile = get_user_profile(request.user)
    if not (request.user.is_staff or (profile and profile.can_moderate)):
        return 200, {"success": False, "message": "Permission denied"}

    try:
        slug = slugify(data.name)

        # Check if tag already exists
        if Tag.objects.filter(slug=slug).exists():
            return 200, {"success": False, "message": "Tag with this name already exists"}

        tag = Tag.objects.create(
            name=data.name,
            slug=slug,
            description=data.description or "",
        )

        return 200, {
            "success": True,
            "tag": {
                "id": str(tag.id),
                "name": tag.name,
                "slug": tag.slug,
                "description": tag.description,
            },
            "message": "Tag created successfully",
        }
    except Exception as e:
        logger.error("Error creating tag: %s", e)
        return 200, {"success": False, "message": "Failed to create tag"}


# ============================================================================
# Article Endpoints
# ============================================================================


@wiki_router.get("/articles", response={200: dict})
def list_articles(  # noqa: PLR0917
    request: HttpRequest,
    page: int = 1,
    per_page: int = 20,
    category: str | None = None,
    article_type: str | None = None,
    tag: str | None = None,
    featured: bool | None = None,
    author_id: str | None = None,
) -> tuple[int, dict[str, Any]]:
    """List published articles with filters."""
    page, per_page = clamp_pagination(page, per_page)
    articles = (
        Article.objects.filter(status=ArticleStatus.PUBLISHED)
        .select_related("category", "author", "featured_image")
        .prefetch_related("tags")
    )

    if category:
        articles = articles.filter(category__slug=category)
    if article_type:
        articles = articles.filter(article_type=article_type)
    if tag:
        articles = articles.filter(tags__slug=tag)
    if featured is not None:
        articles = articles.filter(is_featured=featured)
    if author_id:
        articles = articles.filter(author_id=UUID(author_id))

    total = articles.count()
    total_pages = (total + per_page - 1) // per_page
    offset = (page - 1) * per_page
    articles = articles[offset : offset + per_page]

    return 200, {
        "success": True,
        "articles": [article_to_summary(a) for a in articles],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
    }


@wiki_router.get("/articles/by-path/{path:path}", response={200: dict})
def get_article_by_path(request: HttpRequest, path: str) -> tuple[int, dict[str, Any]]:
    """Get article by full path (category/slug or just slug)."""
    parts = path.strip("/").split("/")

    if len(parts) >= 2:
        # Category + slug
        category_slug = parts[-2]
        article_slug = parts[-1]
        try:
            article = (
                Article.objects.select_related("category", "author", "featured_image")
                .prefetch_related("tags")
                .get(
                    category__slug=category_slug,
                    slug=article_slug,
                    status=ArticleStatus.PUBLISHED,
                )
            )
        except Article.DoesNotExist:
            return 200, {"success": False, "message": "Article not found"}
    else:
        # Just slug
        article_slug = parts[0]
        try:
            article = (
                Article.objects.select_related("category", "author", "featured_image")
                .prefetch_related("tags")
                .get(
                    slug=article_slug,
                    status=ArticleStatus.PUBLISHED,
                )
            )
        except Article.DoesNotExist:
            return 200, {"success": False, "message": "Article not found"}

    # Increment view count
    Article.objects.filter(id=article.id).update(view_count=article.view_count + 1)

    return 200, {
        "success": True,
        "article": article_to_response(article),
    }


@wiki_router.get("/articles/{article_id}", response={200: dict})
def get_article(request: HttpRequest, article_id: str) -> tuple[int, dict[str, Any]]:
    """Get article by ID."""
    try:
        article = (
            Article.objects.select_related("category", "author", "featured_image")
            .prefetch_related("tags")
            .get(id=article_id)
        )

        # Check permissions for non-published articles
        if article.status != ArticleStatus.PUBLISHED:
            if not request.user.is_authenticated:
                return 200, {"success": False, "message": "Article not found"}
            profile = get_user_profile(request.user)
            if article.author != request.user and not (profile and profile.can_moderate):
                return 200, {"success": False, "message": "Article not found"}

        return 200, {
            "success": True,
            "article": article_to_response(article),
        }
    except Article.DoesNotExist:
        return 200, {"success": False, "message": "Article not found"}


@wiki_router.post("/articles", response={200: dict})
def create_article(request: HttpRequest, data: ArticleCreateRequest) -> tuple[int, dict[str, Any]]:
    """Create a new article."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Authentication required"}

    try:
        profile = get_user_profile(request.user)

        # Determine initial status
        if profile and profile.can_publish_directly:
            status = ArticleStatus.PUBLISHED
        else:
            status = ArticleStatus.PENDING_REVIEW

        slug = data.slug or slugify(data.title)

        # Check for duplicate slug in category
        category = None
        if data.category_id:
            try:
                category = Category.objects.get(id=data.category_id)
            except Category.DoesNotExist:
                return 200, {"success": False, "message": "Category not found"}

        if Article.objects.filter(category=category, slug=slug).exists():
            return 200, {
                "success": False,
                "message": "Article with this slug already exists in the category",
            }

        with transaction.atomic():
            article = Article.objects.create(
                title=data.title,
                slug=slug,
                excerpt=data.excerpt,
                content=data.content,
                rendered_html=render_markdown(data.content),
                article_type=data.article_type,
                category=category,
                author=request.user,
                status=status,
                meta_title=data.meta_title or data.title[:60],
                meta_description=data.meta_description or data.excerpt[:160],
                allow_comments=data.allow_comments,
                published_at=timezone.now() if status == ArticleStatus.PUBLISHED else None,
            )

            # Set all categories
            if data.category_ids:
                categories = Category.objects.filter(id__in=data.category_ids)
                article.categories.set(categories)
            elif category:
                # If only primary category specified, add it to categories too
                article.categories.add(category)

            if data.tag_ids:
                tags = Tag.objects.filter(id__in=data.tag_ids)
                article.tags.set(tags)

            # Create initial revision
            ArticleRevision.objects.create(
                article=article,
                version=1,
                title=article.title,
                content=article.content,
                author=request.user,
                change_summary="Initial version",
            )

            # Update author's article count
            if profile:
                profile.articles_count = Article.objects.filter(author=request.user).count()
                profile.save(update_fields=["articles_count"])

        return 200, {
            "success": True,
            "article": article_to_response(article),
            "message": "Article created"
            + (
                " and published"
                if status == ArticleStatus.PUBLISHED
                else " and submitted for review"
            ),
        }
    except Exception as e:
        logger.error("Error creating article: %s", e)
        return 200, {"success": False, "message": "Failed to create article"}


@wiki_router.put("/articles/{article_id}", response={200: dict})
def update_article(
    request: HttpRequest, article_id: str, data: ArticleUpdateRequest
) -> tuple[int, dict[str, Any]]:
    """Update an article."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Authentication required"}

    try:
        article = Article.objects.get(id=article_id)

        # Check permissions
        profile = get_user_profile(request.user)
        if article.author != request.user and not (profile and profile.can_moderate):
            return 200, {"success": False, "message": "Permission denied"}

        with transaction.atomic():
            # Update fields
            if data.title is not None:
                article.title = data.title
            if data.slug is not None:
                article.slug = data.slug
            if data.excerpt is not None:
                article.excerpt = data.excerpt
            if data.content is not None:
                article.content = data.content
                article.rendered_html = render_markdown(data.content)
            if data.article_type is not None:
                article.article_type = data.article_type
            if data.category_id is not None:
                article.category_id = data.category_id or None
            if data.meta_title is not None:
                article.meta_title = data.meta_title
            if data.meta_description is not None:
                article.meta_description = data.meta_description
            if data.allow_comments is not None:
                article.allow_comments = data.allow_comments

            article.version += 1
            article.save()

            if data.tag_ids is not None:
                tags = Tag.objects.filter(id__in=data.tag_ids)
                article.tags.set(tags)

            if data.category_ids is not None:
                categories = Category.objects.filter(id__in=data.category_ids)
                article.categories.set(categories)
            elif data.category_id is not None and data.category_id:
                # If only primary category updated, ensure it's in categories too
                category = Category.objects.get(id=data.category_id)
                if not article.categories.filter(id=data.category_id).exists():
                    article.categories.add(category)

            # Revisions record each version's content, matching create_article and the
            # authoring API, so the initial revision is version 1.
            ArticleRevision.objects.create(
                article=article,
                version=article.version,
                title=article.title,
                content=article.content,
                author=request.user,
                change_summary=data.change_summary or f"Update to version {article.version}",
            )

        return 200, {
            "success": True,
            "article": article_to_response(article),
            "message": "Article updated",
        }
    except Article.DoesNotExist:
        return 200, {"success": False, "message": "Article not found"}
    except Exception as e:
        logger.error("Error updating article: %s", e)
        return 200, {"success": False, "message": "Failed to update article"}


@wiki_router.delete("/articles/{article_id}", response={200: dict})
def delete_article(request: HttpRequest, article_id: str) -> tuple[int, dict[str, Any]]:
    """Delete an article (archive it)."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Authentication required"}

    try:
        article = Article.objects.get(id=article_id)

        profile = get_user_profile(request.user)
        if article.author != request.user and not (profile and profile.can_moderate):
            return 200, {"success": False, "message": "Permission denied"}

        article.status = ArticleStatus.ARCHIVED
        article.save(update_fields=["status"])

        return 200, {"success": True, "message": "Article archived"}
    except Article.DoesNotExist:
        return 200, {"success": False, "message": "Article not found"}


# ============================================================================
# Search Endpoints
# ============================================================================


@wiki_router.get("/search", response={200: dict})
def search_articles(  # noqa: PLR0917
    request: HttpRequest,
    q: str,
    category: str | None = None,
    article_type: str | None = None,
    page: int = 1,
    per_page: int = 20,
) -> tuple[int, dict[str, Any]]:
    """Search published articles."""
    page, per_page = clamp_pagination(page, per_page)
    if not q or len(q) < 2:
        return 200, {"success": False, "message": "Query must be at least 2 characters"}

    articles = (
        Article.objects.filter(
            status=ArticleStatus.PUBLISHED,
        )
        .filter(
            Q(title__icontains=q)
            | Q(excerpt__icontains=q)
            | Q(content__icontains=q)
            | Q(tags__name__icontains=q)
        )
        .distinct()
        .select_related("category", "author", "featured_image")
    )

    if category:
        articles = articles.filter(category__slug=category)
    if article_type:
        articles = articles.filter(article_type=article_type)

    total = articles.count()
    offset = (page - 1) * per_page
    articles = articles[offset : offset + per_page]

    return 200, {
        "success": True,
        "query": q,
        "results": [article_to_summary(a) for a in articles],
        "total": total,
        "page": page,
        "per_page": per_page,
    }


# ============================================================================
# Image Endpoints
# ============================================================================


@wiki_router.post("/images/upload", response={200: dict})
def upload_image(
    request: HttpRequest,
    file: UploadedFile,
    article_id: str | None = None,
    alt_text: str = "",
) -> tuple[int, dict[str, Any]]:
    """Upload an image."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Authentication required"}

    try:
        # Validate file type
        allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
        if file.content_type not in allowed_types:
            return 200, {"success": False, "message": "Invalid image type"}

        # Validate file size (max 5MB)
        if file.size is not None and file.size > 5 * 1024 * 1024:
            return 200, {"success": False, "message": "Image too large (max 5MB)"}

        article = None
        if article_id:
            with contextlib.suppress(Article.DoesNotExist):
                article = Article.objects.get(id=article_id)

        image = ArticleImage.objects.create(
            article=article,
            image=file,
            alt_text=alt_text,
            uploaded_by=request.user,
        )

        return 200, {
            "success": True,
            "id": str(image.id),
            "url": image.url,
            "alt_text": image.alt_text,
            "message": "Image uploaded",
        }
    except Exception as e:
        logger.error("Error uploading image: %s", e)
        return 200, {"success": False, "message": "Failed to upload image"}


# ============================================================================
# Redirect Endpoints
# ============================================================================


@wiki_router.get("/redirects/resolve", response={200: dict})
def resolve_redirect(request: HttpRequest, path: str) -> tuple[int, dict[str, Any]]:
    """Resolve a redirect for an old path."""
    # Normalize path
    path = "/" + path.strip("/")

    try:
        redirect = Redirect.objects.get(old_path=path)
        redirect.record_hit()
        return 200, {
            "success": True,
            "redirect_to": redirect.new_path,
            "is_permanent": redirect.is_permanent,
        }
    except Redirect.DoesNotExist:
        # Try matching MediaWiki patterns
        # /wiki/Page_Name -> /category/page-name
        wiki_match = re.match(r"^/wiki/(.+)$", path)
        if wiki_match:
            page_name = wiki_match.group(1).replace("_", "-").lower()
            # Check if article exists
            article = Article.objects.filter(
                slug=page_name,
                status=ArticleStatus.PUBLISHED,
            ).first()
            if article:
                return 200, {
                    "success": True,
                    "redirect_to": article.full_url,
                    "is_permanent": True,
                }

        return 200, {
            "success": False,
            "message": "No redirect found",
        }


@wiki_router.post("/redirects", response={200: dict})
def create_redirect(
    request: HttpRequest, data: RedirectCreateRequest
) -> tuple[int, dict[str, Any]]:
    """Create a new redirect."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Authentication required"}

    profile = get_user_profile(request.user)
    if not profile or not profile.can_moderate:
        return 200, {"success": False, "message": "Permission denied"}

    try:
        redirect, created = Redirect.objects.get_or_create(
            old_path=data.old_path,
            defaults={
                "new_path": data.new_path,
                "is_permanent": data.is_permanent,
                "notes": data.notes,
            },
        )

        if not created:
            redirect.new_path = data.new_path
            redirect.is_permanent = data.is_permanent
            redirect.notes = data.notes
            redirect.save()

        return 200, {
            "success": True,
            "message": "Redirect created" if created else "Redirect updated",
        }
    except Exception as e:
        logger.error("Error creating redirect: %s", e)
        return 200, {"success": False, "message": "Failed to create redirect"}


# ============================================================================
# Moderation Endpoints
# ============================================================================


@wiki_router.get("/moderation/pending", response={200: dict})
def get_pending_articles(request: HttpRequest) -> tuple[int, dict[str, Any]]:
    """Get articles pending moderation."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Authentication required"}

    profile = get_user_profile(request.user)
    if not profile or not profile.can_moderate:
        return 200, {"success": False, "message": "Permission denied"}

    articles = (
        Article.objects.filter(status=ArticleStatus.PENDING_REVIEW)
        .select_related("category", "author")
        .order_by("created_at")
    )

    return 200, {
        "success": True,
        "articles": [article_to_summary(a) for a in articles],
        "total": articles.count(),
    }


@wiki_router.post("/moderation/{article_id}", response={200: dict})
def moderate_article(
    request: HttpRequest, article_id: str, data: ModerationActionRequest
) -> tuple[int, dict[str, Any]]:
    """Perform moderation action on an article."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Authentication required"}

    profile = get_user_profile(request.user)
    if not profile or not profile.can_moderate:
        return 200, {"success": False, "message": "Permission denied"}

    try:
        article = Article.objects.get(id=article_id)
        old_status = article.status

        action_map = {
            "approve": ArticleStatus.APPROVED,
            "reject": ArticleStatus.DRAFT,
            "request_changes": ArticleStatus.CHANGES_REQUESTED,
            "publish": ArticleStatus.PUBLISHED,
        }

        if data.action not in action_map:
            return 200, {"success": False, "message": "Invalid action"}

        new_status = action_map[data.action]

        with transaction.atomic():
            article.status = new_status
            article.moderation_notes = data.notes
            article.moderator = request.user
            article.moderated_at = timezone.now()

            if new_status == ArticleStatus.PUBLISHED and not article.published_at:
                article.published_at = timezone.now()

            article.save()

            ModerationLog.objects.create(
                article=article,
                moderator=request.user,
                action=data.action,
                old_status=old_status,
                new_status=new_status,
                notes=data.notes,
            )

        return 200, {
            "success": True,
            "message": f"Article {data.action}d",
            "new_status": new_status,
        }
    except Article.DoesNotExist:
        return 200, {"success": False, "message": "Article not found"}


# ============================================================================
# User Articles Endpoints
# ============================================================================


@wiki_router.get("/my-articles", response={200: dict})
def get_my_articles(
    request: HttpRequest,
    status: str | None = None,
    page: int = 1,
    per_page: int = 20,
) -> tuple[int, dict[str, Any]]:
    """Get current user's articles."""
    page, per_page = clamp_pagination(page, per_page)
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Authentication required"}

    articles = Article.objects.filter(author=request.user).select_related(
        "category", "featured_image"
    )

    if status:
        articles = articles.filter(status=status)

    total = articles.count()
    total_pages = (total + per_page - 1) // per_page
    offset = (page - 1) * per_page
    articles = articles[offset : offset + per_page]

    return 200, {
        "success": True,
        "articles": [article_to_summary(a) for a in articles],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
    }


# ============================================================================
# User Profile Endpoints
# ============================================================================


@wiki_router.get("/me", response={200: dict})
def get_wiki_profile(request: HttpRequest) -> tuple[int, dict[str, Any]]:
    """Get current user's wiki profile and permissions."""
    if not request.user.is_authenticated:
        return 200, {
            "success": False,
            "user": None,
            "message": "Not authenticated",
        }

    profile = get_user_profile(request.user)

    return 200, {
        "success": True,
        "user": {
            "id": str(request.user.id),
            "email": request.user.email,
            "first_name": request.user.first_name,
            "last_name": request.user.last_name,
            "role": profile.role if profile else "reader",
            "bio": profile.bio if profile else "",
            "website": profile.website if profile else "",
            "photo": profile.photo.url if profile and profile.photo else None,
            "github": profile.github if profile else "",
            "twitter": profile.twitter if profile else "",
            "bluesky": profile.bluesky if profile else "",
            "linkedin": profile.linkedin if profile else "",
            "instagram": profile.instagram if profile else "",
            "facebook": profile.facebook if profile else "",
            "devto": profile.devto if profile else "",
            "stackoverflow": profile.stackoverflow if profile else "",
            "youtube": profile.youtube if profile else "",
            "twitch": profile.twitch if profile else "",
            "is_trusted": profile.is_trusted if profile else False,
            "can_publish_directly": profile.can_publish_directly if profile else False,
            "can_moderate": profile.can_moderate if profile else False,
            "is_moderator": profile.can_moderate if profile else False,
            "is_staff": request.user.is_staff,
            "is_superuser": request.user.is_superuser,
            "articles_count": profile.articles_count if profile else 0,
        },
        "message": "Profile retrieved successfully",
    }


@wiki_router.put("/me", response={200: dict})
def update_wiki_profile(  # noqa: PLR0917
    request: HttpRequest,
    bio: str = Form[str](""),
    website: str = Form[str](""),
    github: str = Form[str](""),
    twitter: str = Form[str](""),
    bluesky: str = Form[str](""),
    linkedin: str = Form[str](""),
    instagram: str = Form[str](""),
    facebook: str = Form[str](""),
    devto: str = Form[str](""),
    stackoverflow: str = Form[str](""),
    youtube: str = Form[str](""),
    twitch: str = Form[str](""),
    photo: UploadedFile | None = None,
) -> tuple[int, dict[str, Any]]:
    """Update current user's wiki profile."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "message": "Not authenticated"}

    profile = get_user_profile(request.user)
    if not profile:
        return 200, {"success": False, "message": "Profile not found"}

    profile.bio = bio
    profile.website = website
    profile.github = github
    profile.twitter = twitter
    profile.bluesky = bluesky
    profile.linkedin = linkedin
    profile.instagram = instagram
    profile.facebook = facebook
    profile.devto = devto
    profile.stackoverflow = stackoverflow
    profile.youtube = youtube
    profile.twitch = twitch

    # Handle photo upload
    if photo:
        try:
            # Validate file type
            allowed_types = ["image/jpeg", "image/png", "image/webp"]
            if photo.content_type not in allowed_types:
                return 200, {
                    "success": False,
                    "message": "Invalid image type (JPEG, PNG, or WebP only)",
                }

            # Validate file size (max 2MB for profile photos)
            if photo.size is not None and photo.size > 2 * 1024 * 1024:
                return 200, {"success": False, "message": "Image too large (max 2MB)"}

            # Delete old photo if exists
            if profile.photo:
                profile.photo.delete()

            profile.photo = photo
        except Exception as e:
            logger.error("Error handling photo upload: %s", e)
            return 200, {"success": False, "message": "Failed to process photo"}

    profile.save()

    return 200, {
        "success": True,
        "message": "Profile updated successfully",
        "user": {
            "id": str(request.user.id),
            "email": request.user.email,
            "first_name": request.user.first_name,
            "last_name": request.user.last_name,
            "role": profile.role,
            "bio": profile.bio,
            "website": profile.website,
            "photo": profile.photo.url if profile.photo else None,
            "github": profile.github,
            "twitter": profile.twitter,
            "bluesky": profile.bluesky,
            "linkedin": profile.linkedin,
            "instagram": profile.instagram,
            "facebook": profile.facebook,
            "devto": profile.devto,
            "stackoverflow": profile.stackoverflow,
            "youtube": profile.youtube,
            "twitch": profile.twitch,
            "is_trusted": profile.is_trusted,
            "can_publish_directly": profile.can_publish_directly,
            "can_moderate": profile.can_moderate,
            "is_moderator": profile.can_moderate,
            "is_staff": request.user.is_staff,
            "is_superuser": request.user.is_superuser,
            "articles_count": profile.articles_count,
        },
    }


@wiki_router.get("/me/articles", response={200: dict})
def get_current_user_articles(
    request: HttpRequest,
    status: str | None = None,
    page: int = 1,
    per_page: int = 20,
) -> tuple[int, dict[str, Any]]:
    """Get current user's articles."""
    page, per_page = clamp_pagination(page, per_page)
    if not request.user.is_authenticated:
        return 200, {"success": False, "articles": [], "total": 0}

    queryset = Article.objects.filter(author=request.user)

    if status:
        queryset = queryset.filter(status=status)

    total = queryset.count()
    offset = (page - 1) * per_page
    articles = queryset[offset : offset + per_page]

    return 200, {
        "success": True,
        "articles": [article_to_summary(a) for a in articles],
        "total": total,
    }


@wiki_router.get("/me/pending", response={200: dict})
def get_my_pending_articles(request: HttpRequest) -> tuple[int, dict[str, Any]]:
    """Get current user's pending articles."""
    if not request.user.is_authenticated:
        return 200, {"success": False, "articles": [], "total": 0}

    queryset = Article.objects.filter(
        author=request.user,
        status__in=[ArticleStatus.PENDING_REVIEW, ArticleStatus.CHANGES_REQUESTED],
    )

    return 200, {
        "success": True,
        "articles": [article_to_summary(a) for a in queryset],
        "total": queryset.count(),
    }


@wiki_router.get("/me/stats", response={200: dict})
def get_my_article_stats(request: HttpRequest) -> tuple[int, dict[str, Any]]:
    """Get current user's article statistics."""
    if not request.user.is_authenticated:
        return 200, {
            "success": False,
            "stats": {
                "total": 0,
                "published": 0,
                "draft": 0,
                "pending_review": 0,
                "changes_requested": 0,
                "approved": 0,
                "archived": 0,
            },
        }

    articles = Article.objects.filter(author=request.user)

    return 200, {
        "success": True,
        "stats": {
            "total": articles.count(),
            "published": articles.filter(status=ArticleStatus.PUBLISHED).count(),
            "draft": articles.filter(status=ArticleStatus.DRAFT).count(),
            "pending_review": articles.filter(status=ArticleStatus.PENDING_REVIEW).count(),
            "changes_requested": articles.filter(status=ArticleStatus.CHANGES_REQUESTED).count(),
            "approved": articles.filter(status=ArticleStatus.APPROVED).count(),
            "archived": articles.filter(status=ArticleStatus.ARCHIVED).count(),
        },
    }


# ============================================================================
# Author Profiles
# ============================================================================


@wiki_router.get("/authors/{user_id}", response={200: dict})
def get_author_profile(request: HttpRequest, user_id: str) -> tuple[int, dict[str, Any]]:
    """Get public profile of an author."""
    try:
        from authentication.models import User

        user = User.objects.get(id=user_id)
        profile = get_user_profile(user)

        return 200, {
            "success": True,
            "user": {
                "id": str(user.id),
                "first_name": user.first_name,
                "last_name": user.last_name,
                "bio": profile.bio if profile else "",
                "photo": profile.photo.url if profile and profile.photo else None,
                "website": profile.website if profile else "",
                "github": profile.github if profile else "",
                "twitter": profile.twitter if profile else "",
                "bluesky": profile.bluesky if profile else "",
                "linkedin": profile.linkedin if profile else "",
                "instagram": profile.instagram if profile else "",
                "facebook": profile.facebook if profile else "",
                "devto": profile.devto if profile else "",
                "stackoverflow": profile.stackoverflow if profile else "",
                "youtube": profile.youtube if profile else "",
                "twitch": profile.twitch if profile else "",
                "articles_count": profile.articles_count if profile else 0,
            },
        }
    except Exception as e:
        logger.error("Error fetching author profile: %s", str(e))
        return 200, {
            "success": False,
            "message": "Author not found",
        }


@wiki_router.get("/authors/{user_id}/articles", response={200: dict})
def get_author_articles(
    request: HttpRequest,
    user_id: str,
    page: int = 1,
    per_page: int = 20,
) -> tuple[int, dict[str, Any]]:
    """Get all published articles by an author."""
    page, per_page = clamp_pagination(page, per_page)
    try:
        from authentication.models import User

        user = User.objects.get(id=user_id)
    except Exception as e:
        logger.error("Error fetching author: %s", str(e))
        return 200, {
            "success": False,
            "articles": [],
            "total": 0,
            "message": "Author not found",
        }

    # Get published articles by this author
    queryset = (
        Article.objects.filter(author=user, status=ArticleStatus.PUBLISHED)
        .select_related("author", "category")
        .prefetch_related("tags")
    )

    total = queryset.count()

    start = (page - 1) * per_page
    end = start + per_page
    articles = queryset.order_by("-created_at")[start:end]

    articles_data = []
    for article in articles:
        profile = get_user_profile(article.author)
        articles_data.append(
            {
                "id": str(article.id),
                "title": article.title,
                "slug": article.slug,
                "excerpt": article.excerpt,
                "content": article.content[:500] if article.content else "",
                "status": article.status,
                "article_type": article.article_type,
                "featured": article.is_featured,
                "created_at": article.created_at.isoformat(),
                "updated_at": article.updated_at.isoformat(),
                "author": {
                    "id": str(article.author.id) if article.author else "",
                    "first_name": article.author.first_name if article.author else "",
                    "last_name": article.author.last_name if article.author else "",
                    "bio": profile.bio if profile else "",
                    "website": profile.website if profile else "",
                    "github": profile.github if profile else "",
                    "twitter": profile.twitter if profile else "",
                },
                "category": {
                    "id": str(article.category.id),
                    "name": article.category.name,
                    "slug": article.category.slug,
                }
                if article.category
                else None,
                "tags": [
                    {
                        "id": str(tag.id),
                        "name": tag.name,
                        "slug": tag.slug,
                    }
                    for tag in article.tags.all()
                ],
            }
        )

    return 200, {
        "success": True,
        "articles": articles_data,
        "total": total,
    }


# ============================================================================
# Revalidation Webhook
# ============================================================================


@wiki_router.post("/revalidate", response={200: dict})
def trigger_revalidation(
    request: HttpRequest, paths: list[str], secret: str
) -> tuple[int, dict[str, Any]]:
    """Trigger ISR revalidation for given paths."""
    expected_secret = getattr(settings, "REVALIDATION_SECRET", None)

    if not expected_secret or secret != expected_secret:
        return 200, {"success": False, "message": "Invalid secret"}

    # This would call the Next.js revalidation API
    # For now, just return success - actual implementation depends on deployment
    return 200, {
        "success": True,
        "revalidated": paths,
        "message": "Revalidation triggered",
    }


# ============================================================================
# Sitemap Data
# ============================================================================


@wiki_router.get("/sitemap", response={200: dict})
def get_sitemap_data(request: HttpRequest) -> tuple[int, dict[str, Any]]:
    """Get data for sitemap generation."""
    articles = Article.objects.filter(status=ArticleStatus.PUBLISHED).values(
        "slug", "category__slug", "updated_at", "article_type"
    )

    categories = Category.objects.filter(is_active=True).values("slug", "updated_at")

    return 200, {
        "success": True,
        "articles": [
            {
                "url": f"/{a['category__slug']}/{a['slug']}"
                if a["category__slug"]
                else f"/articles/{a['slug']}",
                "lastModified": a["updated_at"].isoformat(),
                "changeFrequency": "weekly" if a["article_type"] == "documentation" else "monthly",
                "priority": 0.8 if a["article_type"] == "documentation" else 0.6,
            }
            for a in articles
        ],
        "categories": [
            {
                "url": f"/{c['slug']}",
                "lastModified": c["updated_at"].isoformat(),
                "changeFrequency": "weekly",
                "priority": 0.9,
            }
            for c in categories
        ],
    }
