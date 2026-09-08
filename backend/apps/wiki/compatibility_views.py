"""Read-only API endpoints for article compatibility metadata."""

from typing import Any

from django.http import HttpRequest
from ninja import Router

from apps.wiki.compatibility import ArticleCompatibility
from apps.wiki.models import Article, ArticleStatus

compatibility_router = Router(tags=["wiki-compatibility"])


def _serialize(record: ArticleCompatibility) -> dict[str, Any]:
    verifier = record.verified_by
    return {
        "id": str(record.id),
        "technology": record.technology,
        "version": record.version,
        "environment": record.environment,
        "status": record.status,
        "notes": record.notes,
        "verified_at": record.verified_at.isoformat(),
        "verified_by": (
            {
                "id": str(verifier.id),
                "name": f"{verifier.first_name} {verifier.last_name}".strip(),
            }
            if verifier
            else None
        ),
    }


@compatibility_router.get("/by-path/{path:path}", response={200: dict})
def compatibility_by_path(request: HttpRequest, path: str) -> tuple[int, dict[str, Any]]:
    """Return version/environment verification records for a published article."""
    del request
    normalized = path.strip("/")
    parts = normalized.split("/")
    slug = parts[-1]
    category_slug = parts[-2] if len(parts) > 1 else None

    article_query = Article.objects.filter(slug=slug, status=ArticleStatus.PUBLISHED)
    if category_slug:
        article_query = article_query.filter(category__slug=category_slug)
    article = article_query.first()
    if not article:
        return 200, {"success": False, "message": "Article not found", "records": []}

    records = ArticleCompatibility.objects.filter(article=article).select_related("verified_by")
    return 200, {
        "success": True,
        "article_id": str(article.id),
        "records": [_serialize(record) for record in records],
    }
