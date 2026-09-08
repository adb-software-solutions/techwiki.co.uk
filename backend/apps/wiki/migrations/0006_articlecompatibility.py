# Generated manually for TechWiki article compatibility metadata.

import uuid

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("wiki", "0005_article_categories_alter_article_category"),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name="ArticleCompatibility",
            fields=[
                (
                    "id",
                    models.UUIDField(
                        default=uuid.uuid4,
                        editable=False,
                        primary_key=True,
                        serialize=False,
                    ),
                ),
                ("technology", models.CharField(db_index=True, max_length=100)),
                ("version", models.CharField(blank=True, default="", max_length=100)),
                ("environment", models.CharField(blank=True, default="", max_length=150)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("verified", "Verified"),
                            ("partial", "Partially verified"),
                            ("known_issue", "Known issue"),
                        ],
                        default="verified",
                        max_length=20,
                    ),
                ),
                ("notes", models.CharField(blank=True, default="", max_length=500)),
                ("verified_at", models.DateTimeField()),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                (
                    "article",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="compatibility_records",
                        to="wiki.article",
                    ),
                ),
                (
                    "verified_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="article_compatibility_verifications",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={"ordering": ["technology", "version", "environment"]},
        ),
        migrations.AddConstraint(
            model_name="articlecompatibility",
            constraint=models.UniqueConstraint(
                fields=("article", "technology", "version", "environment"),
                name="wiki_unique_article_compatibility",
            ),
        ),
    ]
