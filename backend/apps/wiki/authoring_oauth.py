"""OAuth 2.1-style authorization flow for the owner-only authoring service."""

from __future__ import annotations

import base64
import hashlib
import os
from datetime import timedelta
from html import escape
from urllib.parse import urlencode

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

OFFLINE_ACCESS = "offline_access"
OAUTH_SCOPES = SAFE_AUTHORING_SCOPES | {OFFLINE_ACCESS}
ACCESS_TOKEN_LIFETIME = timedelta(hours=1)
REFRESH_TOKEN_LIFETIME = timedelta(days=30)
AUTHORIZATION_CODE_LIFETIME = timedelta(minutes=5)


def _issuer(request: HttpRequest) -> str:
    return request.build_absolute_uri("/").rstrip("/")


def _owner_matches(request: HttpRequest) -> bool:
    owner_id = os.environ.get("TECHWIKI_AUTHORING_USER_ID", "").strip()
    return bool(
        owner_id
        and request.user.is_authenticated
        and request.user.is_active
        and str(request.user.id) == owner_id
    )


def _oauth_error(error: str, description: str, status: int = 400) -> JsonResponse:
    response = JsonResponse({"error": error, "error_description": description}, status=status)
    response["Cache-Control"] = "no-store"
    response["Pragma"] = "no-cache"
    return response


def _requested_scopes(value: str) -> list[str]:
    scopes = [scope for scope in value.split() if scope]
    if not scopes:
        scopes = sorted(SAFE_AUTHORING_SCOPES)
    if set(scopes) - OAUTH_SCOPES:
        raise ValueError("One or more requested scopes are not supported")
    return sorted(set(scopes))


def _load_client(client_id: str) -> AuthoringOAuthClient | None:
    return AuthoringOAuthClient.objects.filter(client_id=client_id, is_active=True).first()


def _validate_authorization_request(request: HttpRequest):
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

    scopes = _requested_scopes(request.GET.get("scope", ""))
    requested_authoring_scopes = set(scopes) - {OFFLINE_ACCESS}
    if requested_authoring_scopes - set(client.scopes):
        raise ValueError("OAuth client is not permitted to request one or more scopes")
    return client, redirect_uri, scopes, code_challenge


@require_GET
def oauth_authorization_server_metadata(request: HttpRequest) -> JsonResponse:
    issuer = _issuer(request)
    return JsonResponse(
        {
            "issuer": issuer,
            "authorization_endpoint": f"{issuer}/oauth/authorize",
            "token_endpoint": f"{issuer}/oauth/token",
            "revocation_endpoint": f"{issuer}/oauth/revoke",
            "response_types_supported": ["code"],
            "grant_types_supported": ["authorization_code", "refresh_token"],
            "code_challenge_methods_supported": ["S256"],
            "token_endpoint_auth_methods_supported": ["client_secret_basic", "client_secret_post"],
            "scopes_supported": sorted(OAUTH_SCOPES),
        }
    )


@require_GET
def oauth_protected_resource_metadata(request: HttpRequest) -> JsonResponse:
    issuer = _issuer(request)
    return JsonResponse(
        {
            "resource": f"{issuer}/api/authoring/v1/mcp",
            "authorization_servers": [issuer],
            "scopes_supported": sorted(SAFE_AUTHORING_SCOPES),
            "bearer_methods_supported": ["header"],
        }
    )


