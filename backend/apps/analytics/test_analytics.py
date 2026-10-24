"""Tests for analytics tracking and the admin report."""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

from django.test import TestCase
from django.utils import timezone

from apps.analytics.models import ArticleView, PageView, SearchQuery
from apps.analytics.views import parse_user_agent
from apps.wiki.models import Article, ArticleStatus, Category
from authentication.models import User

BROWSER = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/120 Safari/537"
GOOGLEBOT = (
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X) Mobile Safari/537.36 "
    "(compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
)


class AnalyticsTestCase(TestCase):
    def setUp(self) -> None:
        self.category = Category.objects.create(name="Linux", slug="linux")
        self.article = Article.objects.create(
            title="Fix it",
            slug="fix-it",
            content="Body",
            category=self.category,
            status=ArticleStatus.PUBLISHED,
        )

    def post(self, path: str, data: dict[str, Any], agent: str = BROWSER) -> dict[str, Any]:
        response = self.client.post(
            f"/api/analytics{path}",
            data=json.dumps(data),
            content_type="application/json",
            HTTP_USER_AGENT=agent,
        )
        self.assertEqual(response.status_code, 200)
        return response.json()


class UserAgentTests(TestCase):
    def test_crawler_claiming_mobile_is_a_bot(self) -> None:
        self.assertEqual(parse_user_agent(GOOGLEBOT)["device_type"], "bot")

    def test_headless_browser_and_empty_agent_are_bots(self) -> None:
        self.assertEqual(parse_user_agent("Mozilla/5.0 HeadlessChrome/120")["device_type"], "bot")
        self.assertEqual(parse_user_agent("")["device_type"], "bot")

    def test_iphone_is_mobile_ios_safari(self) -> None:
        info = parse_user_agent(
            "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Version/17.0 Mobile Safari/604.1"
        )
        self.assertEqual(info, {"device_type": "mobile", "browser": "Safari", "os": "iOS"})


class TrackingTests(AnalyticsTestCase):
    def test_pageview_with_article_records_article_view_and_count(self) -> None:
        result = self.post(
            "/track/pageview",
            {"path": "/linux/fix-it", "session_id": "s1", "article_id": str(self.article.id)},
        )
        self.assertTrue(result["tracked"])
        view = ArticleView.objects.get()
        self.assertEqual(str(view.page_view_id), result["id"])
        self.article.refresh_from_db()
        self.assertEqual(self.article.view_count, 1)

    def test_draft_article_id_is_not_counted(self) -> None:
        self.article.status = ArticleStatus.DRAFT
        self.article.save()
        self.post(
            "/track/pageview",
            {"path": "/x", "session_id": "s1", "article_id": str(self.article.id)},
        )
        self.assertFalse(ArticleView.objects.exists())

    def test_bots_are_ignored(self) -> None:
        result = self.post("/track/pageview", {"path": "/", "session_id": "s1"}, agent=GOOGLEBOT)
        self.assertFalse(result["tracked"])
        self.assertFalse(PageView.objects.exists())

    def test_engagement_keeps_maximum_and_requires_same_session(self) -> None:
        page_view_id = self.post(
            "/track/pageview",
            {"path": "/linux/fix-it", "session_id": "s1", "article_id": str(self.article.id)},
        )["id"]
        self.post(
            "/track/engagement",
            {"page_view_id": page_view_id, "session_id": "s1", "seconds": 40, "scroll_depth": 80},
        )
        self.post(
            "/track/engagement",
            {"page_view_id": page_view_id, "session_id": "s1", "seconds": 20, "scroll_depth": 30},
        )
        other = self.post(
            "/track/engagement",
            {"page_view_id": page_view_id, "session_id": "s2", "seconds": 999},
        )
        self.assertFalse(other["success"])
        view = ArticleView.objects.get()
        self.assertEqual((view.time_on_article, view.scroll_depth), (40, 80))
        self.assertEqual(PageView.objects.get().time_on_page, 40)

    def test_search_click_keeps_first_result(self) -> None:
        search_id = self.post(
            "/track/search", {"query": "Docker", "results_count": 2, "session_id": "s1"}
        )["id"]
        other = Article.objects.create(title="Other", slug="other", content="x")
        self.post(
            "/track/search-click",
            {"search_id": search_id, "article_id": str(self.article.id), "position": 1},
        )
        self.post(
            "/track/search-click",
            {"search_id": search_id, "article_id": str(other.id), "position": 2},
        )
        self.assertEqual(SearchQuery.objects.get().clicked_result, self.article)


class DashboardTests(AnalyticsTestCase):
    def setUp(self) -> None:
        super().setUp()
        self.admin = User.objects.create_user(
            email="admin@example.com",
            password="strong-test-password",
            first_name="Test",
            last_name="User",
            email_verified=True,
        )
        self.admin.is_staff = True
        self.admin.save(update_fields=["is_staff"])

    def dashboard(self, period: str = "7d") -> dict[str, Any]:
        self.client.force_login(self.admin)
        response = self.client.get(f"/api/analytics/dashboard?period={period}")
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_requires_admin(self) -> None:
        response = self.client.get("/api/analytics/dashboard")
        self.assertEqual(response.status_code, 401)

    def test_rejects_unknown_period(self) -> None:
        self.client.force_login(self.admin)
        self.assertEqual(self.client.get("/api/analytics/dashboard?period=x").status_code, 400)

    def test_report_totals_referrers_and_searches(self) -> None:
        for session, referrer in [
            ("a", "https://www.google.com/search"),
            ("a", "https://example.com/linux"),
            ("b", ""),
        ]:
            self.post(
                "/track/pageview",
                {
                    "path": "/linux/fix-it",
                    "full_url": "https://example.com/linux/fix-it",
                    "referrer": referrer,
                    "session_id": session,
                    "article_id": str(self.article.id),
                },
            )
        self.post("/track/pageview", {"path": "/", "session_id": "bot"}, agent=GOOGLEBOT)
        self.post("/track/search", {"query": "Nginx", "results_count": 0, "session_id": "a"})
        self.post("/track/search", {"query": "nginx", "results_count": 0, "session_id": "b"})

        # Last period's traffic, for the comparison.
        old = PageView.objects.create(path="/", session_id="old", device_type="desktop")
        PageView.objects.filter(id=old.id).update(created_at=timezone.now() - timedelta(days=10))

        report = self.dashboard()
        summary = report["summary"]
        self.assertEqual(summary["page_views"], 3)
        self.assertEqual(summary["visitors"], 2)
        self.assertEqual(summary["article_views"], 3)
        self.assertEqual(summary["changes"]["page_views"], 200.0)
        self.assertEqual(summary["zero_result_searches"], 2)
        self.assertEqual(
            report["referrers"],
            [
                {"source": "Direct or internal", "views": 2},
                {"source": "google.com", "views": 1},
            ],
        )
        self.assertEqual(report["searches"]["zero_results"], [{"query": "nginx", "count": 2}])
        self.assertEqual(report["top_articles"][0]["url"], "/linux/fix-it")
        self.assertEqual(len(report["series"]), 8)
        self.assertEqual(sum(point["page_views"] for point in report["series"]), 3)

    def test_hourly_series_for_24h(self) -> None:
        report = self.dashboard("24h")
        self.assertEqual(report["bucket"], "hour")
        self.assertEqual(len(report["series"]), 25)
