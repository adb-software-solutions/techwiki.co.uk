"""Tests for category management and wiki profile updates."""

from __future__ import annotations

import json
import struct
import tempfile
import zlib
from typing import Any

from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase, override_settings

from apps.wiki.models import Article, ArticleStatus, Category, UserRole, WikiUserProfile
from authentication.models import User


def _user(email: str, *, role: str = UserRole.CONTRIBUTOR) -> User:
    user = User.objects.create_user(
        email=email,
        password="strong-test-password",
        first_name="Test",
        last_name="User",
        email_verified=True,
    )
    WikiUserProfile.objects.create(user=user, role=role)
    return user


class CategoryAdminTests(TestCase):
    def setUp(self) -> None:
        self.moderator = _user("mod@example.com", role=UserRole.MODERATOR)
        self.client.force_login(self.moderator)

    def send(self, method: str, path: str, data: dict[str, Any] | None = None) -> dict[str, Any]:
        if method == "get":
            response = self.client.get(f"/api/wiki{path}")
        else:
            response = getattr(self.client, method)(
                f"/api/wiki{path}",
                data=json.dumps(data or {}),
                content_type="application/json",
            )
        self.assertEqual(response.status_code, 200)
        return response.json()

    def test_create_from_json(self) -> None:
        result = self.send("post", "/admin/categories", {"name": "Web Servers", "icon": "🌐"})
        self.assertTrue(result["success"])
        category = Category.objects.get()
        self.assertEqual((category.name, category.slug), ("Web Servers", "web-servers"))

    def test_blank_and_duplicate_names_are_rejected(self) -> None:
        self.assertFalse(self.send("post", "/admin/categories", {"name": " "})["success"])
        Category.objects.create(name="Linux", slug="linux")
        result = self.send("post", "/admin/categories", {"name": "linux"})
        self.assertEqual(result["message"], "A category with this name already exists")

    def test_update_hides_and_rejects_cycles(self) -> None:
        parent = Category.objects.create(name="Linux", slug="linux")
        child = Category.objects.create(name="Debian", slug="debian", parent=parent)
        cycle = self.send(
            "put", f"/admin/categories/{parent.id}", {"name": "Linux", "parent_id": str(child.id)}
        )
        self.assertEqual(cycle["message"], "A category cannot be inside itself")

        self.send(
            "put",
            f"/admin/categories/{parent.id}",
            {"name": "Linux", "order": 3, "is_active": False},
        )
        parent.refresh_from_db()
        self.assertEqual((parent.order, parent.is_active), (3, False))

    def test_admin_list_includes_hidden_and_draft_counts(self) -> None:
        category = Category.objects.create(name="Linux", slug="linux", is_active=False)
        Article.objects.create(title="A", slug="a", content="x", category=category)
        Article.objects.create(
            title="B", slug="b", content="x", category=category, status=ArticleStatus.PUBLISHED
        )
        listed = self.send("get", "/admin/categories")["categories"]
        self.assertEqual(
            (listed[0]["article_count"], listed[0]["total_articles"], listed[0]["is_active"]),
            (1, 2, False),
        )

    def test_cannot_delete_category_with_drafts(self) -> None:
        category = Category.objects.create(name="Linux", slug="linux")
        Article.objects.create(title="A", slug="a", content="x", category=category)
        self.assertFalse(self.send("delete", f"/admin/categories/{category.id}")["success"])
        self.assertTrue(Category.objects.exists())

    def test_contributors_cannot_manage(self) -> None:
        self.client.force_login(_user("writer@example.com"))
        self.assertFalse(self.send("post", "/admin/categories", {"name": "X"})["success"])
        self.assertFalse(self.send("get", "/admin/categories")["success"])


class ProfileUpdateTests(TestCase):
    def test_post_saves_fields(self) -> None:
        user = _user("writer@example.com")
        self.client.force_login(user)
        response = self.client.post(
            "/api/wiki/me", {"bio": "Writes about Linux", "github": "octocat"}
        )
        self.assertTrue(response.json()["success"])
        profile = WikiUserProfile.objects.get(user=user)
        self.assertEqual((profile.bio, profile.github), ("Writes about Linux", "octocat"))

    def test_photo_upload_and_removal(self) -> None:
        def chunk(kind: bytes, data: bytes) -> bytes:
            body = kind + data
            return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body))

        png = (
            b"\x89PNG\r\n\x1a\n"
            + chunk(b"IHDR", struct.pack(">IIBBBBB", 1, 1, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(b"\x00\xff\x00\x00"))
            + chunk(b"IEND", b"")
        )
        user = _user("photo@example.com")
        self.client.force_login(user)
        with tempfile.TemporaryDirectory() as media, override_settings(MEDIA_ROOT=media):
            uploaded = self.client.post(
                "/api/wiki/me",
                {"photo": SimpleUploadedFile("me.png", png, content_type="image/png")},
            ).json()
            self.assertTrue(uploaded["user"]["photo"])
            removed = self.client.post("/api/wiki/me", {"remove_photo": "true"}).json()
            self.assertIsNone(removed["user"]["photo"])
