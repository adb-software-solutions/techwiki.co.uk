"""Models for TechWiki documentation and blog platform."""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from django.conf import settings
from django.db import models
from django.db.models.base import ModelBase
from django.utils import timezone
from django.utils.text import slugify


class Category(models.Model):
    """Category for organizing articles."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100, unique=True)
    slug = models.SlugField(max_length=100, unique=True, db_index=True)
    description = models.TextField(blank=True, default="")
    parent = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="children",
    )
    icon = models.CharField(max_length=50, blank=True, default="", help_text="Icon name or emoji")
    order = models.IntegerField(default=0, help_text="Display order")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Categories"
        ordering = ["order", "name"]

    def __str__(self) -> str:
        return self.name

    def save(
        self,
        force_insert: bool | tuple[ModelBase, ...] = False,
        force_update: bool = False,
        using: str | None = None,
        update_fields: Iterable[str] | None = None,
    ) -> None:
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(
            force_insert=force_insert,
            force_update=force_update,
            using=using,
            update_fields=update_fields,
        )

    @property
    def full_path(self) -> str:
        """Get full category path including parents."""
        if self.parent:
            return f"{self.parent.full_path}/{self.slug}"
        return self.slug

    @property
    def article_count(self) -> int:
        """Count of published articles in this category."""
        return self.articles.filter(status="published").count()


class ArticleStatus(models.TextChoices):
    """Status choices for articles."""

    DRAFT = "draft", "Draft"
    PENDING_REVIEW = "pending_review", "Pending Review"
    CHANGES_REQUESTED = "changes_requested", "Changes Requested"
    APPROVED = "approved", "Approved"
    PUBLISHED = "published", "Published"
    ARCHIVED = "archived", "Archived"


class ArticleSource(models.TextChoices):
    """Where an article was created."""

    WEB = "web", "Website"
    AUTHORING = "authoring", "Authoring API"


class ArticleType(models.TextChoices):
    """Type of article."""

    DOCUMENTATION = "documentation", "Documentation"
    TUTORIAL = "tutorial", "Tutorial"
    BLOG = "blog", "Blog Post"
    GUIDE = "guide", "Guide"
    REFERENCE = "reference", "Reference"


class Article(models.Model):
    """Main article model for documentation and blog posts."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)

    # Basic info
    title = models.CharField(max_length=255)
    slug = models.SlugField(max_length=255, db_index=True)
    excerpt = models.TextField(blank=True, default="", help_text="Short summary for previews")

    # Content
    content = models.TextField(help_text="Markdown content")
    rendered_html = models.TextField(
        blank=True, default="", help_text="Pre-rendered HTML for performance"
    )

    # Classification
    article_type = models.CharField(
        max_length=20,
        choices=ArticleType.choices,
        default=ArticleType.DOCUMENTATION,
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="articles",
        help_text="Primary category (for URL generation)",
    )
    categories = models.ManyToManyField(
        Category,
        blank=True,
        related_name="all_articles",
        help_text="All categories this article belongs to",
    )
    tags: models.ManyToManyField[Tag, Article] = models.ManyToManyField(
        "Tag", blank=True, related_name="articles"
    )

    # Authorship
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name="articles",
    )

    # Status and moderation
    status = models.CharField(
        max_length=20,
        choices=ArticleStatus.choices,
        default=ArticleStatus.DRAFT,
        db_index=True,
    )
    moderation_notes = models.TextField(blank=True, default="")
    moderator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="moderated_articles",
    )
    moderated_at = models.DateTimeField(null=True, blank=True)
    source = models.CharField(
        max_length=20,
        choices=ArticleSource.choices,
        default=ArticleSource.WEB,
        db_index=True,
    )

    # SEO
    meta_title = models.CharField(max_length=60, blank=True, default="")
    meta_description = models.CharField(max_length=160, blank=True, default="")
    featured_image = models.ForeignKey(
        "ArticleImage",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="+",
    )

    # Timestamps
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    published_at = models.DateTimeField(null=True, blank=True, db_index=True)

    # Tracking
    view_count = models.PositiveIntegerField(default=0)
    is_featured = models.BooleanField(default=False)
    allow_comments = models.BooleanField(default=True)

    # Version control
    version = models.PositiveIntegerField(default=1)

    class Meta:
        ordering = ["-published_at", "-created_at"]
        unique_together = [["category", "slug"]]
        indexes = [
            models.Index(fields=["status", "-published_at"]),
            models.Index(fields=["article_type", "status"]),
            models.Index(fields=["author", "status"]),
        ]

    def __str__(self) -> str:
        return self.title

    def save(
        self,
        force_insert: bool | tuple[ModelBase, ...] = False,
        force_update: bool = False,
        using: str | None = None,
        update_fields: Iterable[str] | None = None,
    ) -> None:
        if not self.slug:
            self.slug = slugify(self.title)

        # Auto-publish when status changes to published
        if self.status == ArticleStatus.PUBLISHED and not self.published_at:
            self.published_at = timezone.now()

        super().save(
            force_insert=force_insert,
            force_update=force_update,
            using=using,
            update_fields=update_fields,
        )

    @property
    def full_url(self) -> str:
        """Get full URL path for this article."""
        if self.category:
            return f"/{self.category.full_path}/{self.slug}"
        return f"/articles/{self.slug}"

    @property
    def reading_time(self) -> int:
        """Estimated reading time in minutes."""
        words = len(self.content.split())
        return max(1, words // 200)


class ArticleRevision(models.Model):
    """Version history for articles."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    article = models.ForeignKey(Article, on_delete=models.CASCADE, related_name="revisions")
    version = models.PositiveIntegerField()
    title = models.CharField(max_length=255)
    content = models.TextField()
    author = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
    )
    change_summary = models.CharField(max_length=255, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-version"]
        unique_together = [["article", "version"]]

    def __str__(self) -> str:
        return f"{self.article.title} v{self.version}"


class Tag(models.Model):
    """Tags for articles."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=50, unique=True)
    slug = models.SlugField(max_length=50, unique=True, db_index=True)
    description = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self) -> str:
        return self.name

    def save(
        self,
        force_insert: bool | tuple[ModelBase, ...] = False,
        force_update: bool = False,
        using: str | None = None,
        update_fields: Iterable[str] | None = None,
    ) -> None:
        if not self.slug:
            self.slug = slugify(self.name)
        super().save(
            force_insert=force_insert,
            force_update=force_update,
            using=using,
            update_fields=update_fields,
        )


