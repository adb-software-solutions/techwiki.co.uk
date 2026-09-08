import { getArticles } from "@/lib/wiki/api";

const BASE_URL = "https://techwiki.co.uk";
const FEED_LIMIT = 50;

export const revalidate = 300;

function escapeXml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

export async function GET(): Promise<Response> {
    const response = await getArticles({
        page: 1,
        per_page: FEED_LIMIT,
    }).catch(() => null);

    const articles = response?.success ? response.articles : [];
    const lastBuildDate = articles[0]?.updated_at
        ? new Date(articles[0].updated_at).toUTCString()
        : new Date().toUTCString();

    const items = articles
        .map((article) => {
            const category =
                article.category?.full_path ||
                article.category?.slug ||
                "articles";
            const url = `${BASE_URL}/${category}/${article.slug}`;
            const published = article.published_at || article.created_at;

            return [
                "<item>",
                `<title>${escapeXml(article.title)}</title>`,
                `<link>${escapeXml(url)}</link>`,
                `<guid isPermaLink="true">${escapeXml(url)}</guid>`,
                `<description>${escapeXml(article.excerpt || article.title)}</description>`,
                `<pubDate>${new Date(published).toUTCString()}</pubDate>`,
                article.author
                    ? `<author>${escapeXml(`${article.author.first_name} ${article.author.last_name}`.trim())}</author>`
                    : "",
                article.category
                    ? `<category>${escapeXml(article.category.name)}</category>`
                    : "",
                "</item>",
            ]
                .filter(Boolean)
                .join("\n");
        })
        .join("\n");

    const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
        "<channel>",
        "<title>TechWiki</title>",
        `<link>${BASE_URL}</link>`,
        "<description>Practical technical documentation, tutorials, troubleshooting guides, and references.</description>",
        "<language>en-gb</language>",
        `<lastBuildDate>${lastBuildDate}</lastBuildDate>`,
        `<atom:link href="${BASE_URL}/feed.xml" rel="self" type="application/rss+xml" />`,
        items,
        "</channel>",
        "</rss>",
        "",
    ].join("\n");

    return new Response(xml, {
        headers: {
            "Content-Type": "application/rss+xml; charset=utf-8",
            "Cache-Control": "public, max-age=300, s-maxage=300",
        },
    });
}
