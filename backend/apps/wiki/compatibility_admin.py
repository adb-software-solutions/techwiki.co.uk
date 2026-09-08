"""Django admin for article compatibility verification metadata."""

from django.contrib import admin

from apps.wiki.compatibility import ArticleCompatibility


@admin.register(ArticleCompatibility)
class ArticleCompatibilityAdmin(admin.ModelAdmin):
    """Manage tested-version metadata for published technical content."""

    list_display = (
        "article",
        "technology",
        "version",
        "environment",
        "status",
        "verified_at",
    )
    list_filter = ("status", "technology", "verified_at")
    search_fields = ("article__title", "technology", "version", "environment")
    autocomplete_fields = ("article", "verified_by")
