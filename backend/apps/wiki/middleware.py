"""Response security middleware for TechWiki content APIs."""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

from django.http import HttpRequest, HttpResponse

from apps.wiki.sanitizer import sanitize_html


def _sanitize_rendered_html(value: Any) -> Any:
    """Recursively sanitise rendered_html values without altering Markdown source."""
    if isinstance(value, dict):
        return {
            key: sanitize_html(item) if key == "rendered_html" and isinstance(item, str) else _sanitize_rendered_html(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_sanitize_rendered_html(item) for item in value]
    return value


class SanitizeRenderedHtmlMiddleware:
    """Sanitise rendered article HTML immediately before JSON leaves Django."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        if response.streaming or response.status_code == 204:
            return response
        content_type = response.get("Content-Type", "")
        if not content_type.startswith("application/json"):
            return response

        try:
            payload = json.loads(response.content)
        except (json.JSONDecodeError, UnicodeDecodeError):
            return response

        sanitized = _sanitize_rendered_html(payload)
        if sanitized == payload:
            return response

        content = json.dumps(sanitized, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        response.content = content
        response["Content-Length"] = str(len(content))
        return response
