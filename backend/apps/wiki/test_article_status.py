"""Tests for status changes made through the web article update endpoint."""

from __future__ import annotations

import json
from typing import Any

from django.test import TestCase

from apps.wiki.models import Article, ArticleStatus, Category, UserRole, WikiUserProfile
from authentication.models import User


class ArticleUpdateStatusTests(TestCase):
    def setUp(self) -> None:
        self.author = User.objects.create_user(
            email="status-author@example.com",
            password="strong-test-password",
            first_name="Status",
            last_name="Author",
            email_verified=True,
        )
        self.category = Category.objects.create(name="Linux", slug="linux")
        self.article = Article.objects.create(
            title="Status test",
            slug="status-test",
            content="Body",
            category=self.category,
            author=self.author,
            status=ArticleStatus.DRAFT,
        )

    def _update(self, user: User, payload: dict[str, object]) -> dict[str, Any]:
        self.client.force_login(user)
        response = self.client.put(
            f"/api/wiki/articles/{self.article.id}",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.article.refresh_from_db()
        return response.json()

    def test_staff_author_can_publish_a_draft(self) -> None:
        self.author.is_staff = True
        self.author.save(update_fields=["is_staff"])

        result = self._update(self.author, {"content": "Final", "status": "published"})

        self.assertTrue(result["success"])
        self.assertEqual(self.article.status, ArticleStatus.PUBLISHED)
        self.assertIsNotNone(self.article.published_at)
        public = self.client.get("/api/wiki/articles/by-path/linux/status-test")
        self.assertTrue(public.json()["success"])

    def test_trusted_contributor_can_publish(self) -> None:
        WikiUserProfile.objects.create(user=self.author, role=UserRole.TRUSTED_CONTRIBUTOR)

        result = self._update(self.author, {"status": "published"})

        self.assertTrue(result["success"])
        self.assertEqual(self.article.status, ArticleStatus.PUBLISHED)

    def test_contributor_cannot_publish_but_can_submit_for_review(self) -> None:
        denied = self._update(self.author, {"content": "Changed", "status": "published"})
        self.assertFalse(denied["success"])
        self.assertEqual(self.article.status, ArticleStatus.DRAFT)
        self.assertEqual(self.article.content, "Body")

        submitted = self._update(self.author, {"status": "pending_review"})
        self.assertTrue(submitted["success"])
        self.assertEqual(self.article.status, ArticleStatus.PENDING_REVIEW)

    def test_moderation_statuses_are_rejected(self) -> None:
        result = self._update(self.author, {"status": "approved"})

        self.assertEqual(result["message"], "Invalid status")
        self.assertEqual(self.article.status, ArticleStatus.DRAFT)

    def test_unchanged_status_is_a_plain_save(self) -> None:
        result = self._update(self.author, {"content": "Saved", "status": "draft"})

        self.assertTrue(result["success"])
        self.assertEqual(self.article.status, ArticleStatus.DRAFT)
        self.assertEqual(self.article.content, "Saved")
