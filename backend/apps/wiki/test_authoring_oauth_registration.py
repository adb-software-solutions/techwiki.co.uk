"""Tests for OAuth dynamic client registration on the private authoring service."""

from __future__ import annotations

import base64
import hashlib
import json
import os
from typing import Any
from unittest.mock import patch
from urllib.parse import parse_qs, urlencode, urlparse

from django.test import TestCase

from apps.wiki.authoring_api import ARTICLE_READ, SAFE_AUTHORING_SCOPES
from apps.wiki.authoring_models import AuthoringApiToken, AuthoringOAuthClient
from apps.wiki.models import Article, ArticleStatus, Category
from authentication.models import User

LOOPBACK_CALLBACK = "http://localhost:33418/callback"
RESOURCE = "http://testserver/admin-mcp"


class OAuthDynamicClientRegistrationTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            email="dcr-owner@example.com",
            password="strong-test-password",
            first_name="Dcr",
            last_name="Owner",
            email_verified=True,
        )
        self.owner_patch = patch.dict(
            os.environ,
            {"TECHWIKI_AUTHORING_USER_ID": str(self.user.id)},
        )
        self.owner_patch.start()
        self.addCleanup(self.owner_patch.stop)
        self.verifier = "v" * 64
        digest = hashlib.sha256(self.verifier.encode("ascii")).digest()
        self.challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")

    def _register(self, payload: object) -> Any:
        return self.client.post(
            "/oauth/register",
            data=json.dumps(payload),
            content_type="application/json",
        )

    def _authorize(self, client_id: str, scope: str) -> str:
        self.client.force_login(self.user)
        query = urlencode(
            {
                "client_id": client_id,
                "redirect_uri": LOOPBACK_CALLBACK,
                "response_type": "code",
                "scope": scope,
                "resource": RESOURCE,
                "code_challenge": self.challenge,
                "code_challenge_method": "S256",
            }
        )
        consent = self.client.get(f"/oauth/authorize?{query}")
        self.assertContains(consent, LOOPBACK_CALLBACK)
        authorization = self.client.post(f"/oauth/authorize?{query}", {"decision": "allow"})
        return parse_qs(urlparse(authorization.headers["Location"]).query)["code"][0]

    def test_metadata_advertises_registration_and_public_clients(self) -> None:
        metadata = self.client.get("/.well-known/oauth-authorization-server").json()
        self.assertEqual(metadata["registration_endpoint"], "http://testserver/oauth/register")
        self.assertIn("none", metadata["token_endpoint_auth_methods_supported"])

    def test_public_client_registers_and_completes_pkce_flow(self) -> None:
        registered = self._register(
            {
                "client_name": "Claude Code (techwiki-admin)",
                "redirect_uris": [LOOPBACK_CALLBACK],
                "grant_types": ["authorization_code", "refresh_token"],
                "response_types": ["code"],
                "token_endpoint_auth_method": "none",
            }
        )
        self.assertEqual(registered.status_code, 201)
        body = registered.json()
        self.assertNotIn("client_secret", body)
        self.assertEqual(body["redirect_uris"], [LOOPBACK_CALLBACK])
        client = AuthoringOAuthClient.objects.get(client_id=body["client_id"])
        self.assertTrue(client.is_public)
        self.assertEqual(set(client.scopes), SAFE_AUTHORING_SCOPES)

        code = self._authorize(client.client_id, f"{ARTICLE_READ} offline_access")
        exchanged = self.client.post(
            "/oauth/token",
            {
                "grant_type": "authorization_code",
                "client_id": client.client_id,
                "code": code,
                "redirect_uri": LOOPBACK_CALLBACK,
                "resource": RESOURCE,
                "code_verifier": self.verifier,
            },
        )
        self.assertEqual(exchanged.status_code, 200)
        tokens = exchanged.json()
        self.assertIsNotNone(
            AuthoringApiToken.authenticate(tokens["access_token"], resource=RESOURCE)
        )

        refreshed = self.client.post(
            "/oauth/token",
            {
                "grant_type": "refresh_token",
                "client_id": client.client_id,
                "refresh_token": tokens["refresh_token"],
                "resource": RESOURCE,
            },
        )
        self.assertEqual(refreshed.status_code, 200)
        self.assertNotEqual(refreshed.json()["refresh_token"], tokens["refresh_token"])

    def test_public_client_rejects_a_supplied_secret(self) -> None:
        body = self._register(
            {"redirect_uris": [LOOPBACK_CALLBACK], "token_endpoint_auth_method": "none"}
        ).json()
        response = self.client.post(
            "/oauth/token",
            {
                "grant_type": "authorization_code",
                "client_id": body["client_id"],
                "client_secret": "guess",
            },
        )
        self.assertEqual(response.status_code, 401)

    def test_confidential_registration_returns_working_secret(self) -> None:
        body = self._register(
            {"client_name": "Agent", "redirect_uris": ["http://127.0.0.1:9000/cb"]}
        ).json()
        self.assertEqual(body["token_endpoint_auth_method"], "client_secret_basic")
        client = AuthoringOAuthClient.objects.get(client_id=body["client_id"])
        self.assertFalse(client.is_public)
        self.assertTrue(client.check_secret(body["client_secret"]))

        missing_secret = self.client.post(
            "/oauth/token",
            {"grant_type": "authorization_code", "client_id": client.client_id},
        )
        self.assertEqual(missing_secret.status_code, 401)

    def test_registration_rejects_unsafe_redirect_uris(self) -> None:
        for uris in (
            ["https://attacker.example/callback"],
            ["http://evil.example/callback"],
            ["http://user:pass@localhost/callback"],
            ["http://localhost/callback#frag"],
            [],
            "http://localhost/callback",
            [LOOPBACK_CALLBACK] * 6,
        ):
            with self.subTest(uris=uris):
                response = self._register({"redirect_uris": uris})
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["error"], "invalid_redirect_uri")
        self.assertFalse(AuthoringOAuthClient.objects.exists())

    def test_registration_accepts_configured_web_redirect(self) -> None:
        callback = "https://claude.ai/api/mcp/auth_callback"
        with patch.dict(os.environ, {"TECHWIKI_AUTHORING_OAUTH_REDIRECT_URIS": callback}):
            response = self._register({"redirect_uris": [callback]})
        self.assertEqual(response.status_code, 201)

    def test_registration_rejects_invalid_metadata(self) -> None:
        cases: list[object] = [
            {"redirect_uris": [LOOPBACK_CALLBACK], "token_endpoint_auth_method": "private_key_jwt"},
            {"redirect_uris": [LOOPBACK_CALLBACK], "grant_types": ["client_credentials"]},
            {"redirect_uris": [LOOPBACK_CALLBACK], "response_types": ["token"]},
            {"redirect_uris": [LOOPBACK_CALLBACK], "scope": "articles:publish"},
            {"redirect_uris": [LOOPBACK_CALLBACK], "scope": ["articles:read"]},
            ["not", "an", "object"],
        ]
        for payload in cases:
            with self.subTest(payload=payload):
                response = self._register(payload)
                self.assertEqual(response.status_code, 400)
                self.assertEqual(response.json()["error"], "invalid_client_metadata")

        malformed = self.client.post("/oauth/register", data="{", content_type="application/json")
        self.assertEqual(malformed.status_code, 400)

    def test_registration_narrows_scopes_and_defaults_name(self) -> None:
        body = self._register(
            {"redirect_uris": [LOOPBACK_CALLBACK], "scope": f"{ARTICLE_READ} offline_access"}
        ).json()
        client = AuthoringOAuthClient.objects.get(client_id=body["client_id"])
        self.assertEqual(client.scopes, [ARTICLE_READ])
        self.assertEqual(client.name, "Unnamed MCP client")
        self.assertEqual(body["scope"], f"{ARTICLE_READ} offline_access")


class PublicArticleAuthorPrivacyTests(TestCase):
    def test_public_article_payload_omits_author_email(self) -> None:
        author = User.objects.create_user(
            email="private-author@example.com",
            password="strong-test-password",
            first_name="Private",
            last_name="Author",
            email_verified=True,
        )
        category = Category.objects.create(name="Linux", slug="linux")
        Article.objects.create(
            title="Visible article",
            slug="visible-article",
            content="Body",
            category=category,
            author=author,
            status=ArticleStatus.PUBLISHED,
        )
        response = self.client.get("/api/wiki/articles")
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("private-author@example.com", response.content.decode())
        self.assertEqual(response.json()["articles"][0]["author"]["first_name"], "Private")
