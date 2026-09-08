import { getArticles, getCategories } from "@/lib/wiki/api";

const BASE_URL = "https://techwiki.co.uk";
const PAGE_SIZE = 100;

export const revalidate = 300;

async function getAllArticles() {
    const first = await getArticles({ page: 1, per_page: PAGE_SIZE });
    if (!first.success || first.total_pages <= 1) return first.articles;

    const remaining = await Promise.all(
        Array.from({ length: first.total_pages - 1 }, (_, index) =>
            getArticles({ page: index + 2, per_page: PAGE_SIZE }),
        ),
    );

    return [
        ...first.articles,
        ...remaining.flatMap((response) =>
            response.success ? response.articles : [],
        ),
    ];
}

export async function GET(): Promise<Response> {
    const [categoriesResponse, articles] = await Promise.all([
        getCategories().catch(() => null),
        getAllArticles().catch(() => []),
    ]);

    const categories = categoriesResponse?.success
        ? categoriesResponse.categories
        : [];

    const sections = categories.map((category) => {
        const categoryArticles = articles.filter(
            (article) => article.category?.id === category.id,
        );
        const categoryUrl = `${BASE_URL}/${category.full_path || category.slug}`;

        return [
            `## ${category.name}`,
            "",
            category.description || `Technical articles in ${category.name}.`,
            "",
            `Category: ${categoryUrl}`,
            "",
            ...categoryArticles.flatMap((article) => {
                const canonical = `${BASE_URL}/${article.category?.full_path || article.category?.slug || "articles"}/${article.slug}`;
                return [
                    `### ${article.title}`,
                    "",
                    `Canonical: ${canonical}`,
                    `Markdown: ${canonical}.md`,
                    `Type: ${article.article_type}`,
                    `Updated: ${new Date(article.updated_at).toISOString()}`,
                    article.excerpt ? `Summary: ${article.excerpt}` : "",
                    "",
                ].filter(Boolean);
            }),
        ].join("\n");
    });

    const uncategorized = articles.filter((article) => !article.category);
    if (uncategorized.length > 0) {
        sections.push(
            [
                "## Other articles",
                "",
                ...uncategorized.flatMap((article) => {
                    const canonical = `${BASE_URL}/articles/${article.slug}`;
                    return [
                        `### ${article.title}`,
                        "",
                        `Canonical: ${canonical}`,
                        `Markdown: ${canonical}.md`,
                        `Type: ${article.article_type}`,
                        `Updated: ${new Date(article.updated_at).toISOString()}`,
                        article.excerpt ? `Summary: ${article.excerpt}` : "",
                        "",
                    ].filter(Boolean);
                }),
            ].join("\n"),
        );
    }

    const body = [
        "# TechWiki full machine-readable index",
        "",
        "> Complete discoverability index for TechWiki's published technical content. Prefer canonical HTML URLs for citations and `.md` URLs for efficient retrieval.",
        "",
        ...sections,
        "",
    ].join("\n");

    return new Response(body, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=300, s-maxage=300",
        },
    });
}
