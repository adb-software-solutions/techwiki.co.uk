"""Tests for article revision numbering across the web and authoring APIs."""

from __future__ import annotations

import json
import os
from typing import Any
from unittest.mock import patch

from django.test import TestCase

from apps.wiki.authoring_api import ARTICLE_CREATE, ARTICLE_UPDATE
from apps.wiki.authoring_models import AuthoringApiToken
from apps.wiki.models import Article, ArticleRevision, Category
from authentication.models import User


class ArticleRevisionNumberingTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            email="revision-owner@example.com",
            password="strong-test-password",
            first_name="Revision",
            last_name="Owner",
            email_verified=True,
        )
        self.category = Category.objects.create(name="Linux", slug="linux")
        self.client.force_login(self.user)

    def _json(self, method: str, path: str, payload: dict[str, object], **headers: Any) -> Any:
        return getattr(self.client, method)(
            path,
            data=json.dumps(payload),
            content_type="application/json",
            **headers,
        )

    def _web_update(self, article_id: str, content: str) -> dict[str, Any]:
        response = self._json("put", f"/api/wiki/articles/{article_id}", {"content": content})
        self.assertEqual(response.status_code, 200)
        return response.json()

    def _versions(self, article_id: str) -> list[int]:
        return sorted(
            ArticleRevision.objects.filter(article_id=article_id).values_list("version", flat=True)
        )

    def test_web_created_article_can_be_edited_repeatedly(self) -> None:
        created = self._json(
            "post",
            "/api/wiki/articles",
            {
                "title": "Revision test",
                "content": "First",
                "category_id": str(self.category.id),
            },
        ).json()
        article_id = created["article"]["id"]

        self.assertTrue(self._web_update(article_id, "Second")["success"])
        self.assertTrue(self._web_update(article_id, "Third")["success"])

        self.assertEqual(self._versions(article_id), [1, 2, 3])
        self.assertEqual(
            ArticleRevision.objects.get(article_id=article_id, version=3).content, "Third"
        )

    def test_authoring_draft_can_be_edited_on_the_website(self) -> None:
        _token, raw = AuthoringApiToken.issue(
            user=self.user, name="Revision", scopes=[ARTICLE_CREATE, ARTICLE_UPDATE]
        )
        bearer = {"HTTP_AUTHORIZATION": f"Bearer {raw}"}
        with patch.dict(os.environ, {"TECHWIKI_AUTHORING_USER_ID": str(self.user.id)}):
            created = self._json(
                "post",
                "/api/authoring/v1/articles",
                {
                    "title": "Authored draft",
                    "content": "# Fix\n\nRun the diagnostic command and verify the result.",
                    "category_id": str(self.category.id),
                },
                **bearer,
            ).json()
            article_id = created["article"]["id"]
            updated = self._json(
                "patch",
                f"/api/authoring/v1/articles/{article_id}",
                {"content": "# Fix\n\nRun the updated command and verify the result."},
                **bearer,
            )
        self.assertEqual(updated.status_code, 200)

        self.assertTrue(self._web_update(article_id, "Edited on the website")["success"])
        self.assertEqual(self._versions(article_id), [1, 2, 3])
        self.assertEqual(Article.objects.get(id=article_id).version, 3)
