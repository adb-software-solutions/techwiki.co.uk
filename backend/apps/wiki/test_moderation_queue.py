"""Tests for the article status workflow and the moderation queue API."""

from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

from django.test import TestCase
from django.utils import timezone

from apps.wiki.models import (
    Article,
    ArticleSource,
    ArticleStatus,
    Category,
    ModerationLog,
    UserRole,
    WikiUserProfile,
)
from apps.wiki.workflow import WorkflowError, apply_transition, available_actions
from authentication.models import User


def _user(email: str, *, staff: bool = False, role: str | None = None) -> User:
    user = User.objects.create_user(
        email=email,
        password="strong-test-password",
        first_name=email.split("@", maxsplit=1)[0].title(),
        last_name="Tester",
        email_verified=True,
    )
    if staff:
        user.is_staff = True
        user.save(update_fields=["is_staff"])
    if role:
        WikiUserProfile.objects.create(user=user, role=role)
    return user


class WorkflowTests(TestCase):
    def setUp(self) -> None:
        self.author = _user("author@example.com")
        self.moderator = _user("moderator@example.com", role=UserRole.MODERATOR)
        self.category = Category.objects.create(name="Linux", slug="linux")
        self.article = Article.objects.create(
            title="Workflow",
            slug="workflow",
            content="Body",
            category=self.category,
            author=self.author,
        )

    def test_author_submits_and_withdraws_but_cannot_publish(self) -> None:
        self.assertEqual(
            apply_transition(self.article, "submit", self.author), ArticleStatus.PENDING_REVIEW
        )
        with self.assertRaisesMessage(WorkflowError, "Permission denied"):
            apply_transition(self.article, "publish", self.author)
        self.assertEqual(
            apply_transition(self.article, "withdraw", self.author), ArticleStatus.DRAFT
        )

    def test_other_contributors_cannot_touch_the_article(self) -> None:
        stranger = _user("stranger@example.com")
        with self.assertRaisesMessage(WorkflowError, "Permission denied"):
            apply_transition(self.article, "submit", stranger)

    def test_review_decisions_need_a_note(self) -> None:
        apply_transition(self.article, "submit", self.author)
        with self.assertRaisesMessage(WorkflowError, "note"):
            apply_transition(self.article, "request_changes", self.moderator)
        apply_transition(self.article, "request_changes", self.moderator, "Add a Verify section")

        self.article.refresh_from_db()
        self.assertEqual(self.article.status, ArticleStatus.CHANGES_REQUESTED)
        self.assertEqual(self.article.moderation_notes, "Add a Verify section")
        self.assertEqual(self.article.moderator, self.moderator)

    def test_approve_publishes_and_everything_is_logged(self) -> None:
        apply_transition(self.article, "submit", self.author)
        apply_transition(self.article, "approve", self.moderator)
        self.article.refresh_from_db()
        self.assertEqual(self.article.status, ArticleStatus.PUBLISHED)
        self.assertIsNotNone(self.article.published_at)

        apply_transition(self.article, "unpublish", self.moderator, "Outdated")
        self.assertEqual(
            list(
                self.article.moderation_logs.order_by("created_at").values_list("action", flat=True)
            ),
            ["submit", "publish", "unpublish"],
        )

    def test_invalid_transitions_explain_why(self) -> None:
        with self.assertRaisesMessage(WorkflowError, "Cannot unpublish an article that is draft"):
            apply_transition(self.article, "unpublish", self.moderator)
        with self.assertRaisesMessage(WorkflowError, "Invalid action"):
            apply_transition(self.article, "teleport", self.moderator)

    def test_available_actions_reflect_role_and_status(self) -> None:
        self.assertEqual(available_actions(self.article, self.author), ["submit", "archive"])
        self.assertIn("publish", available_actions(self.article, self.moderator))
        apply_transition(self.article, "archive", self.author)
        self.assertEqual(available_actions(self.article, self.author), ["restore"])