class ArticleImage(models.Model):
    """Images uploaded for articles."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    article = models.ForeignKey(
        Article,
        on_delete=models.CASCADE,
        related_name="images",
        null=True,
        blank=True,
    )
    image = models.ImageField(upload_to="wiki/images/%Y/%m/")
    alt_text = models.CharField(max_length=255, blank=True, default="")
    caption = models.CharField(max_length=500, blank=True, default="")
    uploaded_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"Image {self.id} - {self.alt_text or 'No alt text'}"

    @property
    def url(self) -> str:
        """Get the public URL for this image."""
        if self.image:
            return self.image.url
        return ""


class Redirect(models.Model):
    """URL redirects for old MediaWiki URLs and other legacy paths."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    old_path = models.CharField(
        max_length=500, unique=True, db_index=True, help_text="Old URL path (without domain)"
    )
    new_path = models.CharField(max_length=500, help_text="New URL path")
    is_permanent = models.BooleanField(default=True, help_text="301 (permanent) vs 302 (temporary)")
    hit_count = models.PositiveIntegerField(default=0)
    last_hit = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True, default="")

    class Meta:
        ordering = ["-hit_count"]

    def __str__(self) -> str:
        return f"{self.old_path} → {self.new_path}"

    def record_hit(self) -> None:
        """Record a redirect hit."""
        self.hit_count += 1
        self.last_hit = timezone.now()
        self.save(update_fields=["hit_count", "last_hit"])


class UserRole(models.TextChoices):
    """User roles for the wiki platform."""

    READER = "reader", "Reader"
    CONTRIBUTOR = "contributor", "Contributor"
    TRUSTED_CONTRIBUTOR = "trusted_contributor", "Trusted Contributor"
    MODERATOR = "moderator", "Moderator"
    ADMIN = "admin", "Admin"


class WikiUserProfile(models.Model):
    """Extended profile for wiki users."""

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="wiki_profile",
    )
    role = models.CharField(
        max_length=25,
        choices=UserRole.choices,
        default=UserRole.READER,
    )
    bio = models.TextField(blank=True, default="")
    website = models.URLField(blank=True, default="", help_text="Personal website or blog")
    photo = models.ImageField(
        upload_to="profile_photos/%Y/%m/", blank=True, null=True, help_text="User profile photo"
    )

    # Social Media & Professional Links
    github = models.URLField(blank=True, default="", help_text="GitHub profile URL")
    twitter = models.URLField(blank=True, default="", help_text="X (formerly Twitter) profile URL")
    bluesky = models.URLField(blank=True, default="", help_text="Bluesky profile URL")
    linkedin = models.URLField(blank=True, default="", help_text="LinkedIn profile URL")
    instagram = models.URLField(blank=True, default="", help_text="Instagram profile URL")
    facebook = models.URLField(blank=True, default="", help_text="Facebook profile URL")
    devto = models.URLField(blank=True, default="", help_text="Dev.to profile URL")
    stackoverflow = models.URLField(blank=True, default="", help_text="Stack Overflow profile URL")
    youtube = models.URLField(blank=True, default="", help_text="YouTube channel URL")
    twitch = models.URLField(blank=True, default="", help_text="Twitch channel URL")

    is_trusted = models.BooleanField(
        default=False,
        help_text="Trusted contributors can publish without moderation",
    )
    articles_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.user.email} - {self.role}"

    @property
    def can_publish_directly(self) -> bool:
        """Check if user can publish without moderation."""
        return self.is_trusted or self.role in [
            UserRole.TRUSTED_CONTRIBUTOR,
            UserRole.MODERATOR,
            UserRole.ADMIN,
        ]

    @property
    def can_moderate(self) -> bool:
        """Check if user can moderate articles."""
        return self.role in [UserRole.MODERATOR, UserRole.ADMIN]


class ModerationLog(models.Model):
    """Log of moderation actions."""

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    article = models.ForeignKey(Article, on_delete=models.CASCADE, related_name="moderation_logs")
    moderator = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
    )
    action = models.CharField(max_length=50)  # approved, rejected, changes_requested, published
    old_status = models.CharField(max_length=20)
    new_status = models.CharField(max_length=20)
    notes = models.TextField(blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.action} on {self.article.title} by {self.moderator}"
