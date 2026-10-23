"""OAuth 2.1-style authorization flow for the owner-only authoring service."""

from __future__ import annotations

import base64
import binascii
import hashlib
import json
import os
import secrets
from datetime import timedelta
from html import escape
from urllib.parse import urlencode, urlparse

from django.conf import settings
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.middleware.csrf import get_token
from django.shortcuts import redirect
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt, csrf_protect
from django.views.decorators.http import require_GET, require_POST

from apps.wiki.authoring_api import SAFE_AUTHORING_SCOPES
from apps.wiki.authoring_models import (
    AuthoringApiToken,
    AuthoringOAuthClient,
    AuthoringOAuthCode,
    AuthoringOAuthRefreshToken,
)
from authentication.models import User
from authentication.ratelimit import rate_limit

OFFLINE_ACCESS = "offline_access"
OAUTH_SCOPES = SAFE_AUTHORING_SCOPES | {OFFLINE_ACCESS}
ACCESS_TOKEN_LIFETIME = timedelta(hours=1)
REFRESH_TOKEN_LIFETIME = timedelta(days=30)
AUTHORIZATION_CODE_LIFETIME = timedelta(minutes=5)
LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}
MAX_REGISTERED_REDIRECT_URIS = 5


def _issuer(request: HttpRequest) -> str:
    return request.build_absolute_uri("/").rstrip("/")


def _mcp_resource(request: HttpRequest) -> str:
    return request.build_absolute_uri("/admin-mcp")


def _is_owner_user(user: User) -> bool:
    owner_id = os.environ.get("TECHWIKI_AUTHORING_USER_ID", "").strip()
    return bool(owner_id and user.is_active and str(user.id) == owner_id)


def _owner_matches(request: HttpRequest) -> bool:
    return bool(request.user.is_authenticated and _is_owner_user(request.user))


def _oauth_error(error: str, description: str, status: int = 400) -> JsonResponse:
    response = JsonResponse({"error": error, "error_description": description}, status=status)
    response["Cache-Control"] = "no-store"
    response["Pragma"] = "no-cache"
    return response


def _requested_scopes(value: str) -> list[str]:
    scopes = [scope for scope in value.split() if scope]
    if set(scopes) - OAUTH_SCOPES:
        raise ValueError("One or more requested scopes are not supported")
    return sorted(set(scopes))


def _load_client(client_id: str) -> AuthoringOAuthClient | None:
    return AuthoringOAuthClient.objects.filter(client_id=client_id, is_active=True).first()


def _validate_resource(request: HttpRequest, value: str) -> str:
    resource = value.strip()
    expected = _mcp_resource(request)
    if resource != expected:
        raise ValueError("resource must identify the TechWiki private MCP server")
    return resource


def _validate_authorization_request(
    request: HttpRequest,
) -> tuple[AuthoringOAuthClient, str, str, list[str], str]:
    client_id = request.GET.get("client_id", "").strip()
    redirect_uri = request.GET.get("redirect_uri", "").strip()
    response_type = request.GET.get("response_type", "").strip()
    code_challenge = request.GET.get("code_challenge", "").strip()
    challenge_method = request.GET.get("code_challenge_method", "").strip()

    client = _load_client(client_id)
    if not client:
        raise ValueError("Unknown OAuth client")
    if redirect_uri not in client.redirect_uris:
        raise ValueError("Redirect URI is not registered for this client")
    if response_type != "code":
        raise ValueError("Only authorization code responses are supported")
    if not code_challenge or challenge_method != "S256":
        raise ValueError("PKCE with code_challenge_method=S256 is required")
    resource = _validate_resource(request, request.GET.get("resource", ""))

    scope_value = request.GET.get("scope", "").strip()
    scopes = _requested_scopes(scope_value) if scope_value else sorted(set(client.scopes))
    requested_authoring_scopes = set(scopes) - {OFFLINE_ACCESS}
    if requested_authoring_scopes - set(client.scopes):
        raise ValueError("OAuth client is not permitted to request one or more scopes")
    return client, redirect_uri, resource, scopes, code_challenge