class ModerationQueueApiTests(TestCase):
    def setUp(self) -> None:
        self.moderator = _user("queue-mod@example.com", staff=True)
        self.author = _user("queue-author@example.com")
        self.category = Category.objects.create(name="Linux", slug="linux")
        self.older = self._article("older", ArticleStatus.PENDING_REVIEW)
        self.newer = self._article("newer", ArticleStatus.PENDING_REVIEW)
        ModerationLog.objects.create(
            article=self.older,
            moderator=self.author,
            action="submit",
            old_status=ArticleStatus.DRAFT,
            new_status=ArticleStatus.PENDING_REVIEW,
        )
        ModerationLog.objects.filter(article=self.older).update(
            created_at=timezone.now() - timedelta(days=2)
        )
        self.automated = self._article("automated", ArticleStatus.DRAFT, ArticleSource.AUTHORING)
        self.client.force_login(self.moderator)

    def _article(self, slug: str, status: str, source: str = ArticleSource.WEB) -> Article:
        return Article.objects.create(
            title=slug.title(),
            slug=slug,
            content="Body",
            category=self.category,
            author=self.author,
            status=status,
            source=source,
        )

    def _queue(self, tab: str) -> dict[str, Any]:
        response = self.client.get("/api/wiki/moderation/queue", {"tab": tab})
        self.assertEqual(response.status_code, 200)
        return response.json()

    def _act(self, article: Article, action: str, notes: str = "") -> dict[str, Any]:
        response = self.client.post(
            f"/api/wiki/moderation/{article.id}",
            data=json.dumps({"action": action, "notes": notes}),
            content_type="application/json",
        )
        return response.json()

    def test_pending_tab_is_oldest_first_with_counts(self) -> None:
        queue = self._queue("pending")
        self.assertEqual([item["slug"] for item in queue["items"]], ["older", "newer"])
        self.assertEqual(
            queue["counts"],
            {"pending": 2, "changes_requested": 0, "automation": 1, "decided": 0},
        )

    def test_automation_tab_lists_authoring_drafts(self) -> None:
        queue = self._queue("automation")
        self.assertEqual([item["slug"] for item in queue["items"]], ["automated"])
        self.assertEqual(queue["items"][0]["source"], ArticleSource.AUTHORING)

    def test_decision_moves_to_decided_and_points_at_next(self) -> None:
        result = self._act(self.older, "publish")
        self.assertTrue(result["success"])
        self.assertEqual(result["next_article_id"], str(self.newer.id))

        decided = self._queue("decided")
        self.assertEqual(decided["items"][0]["action"], "publish")
        self.assertEqual(decided["items"][0]["article"]["slug"], "older")
        self.assertEqual(self._queue("pending")["counts"]["pending"], 1)

    def test_request_changes_without_note_is_refused(self) -> None:
        result = self._act(self.newer, "request_changes")
        self.assertFalse(result["success"])
        self.assertIn("note", result["message"])

    def test_review_detail_has_position_history_and_actions(self) -> None:
        response = self.client.get(f"/api/wiki/moderation/articles/{self.newer.id}").json()
        self.assertEqual(response["queue"], {"tab": "pending", "position": 2, "total": 2})
        self.assertIn("request_changes", response["actions"])
        self.assertEqual(response["history"], [])

    def test_non_moderators_are_refused(self) -> None:
        self.client.force_login(self.author)
        self.assertFalse(self._queue("pending")["success"])
        self.assertFalse(self._act(self.older, "publish")["success"])


class CreateArticleStatusTests(TestCase):
    def setUp(self) -> None:
        self.category = Category.objects.create(name="Linux", slug="linux")

    def _create(self, user: User, **extra: object) -> dict[str, Any]:
        self.client.force_login(user)
        payload = {
            "title": f"Created {Article.objects.count()}",
            "content": "Body",
            "category_id": str(self.category.id),
            **extra,
        }
        return self.client.post(
            "/api/wiki/articles", data=json.dumps(payload), content_type="application/json"
        ).json()

    def test_staff_can_save_a_draft_instead_of_publishing(self) -> None:
        staff = _user("create-staff@example.com", staff=True)
        self.assertEqual(self._create(staff, status="draft")["article"]["status"], "draft")
        self.assertEqual(self._create(staff)["article"]["status"], "published")

    def test_contributor_submits_and_cannot_force_publish(self) -> None:
        contributor = _user("create-contrib@example.com")
        self.assertEqual(self._create(contributor)["article"]["status"], "pending_review")
        denied = self._create(contributor, status="published")
        self.assertFalse(denied["success"])
        self.assertEqual(Article.objects.count(), 1)


class MyArticlesTests(TestCase):
    def test_search_and_pagination(self) -> None:
        user = _user("mine@example.com")
        for title in ("Nginx tuning", "Docker basics"):
            Article.objects.create(
                title=title, slug=title.lower().replace(" ", "-"), content="Body", author=user
            )
        self.client.force_login(user)
        result = self.client.get("/api/wiki/me/articles", {"q": "docker"}).json()
        self.assertEqual([a["title"] for a in result["articles"]], ["Docker basics"])
        self.assertEqual(result["total_pages"], 1)
