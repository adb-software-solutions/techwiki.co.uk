"""Out-of-range page and per_page values are clamped instead of erroring."""

from __future__ import annotations

from django.test import SimpleTestCase, TestCase

from apps.wiki.views import MAX_PER_PAGE, clamp_pagination


class ClampPaginationTests(SimpleTestCase):
    def test_keeps_valid_values(self) -> None:
        self.assertEqual(clamp_pagination(3, 20), (3, 20))

    def test_raises_page_to_one(self) -> None:
        self.assertEqual(clamp_pagination(0, 20), (1, 20))
        self.assertEqual(clamp_pagination(-5, 20), (1, 20))

    def test_bounds_per_page(self) -> None:
        self.assertEqual(clamp_pagination(1, 0), (1, 1))
        self.assertEqual(clamp_pagination(1, 10_000), (1, MAX_PER_PAGE))


class ArticleListPaginationTests(TestCase):
    def test_page_zero_is_not_a_server_error(self) -> None:
        response = self.client.get("/api/wiki/articles", {"page": 0})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["page"], 1)

    def test_per_page_zero_is_not_a_server_error(self) -> None:
        response = self.client.get("/api/wiki/articles", {"per_page": 0})
        self.assertEqual(response.status_code, 200)
