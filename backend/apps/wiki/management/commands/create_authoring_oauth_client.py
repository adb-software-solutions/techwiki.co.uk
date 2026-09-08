"""Create an OAuth client for the private TechWiki authoring service."""

from django.core.management.base import BaseCommand, CommandError

from apps.wiki.authoring_api import SAFE_AUTHORING_SCOPES
from apps.wiki.authoring_models import AuthoringOAuthClient


class Command(BaseCommand):
    help = "Create an OAuth client for the owner-only TechWiki authoring API."

    def add_arguments(self, parser) -> None:
        parser.add_argument("name")
        parser.add_argument(
            "--redirect-uri",
            action="append",
            dest="redirect_uris",
            required=True,
            help="Allowed OAuth redirect URI. Repeat for multiple values.",
        )
        parser.add_argument(
            "--scope",
            action="append",
            dest="scopes",
            help="Allowed authoring scope. Repeat for multiple values. Defaults to all safe scopes.",
        )

    def handle(self, *args, **options) -> None:
        scopes = options["scopes"] or sorted(SAFE_AUTHORING_SCOPES)
        invalid = sorted(set(scopes) - SAFE_AUTHORING_SCOPES)
        if invalid:
            raise CommandError(f"Unsupported scopes: {', '.join(invalid)}")

        client, secret = AuthoringOAuthClient.issue(
            name=options["name"],
            redirect_uris=options["redirect_uris"],
            scopes=scopes,
        )
        self.stdout.write(self.style.SUCCESS("Authoring OAuth client created."))
        self.stdout.write(f"Client ID: {client.client_id}")
        self.stdout.write(f"Client secret: {secret}")
        self.stdout.write("Store the client secret now; TechWiki stores only its hash.")
