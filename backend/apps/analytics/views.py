"""Analytics API views using Django Ninja."""

import contextlib
from datetime import timedelta

from django.db.models import Avg, Count, F
from django.db.models.functions import TruncDate
from django.http import HttpRequest
from django.utils import timezone
from ninja import Router
from ninja.errors import HttpError

from apps.wiki.models import Article

from .models import ArticleView, DailyStats, Event, PageView, SearchQuery
from .schemas import (
    AnalyticsDashboardResponse,
    AnalyticsSummaryResponse,
    ArticleViewRequest,
    DailyStatsResponse,
    DeviceBreakdownResponse,
    EventRequest,
    PageViewRequest,
    SearchClickRequest,
    SearchQueryRequest,
    TopArticleResponse,
    TopSearchQueryResponse,
    TrafficSourceResponse,
)

router = Router(tags=["Analytics"])


def get_client_ip(request: HttpRequest) -> str | None:
    """Extract client IP from request."""
    x_forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def parse_user_agent(user_agent: str) -> dict[str, str]:
    """Parse user agent string to extract device info."""
    user_agent_lower = user_agent.lower()

    # Device type
    if "mobile" in user_agent_lower or "android" in user_agent_lower:
        if "tablet" in user_agent_lower or "ipad" in user_agent_lower:
            device_type = "tablet"
        else:
            device_type = "mobile"
    elif "bot" in user_agent_lower or "spider" in user_agent_lower or "crawler" in user_agent_lower:
        device_type = "bot"
    else:
        device_type = "desktop"

    # Browser
    if "chrome" in user_agent_lower and "edg" not in user_agent_lower:
        browser = "Chrome"
    elif "firefox" in user_agent_lower:
        browser = "Firefox"
    elif "safari" in user_agent_lower and "chrome" not in user_agent_lower:
        browser = "Safari"
    elif "edg" in user_agent_lower:
        browser = "Edge"
    elif "opera" in user_agent_lower or "opr" in user_agent_lower:
        browser = "Opera"
    else:
        browser = "Other"

    # OS
    if "windows" in user_agent_lower:
        os = "Windows"
    elif "mac os" in user_agent_lower or "macos" in user_agent_lower:
        os = "macOS"
    elif "linux" in user_agent_lower:
        os = "Linux"
    elif "android" in user_agent_lower:
        os = "Android"
    elif "iphone" in user_agent_lower or "ipad" in user_agent_lower:
        os = "iOS"
    else:
        os = "Other"

    return {"device_type": device_type, "browser": browser, "os": os}


# =============================================================================
# Public tracking endpoints (no auth required)
# =============================================================================


