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

    def _json(
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
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
        challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
        return client, secret, verifier, challenge

    def _authorize_query(
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
        value = f"{client.client_id}:{secret}".encode()
        return base64.b64encode(value).decode()

    def test_api_rejects_invalid_relationships_and_empty_values(self) -> None:
        cases = [
            (
                "/api/authoring/v1/categories",
                {"name": "   "},
                422,
            ),
            (
                "/api/authoring/v1/categories",
                {
                    "name": "Nested",
                    "parent_id": "00000000-0000-0000-0000-000000000001",
                },
                404,
            ),
            (
                "/api/authoring/v1/tags",
                {"name": "   "},
                422,
            ),
            (
                "/api/authoring/v1/articles",
                {"title": " ", "content": " "},
                422,
            ),
            (
                "/api/authoring/v1/articles",
                {
                    "title": "Bad categories",
                    "content": "body",
                    "category_ids": [
                        "00000000-0000-0000-0000-000000000001"
                    ],
                },
                422,
            ),
            (
                "/api/authoring/v1/articles",
                {
                    "title": "Bad tags",
                    "content": "body",
                    "tag_ids": ["00000000-0000-0000-0000-000000000001"],
                },
                422,
            ),
        ]
        for path, payload, expected in cases:
            with self.subTest(path=path, payload=payload):
                response = self._json(
                    "post",
                    path,
                    payload,
                    **self.bearer,
                )
                self.assertEqual(response.status_code, expected)

    def test_api_duplicate_missing_and_update_guards(self) -> None:
        missing = self.client.get(
            "/api/authoring/v1/articles/00000000-0000-0000-0000-000000000001",
            **self.bearer,
        )
        self.assertEqual(missing.status_code, 404)

        created = self._json(
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
        self.assertEqual(created.status_code, 200)
        article_id = created.json()["article"]["id"]

        duplicate = self._json(
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

        updates = [
            ({"article_type": "not-a-type"}, 422),
            (
                {
                    "category_id": (
                        "00000000-0000-0000-0000-000000000001"
                    )
                },
                404,
            ),
            (
                {
                    "category_ids": [
                        "00000000-0000-0000-0000-000000000001"
                    ]
                },
                422,
            ),
            (
                {
                    "tag_ids": [
                        "00000000-0000-0000-0000-000000000001"
                    ]
                },
                422,
            ),
        ]
        for payload, expected in updates:
            with self.subTest(payload=payload):
                response = self._json(
                    "patch",
                    f"/api/authoring/v1/articles/{article_id}",
                    payload,
                    **self.bearer,
                )
                self.assertEqual(response.status_code, expected)

    def test_validation_reports_reachable_readiness_warnings(self) -> None:
        article = Article.objects.create(
            title="Tiny draft",
            slug="tiny-draft",
            content="tiny",
            rendered_html="<p>tiny</p>",
            author=self.user,
            status=ArticleStatus.DRAFT,
        )
        response = self.client.get(
            f"/api/authoring/v1/articles/{article.id}/validate",
            **self.bearer,
        )
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["valid"])
        self.assertIn(
            "A primary category is required before publication.",
            payload["errors"],
        )
        self.assertIn(
            "Add an excerpt for search and article previews.",
            payload["warnings"],
        )
        self.assertIn("Add a meta description.", payload["warnings"])
        self.assertIn(
            "Article is very short; verify that it fully solves the problem.",
            payload["warnings"],
        )
        self.assertIn("Article has no tags.", payload["warnings"])

    def test_oauth_authorization_validation_and_consent(self) -> None:
        client, _secret, _verifier, challenge = self._oauth_client()
        invalid = [
            {"redirect_uri": "https://evil.example/callback"},
            {"response_type": "token"},
            {"code_challenge_method": "plain"},
            {"resource": "http://testserver/not-admin-mcp"},
            {"scope": "unsupported:scope"},
        ]
        for override in invalid:
            with self.subTest(override=override):
                query = self._authorize_query(
                    client,
                    challenge,
                    **override,
                )
                response = self.client.get(f"/oauth/authorize?{query}")
                self.assertEqual(response.status_code, 400)

        restricted, _secret, _verifier, challenge = self._oauth_client(
            [ARTICLE_READ]
        )
        query = self._authorize_query(
            restricted,
            challenge,
            scope=CATEGORY_READ,
        )
        self.assertEqual(
            self.client.get(f"/oauth/authorize?{query}").status_code,
            400,
        )

        self.client.force_login(self.user)
        query = self._authorize_query(client, challenge)
        consent = self.client.get(f"/oauth/authorize?{query}")
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
        self.assertEqual(
            self.client.get(f"/oauth/authorize?{query}").status_code,
            403,
        )

    def test_oauth_token_exchange_rejects_invalid_grants(self) -> None:
        client, secret, verifier, challenge = self._oauth_client()
        self.client.force_login(self.user)
        query = self._authorize_query(client, challenge)
        authorization = self.client.post(
            f"/oauth/authorize?{query}",
            {"decision": "allow"},
        )
        location = authorization.headers["Location"]
        code = parse_qs(urlparse(location).query)["code"][0]
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
        self.assertEqual(reused.json()["error"], "invalid_grant")

        unsupported = self.client.post(
            "/oauth/token",
            {
                "grant_type": "client_credentials",
                "client_id": client.client_id,
                "client_secret": secret,
            },
        )
        self.assertEqual(
            unsupported.json()["error"],
            "unsupported_grant_type",
        )

        no_colon = base64.b64encode(client.client_id.encode()).decode()
        malformed = self.client.post(
            "/oauth/token",
            {"grant_type": "authorization_code"},
            HTTP_AUTHORIZATION=f"Basic {no_colon}",
        )
        self.assertEqual(malformed.status_code, 401)

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
        self.assertEqual(wrong_resource.json()["error"], "invalid_target")

        with patch.dict(
            os.environ,
            {"TECHWIKI_AUTHORING_USER_ID": "someone-else"},
        ):
            wrong_owner = self.client.post(
                "/oauth/token",
                {
                    "grant_type": "refresh_token",
                    "refresh_token": raw,
                    "resource": "http://testserver/admin-mcp",
                },
                HTTP_AUTHORIZATION=f"Basic {basic}",
            )
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
        self.assertEqual(revoked.json()["error"], "invalid_grant")

    def test_mcp_protocol_validation_and_legacy_initialize(self) -> None:
        initialize = self._json(
            "post",
            "/admin-mcp",
            {"jsonrpc": "2.0", "id": 1, "method": "initialize"},
            **self.bearer,
        )
        self.assertEqual(
            initialize.json()["result"]["protocolVersion"],
            "2025-11-25",
        )

        missing_meta = self._json(
            "post",
            "/admin-mcp",
            {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
            HTTP_MCP_PROTOCOL_VERSION="2026-07-28",
            HTTP_MCP_METHOD="tools/list",
            **self.bearer,
        )
        self.assertEqual(missing_meta.status_code, 400)

        missing_capabilities = self._json(
            "post",
            "/admin-mcp",
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/list",
                "_meta": {
                    "io.modelcontextprotocol/protocolVersion": "2026-07-28"
                },
            },
            HTTP_MCP_PROTOCOL_VERSION="2026-07-28",
            HTTP_MCP_METHOD="tools/list",
            **self.bearer,
        )
        self.assertEqual(missing_capabilities.status_code, 400)

        invalid_call = self._json(
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

        wrong_name = self._json(
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
                "params": {
                    "name": "list_categories",
                    "arguments": {},
                },
            },
            HTTP_MCP_PROTOCOL_VERSION="2026-07-28",
            HTTP_MCP_METHOD="tools/call",
            HTTP_MCP_NAME="different_tool",
            **self.bearer,
        )
        self.assertEqual(wrong_name.status_code, 400)

        unknown = self._json(
            "post",
            "/admin-mcp",
            {"jsonrpc": "2.0", "id": 6, "method": "not/a/method"},
            **self.bearer,
        )
        self.assertEqual(unknown.json()["error"]["code"], -32601)

    def test_mcp_exercises_authoring_tool_wrappers(self) -> None:
        create_category = self._mcp_call(
            10,
            "create_category",
            {"name": "Containers"},
        )
        self.assertFalse(create_category.json()["result"]["isError"])

        create_tag = self._mcp_call(
            11,
            "create_tag",
            {"name": "Compose"},
        )
        self.assertFalse(create_tag.json()["result"]["isError"])

        create_article = self._mcp_call(
            12,
            "create_article_draft",
            {
                "title": "MCP wrapper coverage",
                "content": "# Diagnose\n\nUse the MCP tools safely.",
                "category_id": str(self.category.id),
                "tag_ids": [str(self.tag.id)],
            },
        )
        result = create_article.json()["result"]["structuredContent"]
        article_id = result["article"]["id"]

        calls = [
            (13, "search_articles", {"query": "MCP wrapper"}),
            (14, "get_article", {"article_id": article_id}),
            (15, "validate_article", {"article_id": article_id}),
            (
                16,
                "set_article_compatibility",
                {
                    "article_id": article_id,
                    "technology": "Django",
                    "version": "6.0",
                },
            ),
            (
                17,
                "update_article_draft",
                {
                    "article_id": article_id,
                    "title": "Updated through MCP",
                },
            ),
            (18, "list_tags", {}),
        ]
        for request_id, name, arguments in calls:
            with self.subTest(tool=name):
                response = self._mcp_call(
                    request_id,
                    name,
                    arguments,
                )
                self.assertFalse(response.json()["result"]["isError"])

        invalid_uuid = self._mcp_call(
            19,
            "get_article",
            {"article_id": "not-a-uuid"},
        )
        self.assertTrue(invalid_uuid.json()["result"]["isError"])

    def _mcp_call(
        self,
        request_id: int,
        name: str,
        arguments: dict[str, object],
    ) -> Any:
        return self._json(
            "post",
            "/admin-mcp",
            {
                "jsonrpc": "2.0",
                "id": request_id,
                "method": "tools/call",
                "params": {
                    "name": name,
                    "arguments": arguments,
                },
            },
            **self.bearer,
        )

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
        self.assertEqual(
            AuthoringOAuthRefreshToken.find(raw_refresh),
            refresh,
        )
        refresh.revoked_at = timezone.now()
        self.assertFalse(refresh.is_active)

    def test_authoring_admin_is_read_only_and_displays_scopes(self) -> None:
        request = RequestFactory().get("/admin/")
        token_admin = AuthoringApiTokenAdmin(AuthoringApiToken, admin.site)
        client_admin = AuthoringOAuthClientAdmin(
            AuthoringOAuthClient,
            admin.site,
        )
        code_admin = AuthoringOAuthCodeAdmin(
            AuthoringOAuthCode,
            admin.site,
        )
        refresh_admin = AuthoringOAuthRefreshTokenAdmin(
            AuthoringOAuthRefreshToken,
            admin.site,
        )
        audit_admin = AuthoringAuditLogAdmin(AuthoringAuditLog, admin.site)

        self.assertEqual(
            token_admin.scope_summary(self.token),
            ", ".join(self.token.scopes),
        )
        self.assertFalse(token_admin.has_add_permission(request))
        self.assertFalse(
            token_admin.has_delete_permission(request, self.token)
        )
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
