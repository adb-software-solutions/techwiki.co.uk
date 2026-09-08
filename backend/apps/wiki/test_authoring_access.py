"""Tests for owner-only TechWiki authoring API, OAuth, and MCP access."""

from __future__ import annotations

import base64
import hashlib
import json
import os
from unittest.mock import patch
from urllib.parse import parse_qs, urlencode, urlparse

from django.test import TestCase

from apps.wiki.authoring_api import ARTICLE_CREATE, ARTICLE_READ, CATEGORY_CREATE, CATEGORY_READ
from apps.wiki.authoring_models import AuthoringApiToken, AuthoringOAuthClient
from apps.wiki.models import Article, ArticleStatus, Category
from authentication.models import User


class AuthoringAccessTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            email="owner@example.com",
            password="strong-test-password",
            first_name="Owner",
            last_name="User",
            email_verified=True,
        )
        self.owner_patch = patch.dict(os.environ, {"TECHWIKI_AUTHORING_USER_ID": str(self.user.id)})
        self.owner_patch.start()
        self.addCleanup(self.owner_patch.stop)
        self.token, self.raw_token = AuthoringApiToken.issue(
            user=self.user,
            name="Tests",
            scopes=[ARTICLE_READ, ARTICLE_CREATE, CATEGORY_READ, CATEGORY_CREATE],
        )

    def test_rest_api_rejects_missing_bearer(self) -> None:
        response = self.client.get("/api/authoring/v1/")
        self.assertEqual(response.status_code, 401)

    def test_rest_api_creates_draft_only(self) -> None:
        category = Category.objects.create(name="Linux", slug="linux")
        response = self.client.post(
            "/api/authoring/v1/articles",
            data=json.dumps(
                {
                    "title": "Test troubleshooting article",
                    "content": "# Fix\n\nRun the diagnostic command.",
                    "category_id": str(category.id),
                }
            ),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {self.raw_token}",
        )
        self.assertEqual(response.status_code, 200)
        article = Article.objects.get(title="Test troubleshooting article")
        self.assertEqual(article.status, ArticleStatus.DRAFT)
        self.assertEqual(article.author, self.user)

    def test_rest_api_rejects_mcp_bound_token(self) -> None:
        _token, raw = AuthoringApiToken.issue(
            user=self.user,
            name="OAuth test",
            scopes=[ARTICLE_READ],
            resource="http://testserver/admin-mcp",
        )
        response = self.client.get(
            "/api/authoring/v1/",
            HTTP_AUTHORIZATION=f"Bearer {raw}",
        )
        self.assertEqual(response.status_code, 401)

    def test_mcp_advertises_oauth_when_unauthorized(self) -> None:
        response = self.client.post(
            "/admin-mcp",
            data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 401)
        self.assertIn("resource_metadata=", response.headers["WWW-Authenticate"])

    def test_mcp_lists_authoring_tools(self) -> None:
        response = self.client.post(
            "/admin-mcp",
            data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {self.raw_token}",
        )
        self.assertEqual(response.status_code, 200)
        names = {tool["name"] for tool in response.json()["result"]["tools"]}
        self.assertIn("create_article_draft", names)
        self.assertIn("create_category", names)
        self.assertNotIn("publish_article", names)

    def _oauth_client(self) -> tuple[AuthoringOAuthClient, str, str, str]:
        client, secret = AuthoringOAuthClient.issue(
            name="ChatGPT",
            redirect_uris=["https://chatgpt.com/aip/callback"],
            scopes=[ARTICLE_READ],
        )
        verifier = "a" * 64
        challenge = (
            base64.urlsafe_b64encode(hashlib.sha256(verifier.encode("ascii")).digest())
            .rstrip(b"=")
            .decode("ascii")
        )
        return client, secret, verifier, challenge

    def test_oauth_authorization_requires_owner_login(self) -> None:
        client, _secret, _verifier, challenge = self._oauth_client()
        response = self.client.get(
            "/oauth/authorize",
            {
                "client_id": client.client_id,
                "redirect_uri": "https://chatgpt.com/aip/callback",
                "response_type": "code",
                "scope": f"{ARTICLE_READ} offline_access",
                "resource": "http://testserver/admin-mcp",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "state": "test-state",
            },
        )
        self.assertEqual(response.status_code, 302)
        self.assertIn("/login?", response.headers["Location"])

    def test_oauth_code_exchange_binds_access_token_to_mcp(self) -> None:
        client, secret, verifier, challenge = self._oauth_client()
        self.client.force_login(self.user)
        query = urlencode(
            {
                "client_id": client.client_id,
                "redirect_uri": "https://chatgpt.com/aip/callback",
                "response_type": "code",
                "scope": f"{ARTICLE_READ} offline_access",
                "resource": "http://testserver/admin-mcp",
                "code_challenge": challenge,
                "code_challenge_method": "S256",
                "state": "state-value",
            }
        )
        authorization = self.client.post(f"/oauth/authorize?{query}", {"decision": "allow"})
        self.assertEqual(authorization.status_code, 302)
        redirect_query = parse_qs(urlparse(authorization.headers["Location"]).query)
        self.assertEqual(redirect_query["state"], ["state-value"])
        self.assertEqual(redirect_query["iss"], ["http://testserver"])
        code = redirect_query["code"][0]

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
        payload = token_response.json()
        self.assertEqual(payload["resource"], "http://testserver/admin-mcp")
        self.assertIn("refresh_token", payload)

        access = payload["access_token"]
        self.assertEqual(
            self.client.get(
                "/api/authoring/v1/",
                HTTP_AUTHORIZATION=f"Bearer {access}",
            ).status_code,
            401,
        )
        mcp_response = self.client.post(
            "/admin-mcp",
            data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/list"}),
            content_type="application/json",
            HTTP_AUTHORIZATION=f"Bearer {access}",
        )
        self.assertEqual(mcp_response.status_code, 200)

    def test_oauth_metadata_points_to_private_mcp(self) -> None:
        response = self.client.get("/.well-known/oauth-protected-resource")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["resource"].endswith("/admin-mcp"))