@router.post("/track/pageview")
def track_page_view(request: HttpRequest, data: PageViewRequest) -> dict[str, str | bool]:
    """Track a page view."""
    user_agent = request.META.get("HTTP_USER_AGENT", "")
    ua_info = parse_user_agent(user_agent)

    # Get user if authenticated
    user = request.user if request.user.is_authenticated else None

    page_view = PageView.objects.create(
        path=data.path,
        full_url=data.full_url or "",
        referrer=data.referrer,
        user=user,
        session_id=data.session_id,
        user_agent=user_agent,
        ip_address=get_client_ip(request),
        device_type=ua_info["device_type"],
        browser=ua_info["browser"],
        os=ua_info["os"],
        time_on_page=data.time_on_page,
    )

    return {"success": True, "id": str(page_view.id)}


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
    user = request.user if request.user.is_authenticated else None

    search_query = SearchQuery.objects.create(
        query=data.query,
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
    except (SearchQuery.DoesNotExist, Article.DoesNotExist):
        raise HttpError(404, "Search query or article not found")

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


def require_admin(request: HttpRequest) -> None:
    """Check if user is admin."""
    if not request.user.is_authenticated:
        raise HttpError(401, "Authentication required")
    if not (request.user.is_staff or request.user.is_superuser):
        raise HttpError(403, "Admin access required")


@router.get("/dashboard", response=AnalyticsDashboardResponse)
def get_analytics_dashboard(
    request: HttpRequest,
    period: str = "week",  # "today", "week", "month"
) -> AnalyticsDashboardResponse:
    """Get comprehensive analytics dashboard data."""
    require_admin(request)

    # Calculate date range
    today = timezone.now().date()
    if period == "today":
        start_date = today
        prev_start = today - timedelta(days=1)
        prev_end = today - timedelta(days=1)
    elif period == "week":
        start_date = today - timedelta(days=7)
        prev_start = today - timedelta(days=14)
        prev_end = today - timedelta(days=8)
    else:  # month
        start_date = today - timedelta(days=30)
        prev_start = today - timedelta(days=60)
        prev_end = today - timedelta(days=31)

    # Get current period stats
    current_views = PageView.objects.filter(created_at__date__gte=start_date)
    current_article_views = ArticleView.objects.filter(created_at__date__gte=start_date)
    current_searches = SearchQuery.objects.filter(created_at__date__gte=start_date)

    total_page_views = current_views.count()
    unique_visitors = current_views.values("session_id").distinct().count()
    total_article_views = current_article_views.count()
    total_searches = current_searches.count()
    avg_time = current_article_views.aggregate(avg=Avg("time_on_article"))["avg"]

    # Get previous period stats for comparison
    prev_views = PageView.objects.filter(
        created_at__date__gte=prev_start,
        created_at__date__lte=prev_end,
    )
    prev_article_views = ArticleView.objects.filter(
        created_at__date__gte=prev_start,
        created_at__date__lte=prev_end,
    )
    prev_searches = SearchQuery.objects.filter(
        created_at__date__gte=prev_start,
        created_at__date__lte=prev_end,
    )

    prev_page_views = prev_views.count()
    prev_visitors = prev_views.values("session_id").distinct().count()
    prev_total_article = prev_article_views.count()
    prev_total_searches = prev_searches.count()

    # Calculate percentage changes
    def calc_change(current: int, previous: int) -> float:
        if previous == 0:
            return 100.0 if current > 0 else 0.0
        return ((current - previous) / previous) * 100

    summary = AnalyticsSummaryResponse(
        period=period,
        total_page_views=total_page_views,
        unique_visitors=unique_visitors,
        total_article_views=total_article_views,
        total_searches=total_searches,
        avg_time_on_article=avg_time,
        bounce_rate=None,  # Would need more complex calculation
        page_views_change=calc_change(total_page_views, prev_page_views),
        visitors_change=calc_change(unique_visitors, prev_visitors),
        article_views_change=calc_change(total_article_views, prev_total_article),
        searches_change=calc_change(total_searches, prev_total_searches),
    )

    # Get daily stats
    daily_stats_qs = DailyStats.objects.filter(date__gte=start_date).order_by("-date")
    daily_stats = [
        DailyStatsResponse(
            date=stat.date,
            total_page_views=stat.total_page_views,
            unique_visitors=stat.unique_visitors,
            total_article_views=stat.total_article_views,
            unique_articles_viewed=stat.unique_articles_viewed,
            avg_time_on_article=stat.avg_time_on_article,
            total_searches=stat.total_searches,
            searches_with_results=stat.searches_with_results,
            searches_with_clicks=stat.searches_with_clicks,
            new_users=stat.new_users,
            returning_users=stat.returning_users,
            logged_in_users=stat.logged_in_users,
            desktop_views=stat.desktop_views,
            mobile_views=stat.mobile_views,
            tablet_views=stat.tablet_views,
            articles_created=stat.articles_created,
            articles_published=stat.articles_published,
            articles_updated=stat.articles_updated,
            total_events=stat.total_events,
            copy_link_clicks=stat.copy_link_clicks,
            edit_button_clicks=stat.edit_button_clicks,
        )
        for stat in daily_stats_qs
    ]

    # Get top articles
    top_articles_qs = (
        current_article_views.values("article")
        .annotate(
            view_count=Count("id"),
            unique_visitors=Count("session_id", distinct=True),
        )
        .order_by("-view_count")[:10]
    )

    top_articles = []
    for i, item in enumerate(top_articles_qs, 1):
        try:
            article = Article.objects.get(id=item["article"])
            top_articles.append(
                TopArticleResponse(
                    rank=i,
                    article_id=str(article.id),
                    article_title=article.title,
                    article_slug=article.slug,
                    category_name=article.category.name if article.category else None,
                    view_count=item["view_count"],
                    unique_visitors=item["unique_visitors"],
                )
            )
        except Article.DoesNotExist:
            continue

    # Get top searches
    top_searches_qs = (
        current_searches.values("query")
        .annotate(
            search_count=Count("id"),
            clicks=Count("clicked_result"),
        )
        .order_by("-search_count")[:10]
    )

    top_searches = [
        TopSearchQueryResponse(
            rank=i,
            query=item["query"],
            search_count=item["search_count"],
            click_through_rate=(
                (item["clicks"] / item["search_count"]) * 100 if item["search_count"] > 0 else None
            ),
        )
        for i, item in enumerate(top_searches_qs, 1)
    ]

    # Get traffic sources (from referrer)
    referrer_stats = (
        current_views.exclude(referrer__isnull=True)
        .exclude(referrer="")
        .values("referrer")
        .annotate(count=Count("id"))
        .order_by("-count")[:10]
    )

    total_with_referrer = sum(r["count"] for r in referrer_stats)
    traffic_sources = [
        TrafficSourceResponse(
            source=(item["referrer"] or "")[:100],
            count=item["count"],
            percentage=(item["count"] / total_with_referrer * 100)
            if total_with_referrer > 0
            else 0,
        )
        for item in referrer_stats
    ]

    # Get device breakdown
    device_counts = current_views.values("device_type").annotate(count=Count("id"))
    device_dict = {d["device_type"]: d["count"] for d in device_counts}

    desktop = device_dict.get("desktop", 0)
    mobile = device_dict.get("mobile", 0)
    tablet = device_dict.get("tablet", 0)
    total_devices = desktop + mobile + tablet or 1

    device_breakdown = DeviceBreakdownResponse(
        desktop=desktop,
        mobile=mobile,
        tablet=tablet,
        desktop_percentage=(desktop / total_devices) * 100,
        mobile_percentage=(mobile / total_devices) * 100,
        tablet_percentage=(tablet / total_devices) * 100,
    )

    return AnalyticsDashboardResponse(
        summary=summary,
        daily_stats=daily_stats,
        top_articles=top_articles,
        top_searches=top_searches,
        traffic_sources=traffic_sources,
        device_breakdown=device_breakdown,
    )


@router.get("/realtime")
def get_realtime_analytics(
    request: HttpRequest,
) -> dict[str, bool | int | list[dict[str, str | int]] | str]:
    """Get real-time analytics (last 30 minutes)."""
    require_admin(request)

    thirty_mins_ago = timezone.now() - timedelta(minutes=30)

    active_sessions = (
        PageView.objects.filter(created_at__gte=thirty_mins_ago)
        .values("session_id")
        .distinct()
        .count()
    )

    recent_views = (
        PageView.objects.filter(created_at__gte=thirty_mins_ago)
        .values("path")
        .annotate(count=Count("id"))
        .order_by("-count")[:5]
    )

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
