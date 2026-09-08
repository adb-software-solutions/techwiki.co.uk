"""Issue a revocable owner-only TechWiki authoring token."""

from __future__ import annotations

import os
from datetime import timedelta

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone

from apps.wiki.authoring_api import SAFE_AUTHORING_SCOPES
from apps.wiki.authoring_models import AuthoringApiToken
from authentication.models import User

DEFAULT_SCOPES = sorted(SAFE_AUTHORING_SCOPES)


class Command(BaseCommand):
    """Create a token for the single configured TechWiki authoring owner."""

    help = "Create a scoped private authoring API token for the configured owner."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--name", default="ChatGPT authoring")
        parser.add_argument("--days", type=int, default=90)
        parser.add_argument(
            "--scope",
            action="append",
            dest="scopes",
            help="Scope to grant. Repeat for multiple scopes; defaults to safe draft authoring scopes.",
        )

    def handle(self, *args, **options) -> None:
        owner_id = os.environ.get("TECHWIKI_AUTHORING_USER_ID", "").strip()
        if not owner_id:
            raise CommandError("TECHWIKI_AUTHORING_USER_ID must be configured before issuing a token.")

        try:
            owner = User.objects.get(id=owner_id)
        except (User.DoesNotExist, ValueError) as exc:
            raise CommandError("TECHWIKI_AUTHORING_USER_ID does not match a TechWiki user.") from exc

        days = options["days"]
        if days <= 0:
            raise CommandError("--days must be greater than zero.")

        scopes = options["scopes"] or DEFAULT_SCOPES
        invalid = sorted(set(scopes) - SAFE_AUTHORING_SCOPES)
        if invalid:
            raise CommandError(f"Unsupported scopes: {', '.join(invalid)}")

        expires_at = timezone.now() + timedelta(days=days)
        token, raw = AuthoringApiToken.issue(
            user=owner,
            name=options["name"],
            scopes=scopes,
            expires_at=expires_at,
        )

        self.stdout.write(self.style.SUCCESS(f"Created token {token.id} for {owner.email}."))
        self.stdout.write(f"Expires: {expires_at.isoformat()}")
        self.stdout.write("Raw token (shown once):")
        self.stdout.write(raw)
