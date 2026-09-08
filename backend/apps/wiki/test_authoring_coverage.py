"""Behavioural coverage for private TechWiki authoring surfaces."""

from __future__ import annotations

import base64
import hashlib
import json
import os
from typing import Any
from unittest.mock import patch
from urllib.parse import parse_qs, urlencode, urlparse

from django.test import TestCase

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
from apps.wiki.authoring_models import AuthoringApiToken, AuthoringOAuthClient
from apps.wiki.compatibility import ArticleCompatibility
from apps.wiki.models import Article, ArticleRevision, ArticleStatus, Category, Tag
from authentication.models import User


class PrivateAuthoringCoverageTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            email="coverage-owner@example.com",
            password="strong-test-password",
            first_name="Coverage",
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
            name="Coverage",
            scopes=self.scopes,
        )
        self.category = Category.objects.create(name="Linux", slug="linux")
        self.tag = Tag.objects.create(name="Docker", slug="docker")

    @property
    def bearer(self) -> dict[str, Any]:
        return {"HTTP_AUTHORIZATION": f"Bearer {self.raw_token}"}

    def _post_json(
        self,
        path: str,
        payload: dict[str, object],
        **headers: Any,
    ) -> Any:
        return self.client.post(
            path,
            data=json.dumps(payload),
            content_type="application/json",
            **headers,
        )

    def _patch_json(
        self,
        path: str,
        payload: dict[str, object],
        **headers: Any,
    ) -> Any:
        return self.client.patch(
            path,
            data=json.dumps(payload),
            content_type="application/json",
            **headers,
        )

    def _put_json(
        self,
        path: str,
        payload: dict[str, object],
        **headers: Any,
    ) -> Any:
        return self.client.put(
            path,
            data=json.dumps(payload),
            content_type="application/json",
            **headers,
        )

    def _create_draft(self, title: str = "Coverage draft") -> Article:
        response = self._post_json(
            "/api/authoring/v1/articles",
            {
                "title": title,
                "content": "# Fix\n\nRun the diagnostic command and verify the result.",
                "category_id": str(self.category.id),
                "category_ids": [str(self.category.id)],
                "tag_ids": [str(self.tag.id)],
                "excerpt": "A practical troubleshooting article.",
                "meta_description": "A practical troubleshooting article.",
            },
            **self.bearer,
        )
        self.assertEqual(response.status_code, 200)
        return Article.objects.get(id=response.json()["article"]["id"])

    def _oauth_client(self) -> tuple[AuthoringOAuthClient, str, str, str]:
        client, secret = AuthoringOAuthClient.issue(
            name="Coverage client",
            redirect_uris=["https://chatgpt.com/aip/callback"],
            scopes=[ARTICLE_READ, CATEGORY_READ],
        )
        verifier = "v" * 64
        challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest())
            .rstrip(b"=")
            .decode("ascii")
        )
        return client, secret, verifier, challenge

    def _authorize_and_exchange(self) -> tuple[AuthoringOAuthClient, str, dict[str, object]]:
        client, secret, verifier, challenge = self._oauth_client()
        self.client.force_login(self.user)
        query = urlencode(
            {
                "client_id": client.client_id,
                "redirect_uri": "https://chatgpt.com/aip/callback",
                "response_type": "code",
                "scope": f"{ARTICLE_READ} {CATEGORY_READ} offline_access",
                "resource": "http://testserver/admin-mcp",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "state": "coverage-state",
            }
        )
        authorization = self.client.post(
            f"/oauth/authorize?{query}",
            {"decision": "allow"},
        )
        self.assertEqual(authorization.status_code, 302)
        code = parse_qs(urlparse(authorization.headers["Location"]).query)["code"][0]
        basic = base64.b64encode(f"{client.client_id}:{secret}".encode()).decode()
        token_response = self.client.post(
            "/oauth/token",
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": "https://chatgpt.com/aip/callback",
                "code_verifier": verifier,
                "resource": "http://testserver/admin-mcp",
            },
            HTTP_AUTHORIZATION=f"Basic {basic}",
        )
        self.assertEqual(token_response.status_code, 200)
        return client, secret, token_response.json()

    def test_api_root_lists_safe_capabilities(self) -> None:
        response = self.client.get("/api/authoring/v1/", **self.bearer)
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["publishing_enabled"])
        self.assertEqual(payload["mcp"], "/admin-mcp")
        self.assertEqual(set(payload["scopes"]), set(self.scopes))

    def test_category_and_tag_crud_guards(self) -> None:
        categories = self.client.get("/api/authoring/v1/categories", **self.bearer)
        self.assertEqual(categories.status_code, 200)
        self.assertEqual(categories.json()["categories"][0]["full_path"], "linux")

        category_response = self._post_json(
            "/api/authoring/v1/categories",
            {
                "name": "Containers",
                "description": "Container tooling",
                "parent_id": str(self.category.id),
            },
            **self.bearer,
        )
        self.assertEqual(category_response.status_code, 200)
        self.assertEqual(category_response.json()["category"]["full_path"], "linux/containers")

        duplicate_category = self._post_json(
            "/api/authoring/v1/categories",
            {"name": "Linux"},
            **self.bearer,
        )
        self.assertEqual(duplicate_category.status_code, 409)

        tag_response = self._post_json(
            "/api/authoring/v1/tags",
            {"name": "Compose", "description": "Docker Compose"},
            **self.bearer,
        )
        self.assertEqual(tag_response.status_code, 200)
        self.assertTrue(Tag.objects.filter(slug="compose").exists())

        duplicate_tag = self._post_json(
            "/api/authoring/v1/tags",
            {"name": "Docker"},
            **self.bearer,
        )
        self.assertEqual(duplicate_tag.status_code, 409)

    def test_article_create_search_read_update_and_idempotency(self) -> None:
        response = self._post_json(
            "/api/authoring/v1/articles",
            {
                "title": "Docker container stuck in Created",
                "content": "# Diagnose\n\nInspect the container state before restarting it.",
                "category_id": str(self.category.id),
                "category_ids": [str(self.category.id)],
                "tag_ids": [str(self.tag.id)],
                "article_type": "tutorial",
                "excerpt": "Diagnose a container that never starts.",
            },
            HTTP_IDEMPOTENCY_KEY="create-one",
            **self.bearer,
        )
        self.assertEqual(response.status_code, 200)
        article_id = response.json()["article"]["id"]
        self.assertEqual(Article.objects.count(), 1)
        self.assertEqual(ArticleRevision.objects.count(), 1)

        repeated = self._post_json(
            "/api/authoring/v1/articles",
            {
                "title": "This should not create another article",
                "content": "ignored",
            },
            HTTP_IDEMPOTENCY_KEY="create-one",
            **self.bearer,
        )
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(Article.objects.count(), 1)

        listing = self.client.get(
            "/api/authoring/v1/articles?q=container&status=draft",
            **self.bearer,
        )
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.json()["articles"]), 1)

        detail = self.client.get(
            f"/api/authoring/v1/articles/{article_id}",
            **self.bearer,
        )
        self.assertEqual(detail.status_code, 200)
        self.assertIn("Inspect the container", detail.json()["article"]["content"])

        update = self._patch_json(
            f"/api/authoring/v1/articles/{article_id}",
            {
                "title": "Docker container stuck in Created state",
                "content": "# Diagnose\n\nInspect logs, mounts, networking, and the entrypoint.",
                "meta_title": "Docker container stuck in Created",
                "meta_description": "Diagnose Docker containers stuck in Created state.",
                "category_ids": [str(self.category.id)],
                "tag_ids": [str(self.tag.id)],
            },
            HTTP_IDEMPOTENCY_KEY="update-one",
            **self.bearer,
        )
        self.assertEqual(update.status_code, 200)
        article = Article.objects.get(id=article_id)
        self.assertEqual(article.version, 2)
        self.assertEqual(ArticleRevision.objects.filter(article=article).count(), 2)

        repeated_update = self._patch_json(
            f"/api/authoring/v1/articles/{article_id}",
            {"title": "Ignored update"},
            HTTP_IDEMPOTENCY_KEY="update-one",
            **self.bearer,
        )
        self.assertEqual(repeated_update.status_code, 200)
        article.refresh_from_db()
        self.assertEqual(article.version, 2)

    def test_article_validation_and_compatibility(self) -> None:
        article = self._create_draft("Validation target")
        Article.objects.create(
            title="Validation target",
            slug="validation-target-duplicate",
            content="duplicate",
            author=self.user,
            status=ArticleStatus.DRAFT,
        )
        validation = self.client.get(
            f"/api/authoring/v1/articles/{article.id}/validate",
            **self.bearer,
        )
        self.assertEqual(validation.status_code, 200)
        self.assertTrue(validation.json()["valid"])
        self.assertTrue(validation.json()["potential_duplicates"])

        compatibility = self._put_json(
            f"/api/authoring/v1/articles/{article.id}/compatibility",
            {
                "technology": "Docker",
                "version": "27",
                "environment": "Ubuntu 24.04",
                "status": "verified",
                "notes": "Reproduced in a clean VM.",
            },
            **self.bearer,
        )
        self.assertEqual(compatibility.status_code, 200)
        record = ArticleCompatibility.objects.get(article=article)
        self.assertEqual(record.verified_by, self.user)
        self.assertEqual(record.environment, "Ubuntu 24.04")

        invalid = self._put_json(
            f"/api/authoring/v1/articles/{article.id}/compatibility",
            {"technology": "Docker", "status": "wrong"},
            **self.bearer,
        )
        self.assertEqual(invalid.status_code, 422)

    def test_published_articles_and_bad_article_payloads_are_rejected(self) -> None:
        article = self._create_draft()
        article.status = ArticleStatus.PUBLISHED
        article.save(update_fields=["status", "published_at"])
        update = self._patch_json(
            f"/api/authoring/v1/articles/{article.id}",
            {"title": "Should fail"},
            **self.bearer,
        )
        self.assertEqual(update.status_code, 409)

        invalid_type = self._post_json(
            "/api/authoring/v1/articles",
            {"title": "Bad type", "content": "body", "article_type": "unknown"},
            **self.bearer,
        )
        self.assertEqual(invalid_type.status_code, 422)

        missing_category = self._post_json(
            "/api/authoring/v1/articles",
            {
                "title": "Missing category",
                "content": "body",
                "category_id": "00000000-0000-0000-0000-000000000001",
            },
            **self.bearer,
        )
        self.assertEqual(missing_category.status_code, 404)

    def test_scope_enforcement_and_owner_binding(self) -> None:
        _limited, limited_raw = AuthoringApiToken.issue(
            user=self.user,
            name="Read only",
            scopes=[ARTICLE_READ],
        )
        response = self._post_json(
            "/api/authoring/v1/categories",
            {"name": "Forbidden"},
            HTTP_AUTHORIZATION=f"Bearer {limited_raw}",
        )
        self.assertEqual(response.status_code, 403)

        with patch.dict(os.environ, {"TECHWIKI_AUTHORING_USER_ID": "not-this-user"}):
            rejected = self.client.get("/api/authoring/v1/", **self.bearer)
        self.assertEqual(rejected.status_code, 401)

    def test_oauth_metadata_and_invalid_requests(self) -> None:
        metadata = self.client.get("/.well-known/oauth-authorization-server")
        self.assertEqual(metadata.status_code, 200)
        self.assertIn("authorization_code", metadata.json()["grant_types_supported"])
        self.assertIn("S256", metadata.json()["code_challenge_methods_supported"])

        bad_client = self.client.get(
            "/oauth/authorize",
            {
                "client_id": "missing",
                "redirect_uri": "https://chatgpt.com/aip/callback",
                "response_type": "code",
                "resource": "http://testserver/admin-mcp",
                "code_challenge": "x",
                "code_challenge_method": "S256",
            },
        )
        self.assertEqual(bad_client.status_code, 400)

        invalid_token_client = self.client.post(
            "/oauth/token",
            {"grant_type": "authorization_code"},
            HTTP_AUTHORIZATION="Basic definitely-not-base64",
        )
        self.assertEqual(invalid_token_client.status_code, 401)
        self.assertEqual(invalid_token_client.json()["error"], "invalid_client")

    def test_oauth_denial_refresh_rotation_and_revocation(self) -> None:
        client, _secret, _verifier, challenge = self._oauth_client()
        self.client.force_login(self.user)
        query = urlencode(
            {
                "client_id": client.client_id,
                "redirect_uri": "https://chatgpt.com/aip/callback",
                "response_type": "code",
                "scope": ARTICLE_READ,
                "resource": "http://testserver/admin-mcp",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "state": "deny-state",
            }
        )
        denied = self.client.post(f"/oauth/authorize?{query}", {"decision": "deny"})
        denied_query = parse_qs(urlparse(denied.headers["Location"]).query)
        self.assertEqual(denied_query["error"], ["access_denied"])
        self.assertEqual(denied_query["state"], ["deny-state"])

        _, exchange_secret, payload = self._authorize_and_exchange()
        refresh = payload["refresh_token"]
        exchange_client = AuthoringOAuthClient.objects.exclude(id=client.id).get()
        basic = base64.b64encode(f"{exchange_client.client_id}:{exchange_secret}".encode()).decode()
        refreshed = self.client.post(
            "/oauth/token",
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh,
                "resource": "http://testserver/admin-mcp",
            },
            HTTP_AUTHORIZATION=f"Basic {basic}",
        )
        self.assertEqual(refreshed.status_code, 200)
        self.assertNotEqual(refreshed.json()["refresh_token"], refresh)

        access = refreshed.json()["access_token"]
        revoked = self.client.post(
            "/oauth/revoke",
            {"token": access},
            HTTP_AUTHORIZATION=f"Basic {basic}",
        )
        self.assertEqual(revoked.status_code, 200)
        self.assertIsNone(AuthoringApiToken.authenticate(access, resource=None))

    def test_oauth_rejects_bad_pkce_and_resource(self) -> None:
        client, secret, _verifier, challenge = self._oauth_client()
        self.client.force_login(self.user)
        query = urlencode(
            {
                "client_id": client.client_id,
                "redirect_uri": "https://chatgpt.com/aip/callback",
                "response_type": "code",
                "scope": ARTICLE_READ,
                "resource": "http://testserver/admin-mcp",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
            }
        )
        authorization = self.client.post(f"/oauth/authorize?{query}", {"decision": "allow"})
        code = parse_qs(urlparse(authorization.headers["Location"]).query)["code"][0]
        basic = base64.b64encode(f"{client.client_id}:{secret}".encode()).decode()

        wrong_resource = self.client.post(
            "/oauth/token",
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": "https://chatgpt.com/aip/callback",
                "code_verifier": "x" * 64,
                "resource": "http://testserver/wrong",
            },
            HTTP_AUTHORIZATION=f"Basic {basic}",
        )
        self.assertEqual(wrong_resource.status_code, 400)
        self.assertEqual(wrong_resource.json()["error"], "invalid_target")

        bad_pkce = self.client.post(
            "/oauth/token",
            {
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": "https://chatgpt.com/aip/callback",
                "code_verifier": "x" * 64,
                "resource": "http://testserver/admin-mcp",
            },
            HTTP_AUTHORIZATION=f"Basic {basic}",
        )
        self.assertEqual(bad_pkce.status_code, 400)
        self.assertEqual(bad_pkce.json()["error"], "invalid_grant")

    def test_mcp_get_legacy_and_tool_calls(self) -> None:
        summary = self.client.get("/admin-mcp", **self.bearer)
        self.assertEqual(summary.status_code, 200)
        self.assertFalse(summary.json()["publishingEnabled"])

        listing = self._post_json(
            "/admin-mcp",
            {"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
            **self.bearer,
        )
        self.assertEqual(listing.status_code, 200)
        self.assertTrue(listing.json()["result"]["tools"])

        call = self._post_json(
            "/admin-mcp",
            {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/call",
                "params": {"name": "list_categories", "arguments": {}},
            },
            **self.bearer,
        )
        self.assertEqual(call.status_code, 200)
        self.assertIn("categories", call.json()["result"]["structuredContent"])

        unknown_tool = self._post_json(
            "/admin-mcp",
            {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {"name": "missing_tool", "arguments": {}},
            },
            **self.bearer,
        )
        self.assertEqual(unknown_tool.status_code, 200)
        self.assertTrue(unknown_tool.json()["result"]["isError"])

    def test_mcp_protocol_validation_and_scope_errors(self) -> None:
        malformed = self.client.post(
            "/admin-mcp",
            data="not-json",
            content_type="application/json",
            **self.bearer,
        )
        self.assertEqual(malformed.status_code, 400)
        self.assertEqual(malformed.json()["error"]["code"], -32700)

        invalid_request = self._post_json(
            "/admin-mcp",
            {"hello": "world"},
            **self.bearer,
        )
        self.assertEqual(invalid_request.status_code, 400)

        modern_without_headers = self._post_json(
            "/admin-mcp",
            {
                "jsonrpc": "2.0",
                "id": 4,
                "method": "tools/list",
                "_meta": {
                    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                    "io.modelcontextprotocol/clientCapabilities": {},
                },
            },
            HTTP_MCP_PROTOCOL_VERSION="2026-07-28",
            **self.bearer,
        )
        self.assertEqual(modern_without_headers.status_code, 400)

        modern = self._post_json(
            "/admin-mcp",
            {
                "jsonrpc": "2.0",
                "id": 5,
                "method": "server/discover",
                "_meta": {
                    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                    "io.modelcontextprotocol/clientCapabilities": {},
                },
            },
            HTTP_MCP_PROTOCOL_VERSION="2026-07-28",
            HTTP_MCP_METHOD="server/discover",
            **self.bearer,
        )
        self.assertEqual(modern.status_code, 200)
        self.assertEqual(modern.json()["result"]["protocolVersion"], "2026-07-28")

        _limited, limited_raw = AuthoringApiToken.issue(
            user=self.user,
            name="MCP read only",
            scopes=[ARTICLE_READ],
        )
        insufficient = self._post_json(
            "/admin-mcp",
            {
                "jsonrpc": "2.0",
                "id": 6,
                "method": "tools/call",
                "params": {"name": "create_category", "arguments": {"name": "Nope"}},
            },
            HTTP_AUTHORIZATION=f"Bearer {limited_raw}",
        )
        self.assertEqual(insufficient.status_code, 403)
        self.assertEqual(insufficient.json()["error"], "insufficient_scope")

    def test_mcp_rejects_wrong_resource_bound_token(self) -> None:
        _token, raw = AuthoringApiToken.issue(
            user=self.user,
            name="Wrong resource",
            scopes=[ARTICLE_READ],
            resource="http://testserver/elsewhere",
        )
        response = self._post_json(
            "/admin-mcp",
            {"jsonrpc": "2.0", "id": 1, "method": "tools/list"},
            HTTP_AUTHORIZATION=f"Bearer {raw}",
        )
        self.assertEqual(response.status_code, 401)
        self.assertIn("resource_metadata", response.headers["WWW-Authenticate"])