@require_GET
def oauth_authorization_server_metadata(request: HttpRequest) -> JsonResponse:
    issuer = _issuer(request)
    return JsonResponse(
        {
            "issuer": issuer,
            "authorization_endpoint": f"{issuer}/oauth/authorize",
            "token_endpoint": f"{issuer}/oauth/token",
            "revocation_endpoint": f"{issuer}/oauth/revoke",
            "registration_endpoint": f"{issuer}/oauth/register",
            "response_types_supported": ["code"],
            "grant_types_supported": ["authorization_code", "refresh_token"],
            "code_challenge_methods_supported": ["S256"],
            "token_endpoint_auth_methods_supported": [
                "client_secret_basic",
                "client_secret_post",
                "none",
            ],
            "scopes_supported": sorted(OAUTH_SCOPES),
        }
    )


@csrf_protect
def oauth_authorize(request: HttpRequest) -> HttpResponse:
    try:
        client, redirect_uri, resource, scopes, code_challenge = _validate_authorization_request(
            request
        )
    except ValueError as exc:
        return HttpResponse(escape(str(exc)), status=400, content_type="text/plain")

    if not request.user.is_authenticated:
        login_url = f"{settings.AUTH_FRONTEND_URL.rstrip('/')}/login"
        return redirect(f"{login_url}?{urlencode({'next': request.build_absolute_uri()})}")
    if not _owner_matches(request):
        return HttpResponse(
            "This TechWiki account cannot authorize the authoring service.", status=403
        )

    state = request.GET.get("state", "")
    issuer = _issuer(request)
    if request.method == "POST":
        decision = request.POST.get("decision", "")
        if decision != "allow":
            params = {"error": "access_denied", "iss": issuer}
            if state:
                params["state"] = state
            return redirect(f"{redirect_uri}?{urlencode(params)}")

        _, raw_code = AuthoringOAuthCode.issue(
            client=client,
            user=request.user,
            redirect_uri=redirect_uri,
            resource=resource,
            scopes=scopes,
            code_challenge=code_challenge,
            expires_at=timezone.now() + AUTHORIZATION_CODE_LIFETIME,
        )
        params = {"code": raw_code, "iss": issuer}
        if state:
            params["state"] = state
        return redirect(f"{redirect_uri}?{urlencode(params)}")

    csrf_token = get_token(request)
    scope_items = "".join(f"<li><code>{escape(scope)}</code></li>" for scope in scopes)
    html = f"""<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Authorize TechWiki Authoring</title></head>
<body style="font-family:system-ui,sans-serif;max-width:720px;margin:48px auto;padding:0 20px;line-height:1.5">
<h1>Authorize TechWiki Authoring</h1>
<p><strong>{escape(client.name)}</strong> is requesting access to your private TechWiki authoring tools.</p>
<p>After approval you will be returned to <code>{escape(redirect_uri)}</code>.</p>
<p>This authorization is restricted to the configured TechWiki owner account. Publishing is not included.</p>
<ul>{scope_items}</ul>
<form method="post">
<input type="hidden" name="csrfmiddlewaretoken" value="{escape(csrf_token)}">
<button type="submit" name="decision" value="allow">Allow</button>
<button type="submit" name="decision" value="deny">Deny</button>
</form>
</body></html>"""
    return HttpResponse(html, content_type="text/html")


def _client_credentials(request: HttpRequest) -> tuple[str, str]:
    authorization = request.headers.get("Authorization", "")
    if authorization.startswith("Basic "):
        try:
            decoded = base64.b64decode(authorization[6:], validate=True).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError, ValueError):
            return "", ""
        parts = decoded.split(":", 1)
        if len(parts) != 2:
            return "", ""
        return parts[0], parts[1]
    return request.POST.get("client_id", ""), request.POST.get("client_secret", "")


def _authenticated_client(request: HttpRequest) -> AuthoringOAuthClient | None:
    client_id, client_secret = _client_credentials(request)
    client = _load_client(client_id.strip())
    if not client:
        return None
    if client.is_public:
        # Public clients prove possession through PKCE and refresh rotation instead.
        return None if client_secret else client
    if not client.check_secret(client_secret):
        return None
    return client


def _allowed_registration_redirect_uris() -> set[str]:
    configured = os.environ.get("TECHWIKI_AUTHORING_OAUTH_REDIRECT_URIS", "")
    return {uri.strip() for uri in configured.split(",") if uri.strip()}


