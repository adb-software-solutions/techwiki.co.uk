"""Edge-case and security-path coverage for private TechWiki authoring."""

from __future__ import annotations

import base64
import hashlib
import json
import os
from datetime import timedelta
from typing import Any
from unittest.mock import patch
from urllib.parse import parse_qs, urlencode, urlparse

from django.contrib import admin
from django.test import RequestFactory, TestCase
from django.utils import timezone

from apps.wiki.authoring_admin import (
    AuthoringApiTokenAdmin,
    AuthoringAuditLogAdmin,
    AuthoringOAuthClientAdmin,
    AuthoringOAuthCodeAdmin,
    AuthoringOAuthRefreshTokenAdmin,
)
from apps.wiki.authoring_api import (
    ARTICLE_CREATE,
    ARTICLE_READ,
    ARTICLE_UPDATE,
    CATEGORY_CREATE,
    CATEGORY_READ,
    COMPATIBILITY_WRITE,
    TAG_CREATE,
    TAG_READ,
)
from apps.wiki.authoring_models import (
    AuthoringApiToken,
    AuthoringAuditLog,
    AuthoringOAuthClient,
    AuthoringOAuthCode,
    AuthoringOAuthRefreshToken,
)
from apps.wiki.models import Article, ArticleStatus, Category, Tag
from authentication.models import User


class PrivateAuthoringEdgeCoverageTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            email="edge-owner@example.com",
            password="strong-test-password",
            first_name="Edge",
            last_name="Owner",
            email_verified=True,
        )
        self.owner_patch = patch.dict(
            os.environ,
            {"TECHWIKI_AUTHORING_USER_ID": str(self.user.id)},
        )
        self.owner_patch.start()
        self.addCleanup(self.owner_patch.stop)
        self.scopes = [
            ARTICLE_READ,
            ARTICLE_CREATE,
            ARTICLE_UPDATE,
            CATEGORY_READ,
            CATEGORY_CREATE,
            TAG_READ,
            TAG_CREATE,
            COMPATIBILITY_WRITE,
        ]
        self.token, self.raw_token = AuthoringApiToken.issue(
            user=self.user,
            name="Edge coverage",
            scopes=self.scopes,
        )
        self.category = Category.objects.create(name="Linux", slug="linux")
        self.tag = Tag.objects.create(name="Docker", slug="docker")

    @property
    def bearer(self) -> dict[str, Any]:
        return {"HTTP_AUTHORIZATION": f"Bearer {self.raw_token}"}

    def _json_request(
        self,
        method: str,
        path: str,
        payload: dict[str, object],
        **headers: Any,
    ) -> Any:
        caller = getattr(self.client, method)
        return caller(
            path,
            data=json.dumps(payload),
            content_type="application/json",
            **headers,
        )

    def _oauth_client(
        self,
        scopes: list[str] | None = None,
    ) -> tuple[AuthoringOAuthClient, str, str, str]:
        client, secret = AuthoringOAuthClient.issue(
            name="Edge OAuth",
            redirect_uris=["https://chatgpt.com/aip/callback"],
            scopes=scopes or [ARTICLE_READ],
        )
        verifier = "v" * 64
        challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest())
            .rstrip(b"=")
            .decode("ascii")
        )
        return client, secret, verifier, challenge

    def _authorization_query(
        self,
        client: AuthoringOAuthClient,
        challenge: str,
        **overrides: str,
    ) -> str:
        values = {
            "client_id": client.client_id,
            "redirect_uri": "https://chatgpt.com/aip/callback",
            "response_type": "code",
            "scope": ARTICLE_READ,
            "resource": "http://testserver/admin-mcp",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": "edge-state",
        }
        values.update(overrides)
        return urlencode(values)

    def _basic(self, client: AuthoringOAuthClient, secret: str) -> str:
        return base64.b64encode(f"{client.client_id}:{secret}".encode()).decode()

    def test_api_rejects_empty_duplicate_and_invalid_relationship_payloads(self) -> None:
        empty_category = self._json_request(
            "post",
            "/api/authoring/v1/categories",
            {"name": "   "},
            **self.bearer,
        )
        self.assertEqual(empty_category.status_code, 422)

        bad_parent = self._json_request(
            "post",
            "/api/authoring/v1/categories",
            {
                "name": "Nested",
                "parent_id": "00000000-0000-0000-0000-000000000001",
            },
            **self.bearer,
        )
        self.assertEqual(bad_parent.status_code, 404)

        empty_tag = self._json_request(
            "post",
            "/api/authoring/v1/tags",
            {"name": "   "},
            **self.bearer,
        )
        self.assertEqual(empty_tag.status_code, 422)

        empty_article = self._json_request(
            "post",
            "/api/authoring/v1/articles",
            {"title": " ", "content": " "},
            **self.bearer,
        )
        self.assertEqual(empty_article.status_code, 422)

        invalid_categories = self._json_request(
            "post",
            "/api/authoring/v1/articles",
            {
                "title": "Invalid categories",
                "content": "body",
                "category_ids": ["00000000-0000-0000-0000-000000000001"],
            },
            **self.bearer,
        )
        self.assertEqual(invalid_categories.status_code, 422)

        invalid_tags = self._json_request(
            "post",
            "/api/authoring/v1/articles",
            {
                "title": "Invalid tags",
                "content": "body",
                "tag_ids": ["00000000-0000-0000-0000-000000000001"],
            },
            **self.bearer,
        )
        self.assertEqual(invalid_tags.status_code, 422)

    def test_api_missing_duplicate_and_update_validation_paths(self) -> None:
        missing = self.client.get(
            "/api/authoring/v1/articles/00000000-0000-0000-0000-000000000001",
            **self.bearer,
        )
        self.assertEqual(missing.status_code, 404)

        first = self._json_request(
            "post",
            "/api/authoring/v1/articles",
            {
                "title": "Duplicate slug",
                "slug": "duplicate-slug",
                "content": "body",
                "category_id": str(self.category.id),
            },
            **self.bearer,
        )
        self.assertEqual(first.status_code, 200)

        duplicate = self._json_request(
            "post",
            "/api/authoring/v1/articles",
            {
                "title": "Another article",
                "slug": "duplicate-slug",
                "content": "body",
                "category_id": str(self.category.id),
            },
            **self.bearer,
        )
        self.assertEqual(duplicate.status_code, 409)

        article_id = first.json()["article"]["id"]
        bad_type = self._json_request(
            "patch",
            f"/api/authoring/v1/articles/{article_id}",
            {"article_type": "not-a-type"},
            **self.bearer,
        )
        self.assertEqual(bad_type.status_code, 422)

        bad_category = self._json_request(
            "patch",
            f"/api/authoring/v1/articles/{article_id}",
            {"category_id": "00000000-0000-0000-0000-000000000001"},
            **self.bearer,
        )
        self.assertEqual(bad_category.status_code, 404)

        bad_categories = self._json_request(
            "patch",
            f"/api/authoring/v1/articles/{article_id}",
            {"category_ids": ["00000000-0000-0000-0000-000000000001"]},
            **self.bearer,
        )
        self.assertEqual(bad_categories.status_code, 422)

        bad_tags = self._json_request(
            "patch",
            f"/api/authoring/v1/articles/{article_id}",
            {"tag_ids": ["00000000-0000-0000-0000-000000000001"]},
            **self.bearer,
        )
        self.assertEqual(bad_tags.status_code, 422)

    def test_validation_reports_missing_publication_readiness_metadata(self) -> None:
        article = Article.objects.create(
            title="Tiny draft",
            slug="tiny-draft",
            content="tiny",
            rendered_html="<p>tiny</p>",
            author=self.user,
            status=ArticleStatus.DRAFT,
            meta_title="x" * 61,
            meta_description="x" * 161,
        )
        response = self.client.get(
            f"/api/authoring/v1/articles/{article.id}/validate",
            **self.bearer,
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["valid"])
        self.assertIn("A primary category is required before publication.", payload["errors"])
        self.assertIn("Add an excerpt for search and article previews.", payload["warnings"])
        self.assertIn("Article has no tags.", payload["warnings"])
        self.assertIn("Meta title exceeds 60 characters.", payload["warnings"])
        self.assertIn("Meta description exceeds 160 characters.", payload["warnings"])

    def test_oauth_authorization_validation_and_consent_paths(self) -> None:
        client, _secret, _verifier, challenge = self._oauth_client()

        cases = [
            {"redirect_uri": "https://evil.example/callback"},
            {"response_type": "token"},
            {"code_challenge_method": "plain"},
            {"resource": "http://testserver/not-admin-mcp"},
            {"scope": "unsupported:scope"},
        ]
        for override in cases:
            with self.subTest(override=override):
                response = self.client.get(
                    f"/oauth/authorize?{self._authorization_query(client, challenge, **override)}"
                )
                self.assertEqual(response.status_code, 400)

        _restricted, _restricted_secret, _restricted_verifier, restricted_challenge = (
            self._oauth_client([ARTICLE_READ])
        )
        restricted = AuthoringOAuthClient.objects.order_by("-created_at").first()
        self.assertIsNotNone(restricted)
        assert restricted is not None
        forbidden_scope = self.client.get(
            f"/oauth/authorize?{self._authorization_query(restricted, restricted_challenge, scope=CATEGORY_READ)}"
        )
        self.assertEqual(forbidden_scope.status_code, 400)

        self.client.force_login(self.user)
        consent = self.client.get(
            f"/oauth/authorize?{self._authorization_query(client, challenge)}"
        )
        self.assertEqual(consent.status_code, 200)
        self.assertContains(consent, "Authorize TechWiki Authoring")
        self.assertContains(consent, "Publishing is not included")

        other = User.objects.create_user(
            email="not-owner@example.com",
            password="strong-test-password",
            first_name="Other",
            last_name="User",
            email_verified=True,
        )
        self.client.force_login(other)
        forbidden = self.client.get(
            f"/oauth/authorize?{self._authorization_query(client, challenge)}"
        )
        self.assertEqual(forbidden.status_code, 403)

    def test_oauth_token_exchange_rejects_invalid_grants(self) -> None:
        client, secret, verifier, challenge = self._oauth_client()
        self.client.force_login(self.user)
        query = self._authorization_query(client, challenge)
        authorization = self.client.post(f"/oauth/authorize?{query}", {"decision": "allow"})
        code = parse_qs(urlparse(authorization.headers["Location"]).query)["code"][0]
        basic = self._basic(client, secret)

        wrong_redirect = self.client.post(
            "/oauth/token",
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": "https://wrong.example/callback",
                "resource": "http://testserver/admin-mcp",
                "code_verifier": verifier,
            },
            HTTP_AUTHORIZATION=f"Basic {basic}",
        )
        self.assertEqual(wrong_redirect.status_code, 400)

        valid = self.client.post(
            "/oauth/token",
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": "https://chatgpt.com/aip/callback",
                "resource": "http://testserver/admin-mcp",
                "code_verifier": verifier,
            },
            HTTP_AUTHORIZATION=f"Basic {basic}",
        )
        self.assertEqual(valid.status_code, 200)

        reused = self.client.post(
            "/oauth/token",
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": "https://chatgpt.com/aip/callback",
                "resource": "http://testserver/admin-mcp",
                "code_verifier": verifier,
            },
            HTTP_AUTHORIZATION=f"Basic {basic}",
        )
        self.assertEqual(reused.status_code, 400)
        self.assertEqual(reused.json()["error"], "invalid_grant")

        unsupported = self.client.post(
            "/oauth/token",
            {
                "grant_type": "client_credentials",
                "client_id": client.client_id,
                "client_secret": secret,
            },
        )
        self.assertEqual(unsupported.status_code, 400)
        self.assertEqual(unsupported.json()["error"], "unsupported_grant_type")

        no_colon = base64.b64encode(client.client_id.encode()).decode()
        malformed_basic = self.client.post(
            "/oauth/token",
            {"grant_type": "authorization_code"},
            HTTP_AUTHORIZATION=f"Basic {no_colon}",
        )
        self.assertEqual(malformed_basic.status_code, 401)

    def test_oauth_refresh_rejects_invalid_resource_and_owner(self) -> None:
        client, secret, _verifier, _challenge = self._oauth_client()
        refresh, raw = AuthoringOAuthRefreshToken.issue(
            client=client,
            user=self.user,
            scopes=[ARTICLE_READ],
            resource="http://testserver/admin-mcp",
            expires_at=timezone.now() + timedelta(days=1),
        )
        basic = self._basic(client, secret)

        wrong_resource = self.client.post(
            "/oauth/token",
            {
                "grant_type": "refresh_token",
                "refresh_token": raw,
                "resource": "http://testserver/wrong",
            },
            HTTP_AUTHORIZATION=f"Basic {basic}",
        )
        self.assertEqual(wrong_resource.status_code, 400)
        self.assertEqual(wrong_resource.json()["error"], "invalid_target")

        with patch.dict(os.environ, {"TECHWIKI_AUTHORING_USER_ID": "someone-else"}):
            wrong_owner = self.client.post(
                "/oauth/token",
                {
                    "grant_type": "refresh_token",
                    "refresh_token": raw,
                    "resource": "http://testserver/admin-mcp",
                },
                HTTP_AUTHORIZATION=f"Basic {basic}",
            )
        self.assertEqual(wrong_owner.status_code, 403)
        self.assertEqual(wrong_owner.json()["error"], "access_denied")

        refresh.revoked_at = timezone.now()
        refresh.save(update_fields=["revoked_at"])
        revoked = self.client.post(
            "/oauth/token",
            {
                "grant_type": "refresh_token",
                "refresh_token": raw,
                "resource": "http://testserver/admin-mcp",
            },
            HTTP_AUTHORIZATION=f"Basic {basic}",
        )
        self.assertEqual(revoked.status_code, 400)
        self.assertEqual(revoked.json()["error"], "invalid_grant")

    def test_mcp_legacy_initialize_and_modern_validation_errors(self) -> None:
        initialize = self._json_request(
            "post",
            "/admin-mcp",
            {"jsonrpc": "2.0", "id": 1, "method": "initialize"},
            **self.bearer,
        )
        self.assertEqual(initialize.status_code, 200)
        self.assertEqual(initialize.json()["result"]["protocolVersion"], "2025-11-25")

        missing_meta = self._json_request(
            "post",
            "/admin-mcp",
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            HTTP_MCP_PROTOCOL_VERSION="2026-07-28",
            HTTP_MCP_METHOD="tools/list",
            **self.bearer,
        )
        self.assertEqual(missing_meta.status_code, 400)

        missing_capabilities = self._json_request(
            "post",
            "/admin-mcp",
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/list",
                "_meta": {"io.modelcontextprotocol/protocolVersion": "2026-07-28"},
            },
            HTTP_MCP_PROTOCOL_VERSION="2026-07-28",
            HTTP_MCP_METHOD="tools/list",
            **self.bearer,
        )
        self.assertEqual(missing_capabilities.status_code, 400)

        invalid_call = self._json_request(
            "post",
            "/admin-mcp",
            {
                "jsonrpc": "2.0",
                "id": 4,
                "method": "tools/call",
                "_meta": {
                    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                    "io.modelcontextprotocol/clientCapabilities": {},
                },
                "params": [],
            },
            HTTP_MCP_PROTOCOL_VERSION="2026-07-28",
            HTTP_MCP_METHOD="tools/call",
            **self.bearer,
        )
        self.assertEqual(invalid_call.status_code, 400)

        wrong_name = self._json_request(
            "post",
            "/admin-mcp",
            {
                "jsonrpc": "2.0",
                "id": 5,
                "method": "tools/call",
                "_meta": {
                    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                    "io.modelcontextprotocol/clientCapabilities": {},
                },
                "params": {"name": "list_categories", "arguments": {}},
            },
            HTTP_MCP_PROTOCOL_VERSION="2026-07-28",
            HTTP_MCP_METHOD="tools/call",
            HTTP_MCP_NAME="different_tool",
            **self.bearer,
        )
        self.assertEqual(wrong_name.status_code, 400)

        missing_method = self._json_request(
            "post",
            "/admin-mcp",
            {"jsonrpc": "2.0", "id": 6, "method": "not/a/method"},
            **self.bearer,
        )
        self.assertEqual(missing_method.status_code, 200)
        self.assertEqual(missing_method.json()["error"]["code"], -32601)

    def test_mcp_exercises_authoring_tool_wrappers(self) -> None:
        create_category = self._json_request(
            "post",
            "/admin-mcp",
            {
                "jsonrpc": "2.0",
                "id": 10,
                "method": "tools/call",
                "params": {"name": "create_category", "arguments": {"name": "Containers"}},
            },
            **self.bearer,
        )
        self.assertEqual(create_category.status_code, 200)

        create_tag = self._json_request(
            "post",
            "/admin-mcp",
            {
                "jsonrpc": "2.0",
                "id": 11,
                "method": "tools/call",
                "params": {"name": "create_tag", "arguments": {"name": "Compose"}},
            },
            **self.bearer,
        )
        self.assertEqual(create_tag.status_code, 200)

        create_article = self._json_request(
            "post",
            "/admin-mcp",
            {
                "jsonrpc": "2.0",
                "id": 12,
                "method": "tools/call",
                "params": {
                    "name": "create_article_draft",
                    "arguments": {
                        "title": "MCP wrapper coverage",
                        "content": "# Diagnose\n\nUse the MCP tools safely.",
                        "category_id": str(self.category.id),
                        "tag_ids": [str(self.tag.id)],
                    },
                },
            },
            **self.bearer,
        )
        self.assertEqual(create_article.status_code, 200)
        article_id = create_article.json()["result"]["structuredContent"]["article"]["id"]

        for request_id, name, arguments in [
            (13, "search_articles", {"query": "MCP wrapper"}),
            (14, "get_article", {"article_id": article_id}),
            (15, "validate_article", {"article_id": article_id}),
            (
                16,
                "set_article_compatibility",
                {"article_id": article_id, "technology": "Django", "version": "6.0"},
            ),
            (
                17,
                "update_article_draft",
                {"article_id": article_id, "title": "Updated through MCP"},
            ),
            (18, "list_tags", {}),
        ]:
            with self.subTest(tool=name):
                response = self._json_request(
                    "post",
                    "/admin-mcp",
                    {
                        "jsonrpc": "2.0",
                        "id": request_id,
                        "method": "tools/call",
                        "params": {"name": name, "arguments": arguments},
                    },
                    **self.bearer,
                )
                self.assertEqual(response.status_code, 200)
                self.assertFalse(response.json()["result"]["isError"])

        invalid_uuid = self._json_request(
            "post",
            "/admin-mcp",
            {
                "jsonrpc": "2.0",
                "id": 19,
                "method": "tools/call",
                "params": {"name": "get_article", "arguments": {"article_id": "not-a-uuid"}},
            },
            **self.bearer,
        )
        self.assertTrue(invalid_uuid.json()["result"]["isError"])

    def test_authoring_model_lifecycle_helpers(self) -> None:
        self.assertIn("Edge coverage", str(self.token))
        self.assertTrue(self.token.is_active)

        self.token.revoked_at = timezone.now()
        self.token.save(update_fields=["revoked_at"])
        self.assertFalse(self.token.is_active)
        self.assertIsNone(AuthoringApiToken.authenticate(self.raw_token))

        client, secret, verifier, challenge = self._oauth_client()
        self.assertEqual(str(client), "Edge OAuth")
        self.assertTrue(client.check_secret(secret))
        self.assertFalse(client.check_secret("wrong-secret"))

        code, raw_code = AuthoringOAuthCode.issue(
            client=client,
            user=self.user,
            redirect_uri="https://chatgpt.com/aip/callback",
            resource="http://testserver/admin-mcp",
            scopes=[ARTICLE_READ],
            code_challenge=challenge,
            expires_at=timezone.now() + timedelta(minutes=5),
        )
        self.assertEqual(AuthoringOAuthCode.find(raw_code), code)
        self.assertNotEqual(verifier, raw_code)

        refresh, raw_refresh = AuthoringOAuthRefreshToken.issue(
            client=client,
            user=self.user,
            scopes=[ARTICLE_READ],
            resource="http://testserver/admin-mcp",
            expires_at=timezone.now() + timedelta(days=1),
        )
        self.assertTrue(refresh.is_active)
        self.assertEqual(AuthoringOAuthRefreshToken.find(raw_refresh), refresh)
        refresh.revoked_at = timezone.now()
        self.assertFalse(refresh.is_active)

    def test_authoring_admin_is_read_only_and_displays_scopes(self) -> None:
        request = RequestFactory().get("/admin/")
        token_admin = AuthoringApiTokenAdmin(AuthoringApiToken, admin.site)
        client_admin = AuthoringOAuthClientAdmin(AuthoringOAuthClient, admin.site)
        code_admin = AuthoringOAuthCodeAdmin(AuthoringOAuthCode, admin.site)
        refresh_admin = AuthoringOAuthRefreshTokenAdmin(AuthoringOAuthRefreshToken, admin.site)
        audit_admin = AuthoringAuditLogAdmin(AuthoringAuditLog, admin.site)

        self.assertEqual(token_admin.scope_summary(self.token), ", ".join(self.scopes))
        self.assertFalse(token_admin.has_add_permission(request))
        self.assertFalse(token_admin.has_delete_permission(request, self.token))
        self.assertFalse(client_admin.has_add_permission(request))
        self.assertFalse(client_admin.has_delete_permission(request))
        self.assertFalse(code_admin.has_add_permission(request))
        self.assertFalse(code_admin.has_change_permission(request))
        self.assertFalse(code_admin.has_delete_permission(request))
        self.assertFalse(refresh_admin.has_add_permission(request))
        self.assertFalse(refresh_admin.has_delete_permission(request))
        self.assertFalse(audit_admin.has_add_permission(request))
        self.assertFalse(audit_admin.has_change_permission(request))
        self.assertFalse(audit_admin.has_delete_permission(request))
