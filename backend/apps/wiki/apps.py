"""Wiki app configuration."""

from django.apps import AppConfig


class WikiConfig(AppConfig):
    """Configuration for the wiki app."""

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.wiki"
    verbose_name = "TechWiki"

    def import_models(self) -> None:
        """Register models that live outside the legacy models.py module."""
        super().import_models()
        from apps.wiki import (
            authoring_models,  # noqa: F401
            compatibility,  # noqa: F401
        )

    def ready(self) -> None:
        """Register auxiliary wiki models with the Django admin."""
        from apps.wiki import (
            authoring_admin,  # noqa: F401
            compatibility_admin,  # noqa: F401
        )
