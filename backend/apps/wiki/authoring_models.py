"""Models supporting the owner-only TechWiki authoring API."""

from __future__ import annotations

import hashlib
import secrets
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


def _token_digest(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class AuthoringApiToken(models.Model):
    """Revocable scoped token for the private authoring API.

    Only a SHA-256 digest is stored. The raw bearer token is returned once when
    issued and cannot be recovered from the database. OAuth tokens may be bound
    to a specific MCP resource; personal API tokens remain unbound.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="authoring_api_tokens",
    )
    name = models.CharField(max_length=100)
    token_prefix = models.CharField(max_length=16, db_index=True)
    token_hash = models.CharField(max_length=64, unique=True)
    scopes = models.JSONField(default=list)
    resource = models.URLField(max_length=500, blank=True, default="")
    expires_at = models.DateTimeField(null=True, blank=True)
    last_used_at = models.DateTimeField(null=True, blank=True)
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.name} ({self.user})"

    @property
    def is_active(self) -> bool:
        if self.revoked_at:
            return False
        return not self.expires_at or self.expires_at > timezone.now()

    @classmethod
    def issue(
        cls,
        *,
        user,
        name: str,
        scopes: list[str],
        resource: str = "",
        expires_at=None,
    ) -> tuple["AuthoringApiToken", str]:
        raw = f"tw_auth_{secrets.token_urlsafe(40)}"
        token = cls.objects.create(
            user=user,
            name=name,
            token_prefix=raw[:16],
            token_hash=_token_digest(raw),
            scopes=sorted(set(scopes)),
            resource=resource,
            expires_at=expires_at,
        )
        return token, raw

    @classmethod
    def authenticate(
        cls,
        raw: str,
        *,
        resource: str | None = "",
    ) -> "AuthoringApiToken | None":
        if not raw.startswith("tw_auth_"):
            return None
        token = cls.objects.select_related("user").filter(token_hash=_token_digest(raw)).first()
        if not token or not token.is_active:
            return None
        if resource is not None and token.resource != resource:
            return None
        token.last_used_at = timezone.now()
        token.save(update_fields=["last_used_at"])
        return token


class AuthoringOAuthClient(models.Model):
    """OAuth client allowed to request owner-only authoring access."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    client_id = models.CharField(max_length=100, unique=True, db_index=True)
    client_secret_hash = models.CharField(max_length=64, blank=True, default="")
    redirect_uris = models.JSONField(default=list)
    scopes = models.JSONField(default=list)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    @classmethod
    def issue(
        cls,
        *,
        name: str,
        redirect_uris: list[str],
        scopes: list[str],
    ) -> tuple["AuthoringOAuthClient", str]:
        client_id = f"tw_client_{secrets.token_urlsafe(18)}"
        secret = f"tw_secret_{secrets.token_urlsafe(36)}"
        client = cls.objects.create(
            name=name,
            client_id=client_id,
            client_secret_hash=_token_digest(secret),
            redirect_uris=sorted(set(redirect_uris)),
            scopes=sorted(set(scopes)),
        )
        return client, secret

    def check_secret(self, raw: str) -> bool:
        return bool(raw) and secrets.compare_digest(self.client_secret_hash, _token_digest(raw))


class AuthoringOAuthCode(models.Model):
    """Short-lived one-time OAuth authorization code with PKCE binding."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client = models.ForeignKey(
        AuthoringOAuthClient,
        on_delete=models.CASCADE,
        related_name="authorization_codes",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="authoring_oauth_codes",
    )
    code_hash = models.CharField(max_length=64, unique=True)
    redirect_uri = models.URLField(max_length=500)
    resource = models.URLField(max_length=500)
    scopes = models.JSONField(default=list)
    code_challenge = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    used_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @classmethod
    def issue(
        cls,
        *,
        client: AuthoringOAuthClient,
        user,
        redirect_uri: str,
        resource: str,
        scopes: list[str],
        code_challenge: str,
        expires_at,
    ) -> tuple["AuthoringOAuthCode", str]:
        raw = f"tw_code_{secrets.token_urlsafe(32)}"
        code = cls.objects.create(
            client=client,
            user=user,
            code_hash=_token_digest(raw),
            redirect_uri=redirect_uri,
            resource=resource,
            scopes=sorted(set(scopes)),
            code_challenge=code_challenge,
            expires_at=expires_at,
        )
        return code, raw

    @classmethod
    def find(cls, raw: str) -> "AuthoringOAuthCode | None":
        return cls.objects.select_related("client", "user").filter(code_hash=_token_digest(raw)).first()


class AuthoringOAuthRefreshToken(models.Model):
    """Rotating refresh token for ChatGPT and other OAuth authoring clients."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    client = models.ForeignKey(
        AuthoringOAuthClient,
        on_delete=models.CASCADE,
        related_name="refresh_tokens",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="authoring_oauth_refresh_tokens",
    )
    token_prefix = models.CharField(max_length=16, db_index=True)
    token_hash = models.CharField(max_length=64, unique=True)
    scopes = models.JSONField(default=list)
    resource = models.URLField(max_length=500)
    expires_at = models.DateTimeField()
    revoked_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def is_active(self) -> bool:
        return not self.revoked_at and self.expires_at > timezone.now()

    @classmethod
    def issue(
        cls,
        *,
        client: AuthoringOAuthClient,
        user,
        scopes: list[str],
        resource: str,
        expires_at,
    ) -> tuple["AuthoringOAuthRefreshToken", str]:
        raw = f"tw_refresh_{secrets.token_urlsafe(40)}"
        token = cls.objects.create(
            client=client,
            user=user,
            token_prefix=raw[:16],
            token_hash=_token_digest(raw),
            scopes=sorted(set(scopes)),
            resource=resource,
            expires_at=expires_at,
        )
        return token, raw

    @classmethod
    def find(cls, raw: str) -> "AuthoringOAuthRefreshToken | None":
        return cls.objects.select_related("client", "user").filter(token_hash=_token_digest(raw)).first()


class AuthoringAuditLog(models.Model):
    """Immutable audit record for private authoring mutations."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    actor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="authoring_audit_events",
    )
    token = models.ForeignKey(
        AuthoringApiToken,
        on_delete=models.SET_NULL,
        null=True,
        related_name="audit_events",
    )
    action = models.CharField(max_length=100, db_index=True)
    object_type = models.CharField(max_length=50, blank=True, default="")
    object_id = models.CharField(max_length=100, blank=True, default="")
    request_id = models.CharField(max_length=100, blank=True, default="", db_index=True)
    before = models.JSONField(null=True, blank=True)
    after = models.JSONField(null=True, blank=True)
    metadata = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.action} {self.object_type}:{self.object_id}"
