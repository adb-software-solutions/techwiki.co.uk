"""Allow-list HTML sanitisation for rendered TechWiki article content."""

from __future__ import annotations

from html import escape
from html.parser import HTMLParser
from urllib.parse import urlsplit

_ALLOWED_TAGS = {
    "a",
    "blockquote",
    "br",
    "code",
    "del",
    "div",
    "em",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "hr",
    "img",
    "kbd",
    "li",
    "ol",
    "p",
    "pre",
    "s",
    "span",
    "strong",
    "sub",
    "sup",
    "table",
    "tbody",
    "td",
    "th",
    "thead",
    "tr",
    "ul",
}
_ALLOWED_ATTRIBUTES = {
    "*": {"class", "id", "title"},
    "a": {"href", "rel", "target"},
    "img": {"alt", "height", "loading", "src", "width"},
    "td": {"colspan", "rowspan"},
    "th": {"colspan", "rowspan", "scope"},
}
_URI_ATTRIBUTES = {"href", "src"}
_ALLOWED_SCHEMES = {"", "http", "https", "mailto"}
_BLOCKED_TAGS = {
    "button",
    "embed",
    "form",
    "iframe",
    "input",
    "math",
    "object",
    "option",
    "script",
    "select",
    "style",
    "svg",
    "textarea",
}
_VOID_TAGS = {"br", "hr", "img"}


def _safe_uri(value: str) -> bool:
    """Return whether a URI attribute is safe to emit."""
    compact = "".join(value.split())
    if not compact:
        return True
    if compact.startswith(("#", "/", "./", "../")):
        return True
    try:
        return urlsplit(compact).scheme.lower() in _ALLOWED_SCHEMES
    except ValueError:
        return False


class _ArticleHtmlSanitizer(HTMLParser):
    """Render allowed HTML while dropping executable or unsafe markup."""

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.output: list[str] = []
        self.blocked_depth = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        if self.blocked_depth:
            if tag in _BLOCKED_TAGS:
                self.blocked_depth += 1
            return
        if tag in _BLOCKED_TAGS:
            self.blocked_depth = 1
            return
        if tag not in _ALLOWED_TAGS:
            return

        allowed = _ALLOWED_ATTRIBUTES.get("*", set()) | _ALLOWED_ATTRIBUTES.get(tag, set())
        rendered_attrs: list[str] = []
        target_blank = False
        rel_value: str | None = None

        for raw_name, raw_value in attrs:
            name = raw_name.lower()
            if name.startswith("on") or name not in allowed or raw_value is None:
                continue
            value = raw_value.strip()
            if name in _URI_ATTRIBUTES and not _safe_uri(value):
                continue
            if name == "target" and value not in {"_blank", "_self"}:
                continue
            if name == "target" and value == "_blank":
                target_blank = True
            if name == "rel":
                rel_value = value
                continue
            rendered_attrs.append(f'{name}="{escape(value, quote=True)}"')

        if tag == "a" and target_blank:
            rel_tokens = set((rel_value or "").split()) | {"noopener", "noreferrer"}
            rendered_attrs.append(f'rel="{escape(" ".join(sorted(rel_tokens)), quote=True)}"')
        elif rel_value is not None:
            rendered_attrs.append(f'rel="{escape(rel_value, quote=True)}"')

        suffix = f" {' '.join(rendered_attrs)}" if rendered_attrs else ""
        self.output.append(f"<{tag}{suffix}>")

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()
        if self.blocked_depth:
            if tag in _BLOCKED_TAGS:
                self.blocked_depth -= 1
            return
        if tag in _ALLOWED_TAGS and tag not in _VOID_TAGS:
            self.output.append(f"</{tag}>")

    def handle_data(self, data: str) -> None:
        if not self.blocked_depth:
            self.output.append(escape(data, quote=False))


def sanitize_html(value: str) -> str:
    """Sanitise rendered article HTML using TechWiki's explicit allow-list."""
    sanitizer = _ArticleHtmlSanitizer()
    sanitizer.feed(value)
    sanitizer.close()
    return "".join(sanitizer.output)
