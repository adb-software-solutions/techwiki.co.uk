"""Tests for rendered article HTML sanitisation."""

from django.test import SimpleTestCase

from apps.wiki.sanitizer import sanitize_html


class ArticleHtmlSanitizerTests(SimpleTestCase):
    """Ensure executable markup cannot survive article rendering."""

    def test_removes_scripts_and_event_handlers(self) -> None:
        value = '<p onclick="alert(1)">Safe<script>alert(2)</script> text</p>'

        self.assertEqual(sanitize_html(value), "<p>Safe text</p>")

    def test_rejects_javascript_uris(self) -> None:
        value = '<a href="javascript:alert(1)">bad</a><img src="javascript:alert(2)" alt="x">'

        self.assertEqual(sanitize_html(value), '<a>bad</a><img alt="x">')

    def test_preserves_documentation_markup(self) -> None:
        value = (
            '<h2 id="setup">Setup</h2><pre><code class="language-python">'
            'print(&quot;hello&quot;)</code></pre><table><tbody><tr><td colspan="2">OK</td>'
            '</tr></tbody></table>'
        )

        self.assertEqual(sanitize_html(value), value)

    def test_hardens_external_blank_links(self) -> None:
        value = '<a href="https://example.com" target="_blank">Example</a>'

        self.assertEqual(
            sanitize_html(value),
            '<a href="https://example.com" target="_blank" rel="noopener noreferrer">Example</a>',
        )

    def test_drops_dangerous_embedded_containers(self) -> None:
        value = '<p>Before</p><iframe src="https://example.com"><script>x</script></iframe><p>After</p>'

        self.assertEqual(sanitize_html(value), "<p>Before</p><p>After</p>")