def _registrable_redirect_uri(uri: str) -> bool:
    """Allow loopback callbacks for native clients plus explicitly configured web callbacks."""
    if uri in _allowed_registration_redirect_uris():
        return True
    parsed = urlparse(uri)
    return (
        parsed.scheme == "http"
        and parsed.hostname in LOOPBACK_HOSTS
        and not parsed.fragment
        and not parsed.username
        and not parsed.password
    )


@csrf_exempt
@require_POST
@rate_limit("oauth_register")
def oauth_register(request: HttpRequest) -> JsonResponse:
    """RFC 7591 dynamic client registration, limited to safe redirect URIs."""
    try:
        metadata = json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        return _oauth_error("invalid_client_metadata", "Request body must be JSON")
    if not isinstance(metadata, dict):
        return _oauth_error("invalid_client_metadata", "Request body must be a JSON object")

    redirect_uris = metadata.get("redirect_uris")
    if (
        not isinstance(redirect_uris, list)
        or not redirect_uris
        or len(redirect_uris) > MAX_REGISTERED_REDIRECT_URIS
        or not all(isinstance(uri, str) and len(uri) <= 500 for uri in redirect_uris)
    ):
        return _oauth_error("invalid_redirect_uri", "redirect_uris must list 1-5 URIs")
    if not all(_registrable_redirect_uri(uri) for uri in redirect_uris):
        return _oauth_error(
            "invalid_redirect_uri",
            "Only loopback or explicitly allowed redirect URIs can be registered",
        )

    auth_method = metadata.get("token_endpoint_auth_method", "client_secret_basic")
    if auth_method not in {"client_secret_basic", "client_secret_post", "none"}:
        return _oauth_error("invalid_client_metadata", "Unsupported token_endpoint_auth_method")
    grant_types = metadata.get("grant_types", ["authorization_code"])
    if not isinstance(grant_types, list) or set(grant_types) - {
        "authorization_code",
        "refresh_token",
    }:
        return _oauth_error("invalid_client_metadata", "Unsupported grant_types")
    response_types = metadata.get("response_types", ["code"])
    if response_types != ["code"]:
        return _oauth_error("invalid_client_metadata", "Only the code response type is supported")

    scope_value = metadata.get("scope", "")
    if not isinstance(scope_value, str):
        return _oauth_error("invalid_client_metadata", "scope must be a string")
    try:
        requested = _requested_scopes(scope_value)
    except ValueError as exc:
        return _oauth_error("invalid_client_metadata", str(exc))
    scopes = sorted(set(requested) - {OFFLINE_ACCESS}) or sorted(SAFE_AUTHORING_SCOPES)

    client_name = metadata.get("client_name")
    name = client_name.strip()[:100] if isinstance(client_name, str) else ""
    client, secret = AuthoringOAuthClient.issue(
        name=name or "Unnamed MCP client",
        redirect_uris=redirect_uris,
        scopes=scopes,
        confidential=auth_method != "none",
    )
    payload: dict[str, object] = {
        "client_id": client.client_id,
        "client_id_issued_at": int(client.created_at.timestamp()),
        "client_name": client.name,
        "redirect_uris": client.redirect_uris,
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": auth_method,
        "scope": " ".join([*client.scopes, OFFLINE_ACCESS]),
    }
    if secret:
        payload["client_secret"] = secret
        payload["client_secret_expires_at"] = 0
    response = JsonResponse(payload, status=201)
    response["Cache-Control"] = "no-store"
    response["Pragma"] = "no-cache"
    return response


def _pkce_matches(verifier: str, challenge: str) -> bool:
    if not 43 <= len(verifier) <= 128:
        return False
    try:
        digest = hashlib.sha256(verifier.encode("ascii")).digest()
    except UnicodeEncodeError:
        return False
    encoded = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return secrets.compare_digest(encoded, challenge)


