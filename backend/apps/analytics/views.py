"""Analytics API views using Django Ninja."""

import contextlib
import re
from collections import Counter
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlparse

from django.core.exceptions import ValidationError
from django.db.models import Avg, Count, F, Q, QuerySet
from django.db.models.functions import Lower, Trunc, TruncDate
from django.http import HttpRequest
from django.utils import timezone
from ninja import Router
from ninja.errors import HttpError

from apps.wiki.models import Article, ArticleStatus

from .models import ArticleView, Event, PageView, SearchQuery
from .schemas import (
    ArticleViewRequest,
    EngagementRequest,
    EventRequest,
    PageViewRequest,
    SearchClickRequest,
    SearchQueryRequest,
)

router = Router(tags=["Analytics"])

BOT_PATTERN = re.compile(
    r"bot|spider|crawl|slurp|headless|lighthouse|preview|facebookexternalhit|"
    r"python-requests|curl|wget|httpclient|monitor",
    re.IGNORECASE,
)
# Time on page beyond this is an idle tab, not reading.
MAX_ENGAGED_SECONDS = 3600


def get_client_ip(request: HttpRequest) -> str | None:
    """Extract client IP from request."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def parse_user_agent(user_agent: str) -> dict[str, str]:
    """Parse user agent string to extract device info."""
    user_agent_lower = user_agent.lower()

    # Device type. Bots first: crawler user agents often claim to be mobile.
    if not user_agent or BOT_PATTERN.search(user_agent):
        device_type = "bot"
    elif "ipad" in user_agent_lower or "tablet" in user_agent_lower:
        device_type = "tablet"
    elif "android" in user_agent_lower and "mobile" not in user_agent_lower:
        device_type = "tablet"
    elif "mobile" in user_agent_lower or "android" in user_agent_lower:
        device_type = "mobile"
    else:
        device_type = "desktop"

    # Browser
    if "edg" in user_agent_lower:
        browser = "Edge"
    elif "opera" in user_agent_lower or "opr/" in user_agent_lower:
        browser = "Opera"
    elif "firefox" in user_agent_lower or "fxios" in user_agent_lower:
        browser = "Firefox"
    elif "chrome" in user_agent_lower or "crios" in user_agent_lower:
        browser = "Chrome"
    elif "safari" in user_agent_lower:
        browser = "Safari"
    else:
        browser = "Other"

    # OS. Check mobile platforms first: their user agents mention desktop ones.
    if "iphone" in user_agent_lower or "ipad" in user_agent_lower:
        os = "iOS"
    elif "android" in user_agent_lower:
        os = "Android"
    elif "windows" in user_agent_lower:
        os = "Windows"
    elif "mac os" in user_agent_lower or "macos" in user_agent_lower:
        os = "macOS"
    elif "linux" in user_agent_lower:
        os = "Linux"
    else:
        os = "Other"

    return {"device_type": device_type, "browser": browser, "os": os}


def _published_article(article_id: str | None) -> Article | None:
    if not article_id:
        return None
    try:
        return Article.objects.get(id=article_id, status=ArticleStatus.PUBLISHED)
    except (Article.DoesNotExist, ValueError, ValidationError):
        return None


# =============================================================================
# Public tracking endpoints (no auth required)
# =============================================================================


@router.post("/track/pageview")
def track_page_view(request: HttpRequest, data: PageViewRequest) -> dict[str, str | bool | None]:
    """Track a page view, and the article view when the page is an article."""
    user_agent = request.META.get("HTTP_USER_AGENT", "")
    ua_info = parse_user_agent(user_agent)
    if ua_info["device_type"] == "bot" or not data.session_id:
        return {"success": True, "tracked": False, "id": None}

    user = request.user if request.user.is_authenticated else None

    page_view = PageView.objects.create(
        path=data.path,
        full_url=data.full_url or "",
        referrer=data.referrer or None,
        user=user,
        session_id=data.session_id,
        user_agent=user_agent,
        ip_address=get_client_ip(request),
        device_type=ua_info["device_type"],
        browser=ua_info["browser"],
        os=ua_info["os"],
    )

    article = _published_article(data.article_id)
    if article:
        ArticleView.objects.create(
            article=article,
            page_view=page_view,
            user=user,
            session_id=data.session_id,
        )
        Article.objects.filter(id=article.id).update(view_count=F("view_count") + 1)

    return {"success": True, "tracked": True, "id": str(page_view.id)}


@router.post("/track/engagement")
def track_engagement(request: HttpRequest, data: EngagementRequest) -> dict[str, bool]:
    """Record visible time and scroll depth for a page view from the same session."""
    try:
        page_view = PageView.objects.get(id=data.page_view_id, session_id=data.session_id)
    except (PageView.DoesNotExist, ValueError, ValidationError):
        return {"success": False}

    seconds = min(data.seconds, MAX_ENGAGED_SECONDS)
    # The browser reports cumulative values, possibly more than once.
    page_view.time_on_page = max(page_view.time_on_page or 0, seconds)
    page_view.save(update_fields=["time_on_page"])

    article_view = getattr(page_view, "article_view", None)
    if article_view:
        article_view.time_on_article = max(article_view.time_on_article or 0, seconds)
        if data.scroll_depth is not None:
            article_view.scroll_depth = max(article_view.scroll_depth or 0, data.scroll_depth)
        article_view.save(update_fields=["time_on_article", "scroll_depth"])

    return {"success": True}


@router.post("/track/article")
def track_article_view(request: HttpRequest, data: ArticleViewRequest) -> dict[str, str | bool]:
    """Track an article view."""
    try:
        article = Article.objects.get(id=data.article_id)
    except Article.DoesNotExist:
        raise HttpError(404, "Article not found")

    user = request.user if request.user.is_authenticated else None

    article_view = ArticleView.objects.create(
        article=article,
        user=user,
        session_id=data.session_id,
        time_on_article=data.time_on_article,
        scroll_depth=data.scroll_depth,
    )

    # Update article view count
    Article.objects.filter(id=data.article_id).update(view_count=F("view_count") + 1)

    return {"success": True, "id": str(article_view.id)}


@router.post("/track/search")
def track_search_query(request: HttpRequest, data: SearchQueryRequest) -> dict[str, str | bool]:
    """Track a search query."""
    if parse_user_agent(request.META.get("HTTP_USER_AGENT", ""))["device_type"] == "bot":
        return {"success": True, "id": ""}

    user = request.user if request.user.is_authenticated else None

    search_query = SearchQuery.objects.create(
        query=data.query.strip(),
        results_count=data.results_count,
        user=user,
        session_id=data.session_id,
        category_filter=data.category_filter or "",
        type_filter=data.type_filter or "",
    )

    return {"success": True, "id": str(search_query.id)}


@router.post("/track/search-click")
def track_search_click(request: HttpRequest, data: SearchClickRequest) -> dict[str, bool]:
    """Track when a user clicks on a search result."""
    try:
        search_query = SearchQuery.objects.get(id=data.search_id)
        article = Article.objects.get(id=data.article_id)
    except (SearchQuery.DoesNotExist, Article.DoesNotExist, ValueError, ValidationError):
        raise HttpError(404, "Search query or article not found")

    # Keep the first click: it is the result the query actually led to.
    if search_query.clicked_result_id is None:
        search_query.clicked_result = article
        search_query.clicked_position = data.position
        search_query.save(update_fields=["clicked_result", "clicked_position"])

    return {"success": True}


@router.post("/track/event")
def track_event(request: HttpRequest, data: EventRequest) -> dict[str, str | bool]:
    """Track a custom event."""
    user = request.user if request.user.is_authenticated else None

    article = None
    if data.article_id:
        with contextlib.suppress(Article.DoesNotExist):
            article = Article.objects.get(id=data.article_id)

    event = Event.objects.create(
        event_type=data.event_type,
        event_action=data.event_action,
        event_category=data.event_category or "",
        event_label=data.event_label or "",
        event_value=data.event_value,
        page_path=data.page_path or "",
        article=article,
        user=user,
        session_id=data.session_id,
        metadata=data.metadata or {},
    )

    return {"success": True, "id": str(event.id)}


# =============================================================================
# Admin dashboard endpoints (requires admin role)
# =============================================================================

PERIODS: dict[str, tuple[timedelta, str]] = {
    "24h": (timedelta(hours=24), "hour"),
    "7d": (timedelta(days=7), "day"),
    "30d": (timedelta(days=30), "day"),
    "90d": (timedelta(days=90), "day"),
}


def require_admin(request: HttpRequest) -> None:
    """Check if user is admin."""
    if not request.user.is_authenticated:
        raise HttpError(401, "Authentication required")
    if not (request.user.is_staff or request.user.is_superuser):
        raise HttpError(403, "Admin access required")


def _human_page_views() -> QuerySet[PageView]:
    return PageView.objects.exclude(device_type="bot")


def _change(current: int, previous: int) -> float | None:
    """Percentage change, or None when there is nothing to compare against."""
    if previous == 0:
        return None
    return round((current - previous) / previous * 100, 1)


def _host(url: str | None) -> str:
    if not url:
        return ""
    host = (urlparse(url).hostname or "").lower()
    return host.removeprefix("www.")


def _bucket_starts(start: datetime, end: datetime, bucket: str) -> list[datetime]:
    """Every bucket boundary between start and end, in the current timezone."""
    current = timezone.localtime(start)
    if bucket == "hour":
        current = current.replace(minute=0, second=0, microsecond=0)
        step = timedelta(hours=1)
    else:
        current = current.replace(hour=0, minute=0, second=0, microsecond=0)
        step = timedelta(days=1)
    buckets = []
    while current <= end:
        buckets.append(current)
        current += step
    return buckets


def _series(
    page_views: QuerySet[PageView], start: datetime, end: datetime, bucket: str
) -> list[dict[str, Any]]:
    rows = (
        page_views.annotate(bucket=Trunc("created_at", bucket))
        .values("bucket")
        .annotate(views=Count("id"), visitors=Count("session_id", distinct=True))
    )
    by_bucket: dict[datetime, tuple[int, int]] = {
        timezone.localtime(row["bucket"]): (row["views"], row["visitors"]) for row in rows
    }
    return [
        {
            "t": moment.isoformat(),
            "page_views": by_bucket.get(moment, (0, 0))[0],
            "visitors": by_bucket.get(moment, (0, 0))[1],
        }
        for moment in _bucket_starts(start, end, bucket)
    ]


def _breakdown(page_views: QuerySet[PageView], field: str) -> list[dict[str, Any]]:
    rows = page_views.values(field).annotate(views=Count("id")).order_by("-views")[:8]
    return [{"name": row[field] or "Unknown", "views": row["views"]} for row in rows]


def _referrers(page_views: QuerySet[PageView]) -> list[dict[str, Any]]:
    """Group external referrers by site; own-site and empty referrers count as direct."""
    rows = (
        page_views.values("referrer", "full_url")
        .annotate(views=Count("id"))
        .order_by("-views")[:2000]
    )
    sources: Counter[str] = Counter()
    for row in rows:
        source = _host(row["referrer"])
        if not source or source == _host(row["full_url"]):
            source = "Direct or internal"
        sources[source] += row["views"]
    return [{"source": source, "views": views} for source, views in sources.most_common(10)]


def _top_articles(article_views: QuerySet[ArticleView]) -> list[dict[str, Any]]:
    rows = list(
        article_views.values("article")
        .annotate(
            views=Count("id"),
            visitors=Count("session_id", distinct=True),
            avg_seconds=Avg("time_on_article"),
            avg_scroll=Avg("scroll_depth"),
        )
        .order_by("-views")[:10]
    )
    articles = Article.objects.select_related("category").in_bulk([row["article"] for row in rows])
    results = []
    for row in rows:
        article = articles.get(row["article"])
        if article is None:
            continue
        results.append(
            {
                "article_id": str(article.id),
                "title": article.title,
                "url": article.full_url,
                "category": article.category.name if article.category else None,
                "views": row["views"],
                "visitors": row["visitors"],
                "avg_seconds": round(row["avg_seconds"]) if row["avg_seconds"] else None,
                "avg_scroll": round(row["avg_scroll"]) if row["avg_scroll"] else None,
            }
        )
    return results


def _search_report(searches: QuerySet[SearchQuery]) -> dict[str, Any]:
    normalised = searches.annotate(term=Lower("query"))
    top = (
        normalised.values("term")
        .annotate(
            count=Count("id"),
            clicks=Count("clicked_result"),
            avg_results=Avg("results_count"),
        )
        .order_by("-count")[:10]
    )
    zero = (
        normalised.filter(results_count=0)
        .values("term")
        .annotate(count=Count("id"))
        .order_by("-count")[:10]
    )
    return {
        "top": [
            {
                "query": row["term"],
                "count": row["count"],
                "click_rate": round(row["clicks"] / row["count"] * 100, 1),
                "avg_results": round(row["avg_results"] or 0),
            }
            for row in top
        ],
        "zero_results": [{"query": row["term"], "count": row["count"]} for row in zero],
    }


def _totals(start: datetime, end: datetime) -> dict[str, int]:
    page_views = _human_page_views().filter(created_at__gte=start, created_at__lt=end)
    return {
        "page_views": page_views.count(),
        "visitors": page_views.values("session_id").distinct().count(),
        "article_views": ArticleView.objects.filter(
            created_at__gte=start, created_at__lt=end
        ).count(),
        "searches": SearchQuery.objects.filter(created_at__gte=start, created_at__lt=end).count(),
    }


@router.get("/dashboard")
def get_analytics_dashboard(request: HttpRequest, period: str = "7d") -> dict[str, Any]:
    """Traffic, content and search report for one period, compared with the one before."""
    require_admin(request)
    if period not in PERIODS:
        raise HttpError(400, "Invalid period")
    length, bucket = PERIODS[period]

    end = timezone.now()
    start = end - length
    page_views = _human_page_views().filter(created_at__gte=start)
    article_views = ArticleView.objects.filter(created_at__gte=start)
    searches = SearchQuery.objects.filter(created_at__gte=start)

    current = _totals(start, end + timedelta(seconds=1))
    previous = _totals(start - length, start)
    engagement = article_views.aggregate(
        avg_seconds=Avg("time_on_article"), avg_scroll=Avg("scroll_depth")
    )
    search_counts = searches.aggregate(
        clicked=Count("id", filter=Q(clicked_result__isnull=False)),
        zero=Count("id", filter=Q(results_count=0)),
    )

    return {
        "success": True,
        "period": period,
        "bucket": bucket,
        "start": start.isoformat(),
        "end": end.isoformat(),
        "summary": {
            **current,
            "changes": {key: _change(current[key], previous[key]) for key in current},
            "avg_read_seconds": (
                round(engagement["avg_seconds"]) if engagement["avg_seconds"] else None
            ),
            "avg_scroll_depth": (
                round(engagement["avg_scroll"]) if engagement["avg_scroll"] else None
            ),
            "search_click_rate": (
                round(search_counts["clicked"] / current["searches"] * 100, 1)
                if current["searches"]
                else None
            ),
            "zero_result_searches": search_counts["zero"],
        },
        "series": _series(page_views, start, end, bucket),
        "top_pages": [
            {"path": row["path"], "views": row["views"], "visitors": row["visitors"]}
            for row in page_views.values("path")
            .annotate(views=Count("id"), visitors=Count("session_id", distinct=True))
            .order_by("-views")[:10]
        ],
        "top_articles": _top_articles(article_views),
        "referrers": _referrers(page_views),
        "devices": _breakdown(page_views, "device_type"),
        "browsers": _breakdown(page_views, "browser"),
        "operating_systems": _breakdown(page_views, "os"),
        "searches": _search_report(searches),
    }


@router.get("/realtime")
def get_realtime_analytics(
    request: HttpRequest,
) -> dict[str, bool | int | list[dict[str, str | int]] | str]:
    """Get real-time analytics (last 30 minutes)."""
    require_admin(request)

    thirty_mins_ago = timezone.now() - timedelta(minutes=30)
    recent = _human_page_views().filter(created_at__gte=thirty_mins_ago)

    active_sessions = recent.values("session_id").distinct().count()

    recent_views = recent.values("path").annotate(count=Count("id")).order_by("-count")[:5]

    return {
        "success": True,
        "active_users": active_sessions,
        "top_pages": [{"path": view["path"], "count": view["count"]} for view in recent_views],
        "timestamp": timezone.now().isoformat(),
    }


@router.get("/article/{article_id}")
def get_article_analytics(
    request: HttpRequest, article_id: str
) -> dict[str, bool | str | int | float | list[dict[str, str | int]] | None]:
    """Get analytics for a specific article."""
    require_admin(request)

    try:
        article = Article.objects.get(id=article_id)
    except Article.DoesNotExist:
        raise HttpError(404, "Article not found")

    # Last 30 days
    start_date = timezone.now().date() - timedelta(days=30)

    views_qs = ArticleView.objects.filter(
        article=article,
        created_at__date__gte=start_date,
    )

    daily_views = (
        views_qs.annotate(date=TruncDate("created_at"))
        .values("date")
        .annotate(count=Count("id"), unique=Count("session_id", distinct=True))
        .order_by("date")
    )

    total_views = views_qs.count()
    unique_visitors = views_qs.values("session_id").distinct().count()
    avg_time = views_qs.aggregate(avg=Avg("time_on_article"))["avg"]
    avg_scroll = views_qs.aggregate(avg=Avg("scroll_depth"))["avg"]

    return {
        "success": True,
        "article_id": str(article.id),
        "article_title": article.title,
        "total_views": total_views,
        "unique_visitors": unique_visitors,
        "avg_time_on_article": avg_time,
        "avg_scroll_depth": avg_scroll,
        "daily_views": list(daily_views),
    }
