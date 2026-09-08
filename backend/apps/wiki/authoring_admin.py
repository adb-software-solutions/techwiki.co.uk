"""Django admin registration for private TechWiki authoring access."""

from django.contrib import admin

from apps.wiki.authoring_models import AuthoringApiToken, AuthoringAuditLog


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

    def has_add_permission(self, request) -> bool:
        """Tokens must be issued by the command so raw values are shown once."""
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        """Keep revoked credentials for the audit trail."""
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

    def has_add_permission(self, request) -> bool:
        return False

    def has_change_permission(self, request, obj=None) -> bool:
        return False

    def has_delete_permission(self, request, obj=None) -> bool:
        return False
