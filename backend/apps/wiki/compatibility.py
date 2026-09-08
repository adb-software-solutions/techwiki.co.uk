"""Version and environment verification metadata for TechWiki articles."""

from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models


class VerificationStatus(models.TextChoices):
    """How completely an article has been verified for a technology/version."""

    VERIFIED = "verified", "Verified"
    PARTIAL = "partial", "Partially verified"
    KNOWN_ISSUE = "known_issue", "Known issue"


class ArticleCompatibility(models.Model):
    """A technology/version combination against which an article was verified."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    article = models.ForeignKey(
        "wiki.Article",
        on_delete=models.CASCADE,
        related_name="compatibility_records",
    )
    technology = models.CharField(max_length=100, db_index=True)
    version = models.CharField(max_length=100, blank=True, default="")
    environment = models.CharField(max_length=150, blank=True, default="")
    status = models.CharField(
        max_length=20,
        choices=VerificationStatus.choices,
        default=VerificationStatus.VERIFIED,
    )
    notes = models.CharField(max_length=500, blank=True, default="")
    verified_at = models.DateTimeField()
    verified_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="article_compatibility_verifications",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        app_label = "wiki"
        ordering = ["technology", "version", "environment"]
        constraints = [
            models.UniqueConstraint(
                fields=["article", "technology", "version", "environment"],
                name="wiki_unique_article_compatibility",
            )
        ]

    def __str__(self) -> str:
        version = f" {self.version}" if self.version else ""
        return f"{self.article.title}: {self.technology}{version}"