@csrf_protect
def oauth_authorize(request: HttpRequest) -> HttpResponse:
    try:
        client, redirect_uri, scopes, code_challenge = _validate_authorization_request(request)
    except ValueError as exc:
        return HttpResponse(escape(str(exc)), status=400, content_type="text/plain")

    if not request.user.is_authenticated:
        login_url = f"{settings.AUTH_FRONTEND_URL.rstrip('/')}/login"
        return redirect(f"{login_url}?{urlencode({'next': request.build_absolute_uri()})}")
    if not _owner_matches(request):
        return HttpResponse("This TechWiki account cannot authorize the authoring service.", status=403)

    state = request.GET.get("state", "")
    if request.method == "POST":
        decision = request.POST.get("decision", "")
        if decision != "allow":
            params = {"error": "access_denied"}
            if state:
                params["state"] = state
            return redirect(f"{redirect_uri}?{urlencode(params)}")

        _, raw_code = AuthoringOAuthCode.issue(
            client=client,
            user=request.user,
            redirect_uri=redirect_uri,
            scopes=scopes,
            code_challenge=code_challenge,
            expires_at=timezone.now() + AUTHORIZATION_CODE_LIFETIME,
        )
        params = {"code": raw_code}
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
            decoded = base64.b64decode(authorization[6:]).decode("utf-8")
            return tuple(decoded.split(":", 1))  # type: ignore[return-value]
        except (ValueError, UnicodeDecodeError):
            return "", ""
    return request.POST.get("client_id", ""), request.POST.get("client_secret", "")


def _authenticated_client(request: HttpRequest) -> AuthoringOAuthClient | None:
    client_id, client_secret = _client_credentials(request)
    client = _load_client(client_id.strip())
    if not client or not client.check_secret(client_secret):
        return None
    return client


def _pkce_matches(verifier: str, challenge: str) -> bool:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    encoded = base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")
    return encoded == challenge


def _issue_token_response(
    *,
    client: AuthoringOAuthClient,
    user,
    scopes: list[str],
    include_refresh: bool,
) -> JsonResponse:
    authoring_scopes = sorted(set(scopes) - {OFFLINE_ACCESS})
    _token, raw_access = AuthoringApiToken.issue(
        user=user,
        name=f"OAuth: {client.name}",
        scopes=authoring_scopes,
        expires_at=timezone.now() + ACCESS_TOKEN_LIFETIME,
    )
    payload: dict[str, object] = {
        "access_token": raw_access,
        "token_type": "Bearer",
        "expires_in": int(ACCESS_TOKEN_LIFETIME.total_seconds()),
        "scope": " ".join(scopes),
    }
    if include_refresh:
        _refresh, raw_refresh = AuthoringOAuthRefreshToken.issue(
            client=client,
            user=user,
            scopes=scopes,
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
            return _oauth_error("invalid_grant", "Authorization code has expired or was already used")
        if request.POST.get("redirect_uri", "") != code.redirect_uri:
            return _oauth_error("invalid_grant", "Redirect URI does not match the authorization request")
        verifier = request.POST.get("code_verifier", "")
        if not verifier or not _pkce_matches(verifier, code.code_challenge):
            return _oauth_error("invalid_grant", "PKCE verification failed")

        code.used_at = timezone.now()
        code.save(update_fields=["used_at"])
        return _issue_token_response(
            client=client,
            user=code.user,
            scopes=code.scopes,
            include_refresh=OFFLINE_ACCESS in code.scopes,
        )

    if grant_type == "refresh_token":
        raw_refresh = request.POST.get("refresh_token", "")
        refresh_token = AuthoringOAuthRefreshToken.find(raw_refresh)
        if not refresh_token or refresh_token.client_id != client.id or not refresh_token.is_active:
            return _oauth_error("invalid_grant", "Refresh token is invalid or expired")
        refresh_token.revoked_at = timezone.now()
        refresh_token.save(update_fields=["revoked_at"])
        return _issue_token_response(
            client=client,
            user=refresh_token.user,
            scopes=refresh_token.scopes,
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
    access = AuthoringApiToken.authenticate(raw)
    if access:
        access.revoked_at = timezone.now()
        access.save(update_fields=["revoked_at"])
    refresh = AuthoringOAuthRefreshToken.find(raw) if raw else None
    if refresh and refresh.client_id == client.id:
        refresh.revoked_at = timezone.now()
        refresh.save(update_fields=["revoked_at"])
    return HttpResponse(status=200)