def _issue_token_response(
    *,
    client: AuthoringOAuthClient,
    user: User,
    scopes: list[str],
    resource: str,
    include_refresh: bool,
) -> JsonResponse:
    if not _is_owner_user(user):
        return _oauth_error(
            "access_denied", "The configured authoring owner is no longer available", 403
        )

    authoring_scopes = sorted(set(scopes) - {OFFLINE_ACCESS})
    _token, raw_access = AuthoringApiToken.issue(
        user=user,
        name=f"OAuth: {client.name}",
        scopes=authoring_scopes,
        resource=resource,
        expires_at=timezone.now() + ACCESS_TOKEN_LIFETIME,
    )
    payload: dict[str, object] = {
        "access_token": raw_access,
        "token_type": "Bearer",
        "expires_in": int(ACCESS_TOKEN_LIFETIME.total_seconds()),
        "scope": " ".join(scopes),
        "resource": resource,
    }
    if include_refresh:
        _refresh, raw_refresh = AuthoringOAuthRefreshToken.issue(
            client=client,
            user=user,
            scopes=scopes,
            resource=resource,
            expires_at=timezone.now() + REFRESH_TOKEN_LIFETIME,
        )
        payload["refresh_token"] = raw_refresh

    response = JsonResponse(payload)
    response["Cache-Control"] = "no-store"
    response["Pragma"] = "no-cache"
    return response


@csrf_exempt
@require_POST
def oauth_token(request: HttpRequest) -> JsonResponse:
    client = _authenticated_client(request)
    if not client:
        return _oauth_error("invalid_client", "Client authentication failed", 401)

    grant_type = request.POST.get("grant_type", "")
    if grant_type == "authorization_code":
        raw_code = request.POST.get("code", "")
        code = AuthoringOAuthCode.find(raw_code)
        if not code or code.client_id != client.id:
            return _oauth_error("invalid_grant", "Authorization code is invalid")
        if code.used_at or code.expires_at <= timezone.now():
            return _oauth_error(
                "invalid_grant", "Authorization code has expired or was already used"
            )
        if request.POST.get("redirect_uri", "") != code.redirect_uri:
            return _oauth_error(
                "invalid_grant", "Redirect URI does not match the authorization request"
            )
        if request.POST.get("resource", "") != code.resource:
            return _oauth_error(
                "invalid_target", "Resource does not match the authorization request"
            )
        verifier = request.POST.get("code_verifier", "")
        if not _pkce_matches(verifier, code.code_challenge):
            return _oauth_error("invalid_grant", "PKCE verification failed")

        code.used_at = timezone.now()
        code.save(update_fields=["used_at"])
        return _issue_token_response(
            client=client,
            user=code.user,
            scopes=code.scopes,
            resource=code.resource,
            include_refresh=OFFLINE_ACCESS in code.scopes,
        )

    if grant_type == "refresh_token":
        raw_refresh = request.POST.get("refresh_token", "")
        refresh_token = AuthoringOAuthRefreshToken.find(raw_refresh)
        if not refresh_token or refresh_token.client_id != client.id or not refresh_token.is_active:
            return _oauth_error("invalid_grant", "Refresh token is invalid or expired")
        if request.POST.get("resource", "") != refresh_token.resource:
            return _oauth_error("invalid_target", "Resource does not match the refresh token")
        if not _is_owner_user(refresh_token.user):
            return _oauth_error(
                "access_denied", "The configured authoring owner is no longer available", 403
            )
        refresh_token.revoked_at = timezone.now()
        refresh_token.save(update_fields=["revoked_at"])
        return _issue_token_response(
            client=client,
            user=refresh_token.user,
            scopes=refresh_token.scopes,
            resource=refresh_token.resource,
            include_refresh=True,
        )

    return _oauth_error("unsupported_grant_type", "Unsupported OAuth grant type")


@csrf_exempt
@require_POST
def oauth_revoke(request: HttpRequest) -> HttpResponse:
    client = _authenticated_client(request)
    if not client:
        return _oauth_error("invalid_client", "Client authentication failed", 401)

    raw = request.POST.get("token", "")
    access = AuthoringApiToken.authenticate(raw, resource=None)
    if access and access.resource == _mcp_resource(request) and _is_owner_user(access.user):
        access.revoked_at = timezone.now()
        access.save(update_fields=["revoked_at"])
    refresh = AuthoringOAuthRefreshToken.find(raw) if raw else None
    if refresh and refresh.client_id == client.id:
        refresh.revoked_at = timezone.now()
        refresh.save(update_fields=["revoked_at"])
    return HttpResponse(status=200)
