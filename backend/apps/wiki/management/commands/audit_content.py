"""Audit published TechWiki content for editorial and SEO quality signals."""

from __future__ import annotations

import csv
import json
from pathlib import Path
from typing import Any

from django.core.management.base import BaseCommand, CommandParser
from django.db.models import Count
from django.utils import timezone

from apps.wiki.models import Article, ArticleStatus


class Command(BaseCommand):
    """Classify published articles into an actionable editorial backlog."""

    help = "Audit published articles and classify them by content quality signals."

    def add_arguments(self, parser: CommandParser) -> None:
        parser.add_argument(
            "--format",
            choices=("table", "json", "csv"),
            default="table",
            dest="output_format",
        )
        parser.add_argument("--output", type=Path)

    def handle(self, *args: Any, **options: Any) -> None:
        articles = (
            Article.objects.filter(status=ArticleStatus.PUBLISHED)
            .select_related("category", "author")
            .prefetch_related("tags", "categories")
            .annotate(tag_count=Count("tags", distinct=True))
        )

        rows = [self._audit_article(article) for article in articles]
        rows.sort(key=lambda row: (row["grade"], row["word_count"], row["title"]))

        output_format = options["output_format"]
        output_path: Path | None = options.get("output")

        if output_format == "json":
            rendered = json.dumps(rows, indent=2, default=str)
        elif output_format == "csv":
            rendered = self._render_csv(rows)
        else:
            rendered = self._render_table(rows)

        if output_path:
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(rendered, encoding="utf-8")
            self.stdout.write(self.style.SUCCESS(f"Wrote audit to {output_path}"))
        else:
            self.stdout.write(rendered)

        summary = {grade: sum(row["grade"] == grade for row in rows) for grade in "ABCDE"}
        self.stderr.write(
            "Audit summary: " + ", ".join(f"{grade}={count}" for grade, count in summary.items())
        )

    def _audit_article(self, article: Article) -> dict[str, Any]:
        word_count = len(article.content.split())
        age_days = (
            timezone.now() - (article.updated_at or article.created_at)
        ).days
        issues: list[str] = []

        if word_count < 150:
            issues.append("very_short")
        elif word_count < 350:
            issues.append("short")
        if not article.excerpt.strip():
            issues.append("missing_excerpt")
        if not article.meta_title.strip():
            issues.append("missing_meta_title")
        if not article.meta_description.strip():
            issues.append("missing_meta_description")
        if not article.category_id:
            issues.append("missing_primary_category")
        if getattr(article, "tag_count", 0) == 0:
            issues.append("missing_tags")
        if age_days > 730:
            issues.append("stale_over_2_years")
        elif age_days > 365:
            issues.append("stale_over_1_year")

        grade = self._grade(word_count, issues)
        return {
            "grade": grade,
            "title": article.title,
            "url": article.full_url,
            "article_type": article.article_type,
            "category": article.category.name if article.category else "",
            "word_count": word_count,
            "reading_time": article.reading_time,
            "updated_at": article.updated_at,
            "age_days": age_days,
            "issues": issues,
            "recommended_action": self._recommended_action(grade, issues),
        }

    @staticmethod
    def _grade(word_count: int, issues: list[str]) -> str:
        severe = {"very_short", "missing_primary_category"}
        medium = {
            "short",
            "missing_excerpt",
            "missing_meta_description",
            "stale_over_2_years",
        }
        severe_count = len(severe.intersection(issues))
        medium_count = len(medium.intersection(issues))

        if severe_count >= 2 or (word_count < 100 and len(issues) >= 3):
            return "E"
        if severe_count >= 1 or medium_count >= 3:
            return "D"
        if medium_count >= 2 or len(issues) >= 4:
            return "C"
        if medium_count == 1 or issues:
            return "B"
        return "A"

    @staticmethod
    def _recommended_action(grade: str, issues: list[str]) -> str:
        if grade == "A":
            return "retain"
        if grade == "B":
            return "review_and_refresh"
        if grade == "C":
            return "expand_or_merge"
        if grade == "D":
            return "major_rewrite_or_merge"
        if "very_short" in issues:
            return "merge_redirect_or_retire"
        return "retire_or_redirect"

    @staticmethod
    def _render_csv(rows: list[dict[str, Any]]) -> str:
        if not rows:
            return ""
        import io

        buffer = io.StringIO()
        writer = csv.DictWriter(buffer, fieldnames=rows[0].keys())
        writer.writeheader()
        for row in rows:
            writer.writerow({**row, "issues": ";".join(row["issues"])})
        return buffer.getvalue()

    @staticmethod
    def _render_table(rows: list[dict[str, Any]]) -> str:
        if not rows:
            return "No published articles found."
        lines = [
            f"{'Grade':<5} {'Words':>6} {'Age':>6}  {'Action':<24} Title",
            "-" * 100,
        ]
        for row in rows:
            lines.append(
                f"{row['grade']:<5} {row['word_count']:>6} {row['age_days']:>5}d  "
                f"{row['recommended_action']:<24} {row['title']}"
            )
        return "\n".join(lines)
