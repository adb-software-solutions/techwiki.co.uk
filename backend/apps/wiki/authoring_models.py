"""Models supporting the owner-only TechWiki authoring API."""

from __future__ import annotations

import hashlib
import secrets
import uuid

from django.conf import settings
from django.db import models
from django.utils import timezone


class AuthoringApiToken(models.Model):
    """Revocable scoped token for the private authoring API.

    Only a SHA-256 digest is stored. The raw bearer token is returned once when
    issued by the management command and cannot be recovered from the database.
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
        expires_at=None,
    ) -> tuple["AuthoringApiToken", str]:
        raw = f"tw_auth_{secrets.token_urlsafe(40)}"
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        token = cls.objects.create(
            user=user,
            name=name,
            token_prefix=raw[:16],
            token_hash=digest,
            scopes=sorted(set(scopes)),
            expires_at=expires_at,
        )
        return token, raw

    @classmethod
    def authenticate(cls, raw: str) -> "AuthoringApiToken | None":
        if not raw.startswith("tw_auth_"):
            return None
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        token = cls.objects.select_related("user").filter(token_hash=digest).first()
        if not token or not token.is_active:
            return None
        token.last_used_at = timezone.now()
        token.save(update_fields=["last_used_at"])
        return token


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
