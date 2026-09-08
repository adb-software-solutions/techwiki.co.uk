"""Django admin registration for private TechWiki authoring access."""

from django.contrib import admin
from django.http import HttpRequest

from apps.wiki.authoring_models import (
    AuthoringApiToken,
    AuthoringAuditLog,
    AuthoringOAuthClient,
    AuthoringOAuthCode,
    AuthoringOAuthRefreshToken,
)


@admin.register(AuthoringApiToken)
class AuthoringApiTokenAdmin(admin.ModelAdmin[AuthoringApiToken]):
    """Inspect and revoke private authoring credentials."""

    list_display = (
        "name",
        "user",
        "token_prefix",
        "scope_summary",
        "last_used_at",
        "expires_at",
        "revoked_at",
        "created_at",
    )
    list_filter = ("revoked_at", "created_at", "expires_at")
    search_fields = ("name", "user__email", "token_prefix")
    readonly_fields = (
        "id",
        "user",
        "name",
        "token_prefix",
        "token_hash",
        "scopes",
        "expires_at",
        "last_used_at",
        "created_at",
    )
    fields = readonly_fields + ("revoked_at",)
    ordering = ("-created_at",)

    @admin.display(description="Scopes")
    def scope_summary(self, obj: AuthoringApiToken) -> str:
        return ", ".join(obj.scopes)

    def has_add_permission(self, request: HttpRequest) -> bool:
        """Tokens must be issued by a command or OAuth exchange."""
        return False

    def has_delete_permission(
        self,
        request: HttpRequest,
        obj: AuthoringApiToken | None = None,
    ) -> bool:
        """Keep revoked credentials for the audit trail."""
        return False


@admin.register(AuthoringOAuthClient)
class AuthoringOAuthClientAdmin(admin.ModelAdmin[AuthoringOAuthClient]):
    """Inspect OAuth clients used by ChatGPT and other authoring agents."""

    list_display = ("name", "client_id", "is_active", "created_at")
    list_filter = ("is_active", "created_at")
    search_fields = ("name", "client_id")
    readonly_fields = (
        "id",
        "name",
        "client_id",
        "client_secret_hash",
        "redirect_uris",
        "scopes",
        "created_at",
    )
    fields = readonly_fields + ("is_active",)

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_delete_permission(
        self,
        request: HttpRequest,
        obj: AuthoringOAuthClient | None = None,
    ) -> bool:
        return False


@admin.register(AuthoringOAuthCode)
class AuthoringOAuthCodeAdmin(admin.ModelAdmin[AuthoringOAuthCode]):
    """Read-only OAuth authorization-code history."""

    list_display = ("client", "user", "expires_at", "used_at", "created_at")
    readonly_fields = (
        "id",
        "client",
        "user",
        "code_hash",
        "redirect_uri",
        "scopes",
        "code_challenge",
        "expires_at",
        "used_at",
        "created_at",
    )

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_change_permission(
        self,
        request: HttpRequest,
        obj: AuthoringOAuthCode | None = None,
    ) -> bool:
        return False

    def has_delete_permission(
        self,
        request: HttpRequest,
        obj: AuthoringOAuthCode | None = None,
    ) -> bool:
        return False


@admin.register(AuthoringOAuthRefreshToken)
class AuthoringOAuthRefreshTokenAdmin(admin.ModelAdmin[AuthoringOAuthRefreshToken]):
    """Inspect and revoke OAuth refresh tokens."""

    list_display = ("client", "user", "token_prefix", "expires_at", "revoked_at", "created_at")
    list_filter = ("client", "revoked_at", "created_at")
    search_fields = ("user__email", "token_prefix", "client__name")
    readonly_fields = (
        "id",
        "client",
        "user",
        "token_prefix",
        "token_hash",
        "scopes",
        "expires_at",
        "created_at",
    )
    fields = readonly_fields + ("revoked_at",)

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_delete_permission(
        self,
        request: HttpRequest,
        obj: AuthoringOAuthRefreshToken | None = None,
    ) -> bool:
        return False


@admin.register(AuthoringAuditLog)
class AuthoringAuditLogAdmin(admin.ModelAdmin[AuthoringAuditLog]):
    """Read-only mutation audit history."""

    list_display = (
        "created_at",
        "actor",
        "action",
        "object_type",
        "object_id",
        "request_id",
    )
    list_filter = ("action", "object_type", "created_at")
    search_fields = ("actor__email", "action", "object_id", "request_id")
    readonly_fields = (
        "id",
        "actor",
        "token",
        "action",
        "object_type",
        "object_id",
        "request_id",
        "before",
        "after",
        "metadata",
        "created_at",
    )
    ordering = ("-created_at",)

    def has_add_permission(self, request: HttpRequest) -> bool:
        return False

    def has_change_permission(
        self,
        request: HttpRequest,
        obj: AuthoringAuditLog | None = None,
    ) -> bool:
        return False

    def has_delete_permission(
        self,
        request: HttpRequest,
        obj: AuthoringAuditLog | None = None,
    ) -> bool:
        return False
