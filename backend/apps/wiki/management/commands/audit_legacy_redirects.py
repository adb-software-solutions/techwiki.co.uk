"""Validate legacy MediaWiki redirects against current TechWiki content."""

from __future__ import annotations

from typing import Any

from django.core.management.base import BaseCommand

from apps.wiki.models import Article, ArticleStatus, Category, Redirect


class Command(BaseCommand):
    """Report redirect targets that no longer resolve to a public TechWiki route."""

    help = "Audit legacy redirects and fail when a redirect target cannot be resolved."

    def add_arguments(self, parser: Any) -> None:
        parser.add_argument(
            "--fail-on-error",
            action="store_true",
            help="Exit non-zero when broken redirect targets are found.",
        )

    def handle(self, *args: Any, **options: Any) -> None:
        broken: list[tuple[str, str, str]] = []
        redirects = Redirect.objects.all().order_by("old_path")

        for redirect in redirects.iterator():
            reason = self._validate_target(redirect.new_path)
            if reason:
                broken.append((redirect.old_path, redirect.new_path, reason))

        if broken:
            self.stdout.write("Broken legacy redirects:\n")
            for old_path, new_path, reason in broken:
                self.stdout.write(f"- {old_path} -> {new_path}: {reason}")
        else:
            self.stdout.write(self.style.SUCCESS("All legacy redirect targets resolve."))

        self.stdout.write(
            f"\nChecked {redirects.count()} redirects; {len(broken)} broken target(s)."
        )

        if broken and options["fail_on_error"]:
            raise SystemExit(1)

    @staticmethod
    def _validate_target(path: str) -> str | None:
        normalized = "/" + path.strip("/")
        if normalized in {
            "/",
            "/about",
            "/articles",
            "/authors",
            "/blog",
            "/categories",
            "/contribute",
            "/search",
            "/tools",
        }:
            return None

        parts = normalized.strip("/").split("/")
        if not parts or parts == [""]:
            return "empty target"

        if len(parts) == 1:
            if Category.objects.filter(slug=parts[0], is_active=True).exists():
                return None
            if Article.objects.filter(slug=parts[0], status=ArticleStatus.PUBLISHED).exists():
                return None
            return "no matching category, article, or static route"

        slug = parts[-1]
        category_slug = parts[-2]
        if Article.objects.filter(
            slug=slug,
            category__slug=category_slug,
            status=ArticleStatus.PUBLISHED,
        ).exists():
            return None

        return "no published article at target path"
