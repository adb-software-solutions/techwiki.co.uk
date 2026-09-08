import { getArticles, getCategories } from "@/lib/wiki/api";

const BASE_URL = "https://techwiki.co.uk";

export const revalidate = 300;

export async function GET(): Promise<Response> {
    const [categoriesResponse, articlesResponse] = await Promise.all([
        getCategories().catch(() => null),
        getArticles({ page: 1, per_page: 100 }).catch(() => null),
    ]);

    const categories = categoriesResponse?.success
        ? categoriesResponse.categories
        : [];
    const articles = articlesResponse?.success ? articlesResponse.articles : [];

    const lines = [
        "# TechWiki",
        "",
        "> Practical technical documentation, tutorials, troubleshooting guides, references, and articles for developers and system administrators.",
        "",
        "TechWiki is designed to be readable by people, search engines, and software agents. Canonical public article URLs use https://techwiki.co.uk/{category}/{slug}.",
        "",
        "## Core resources",
        "",
        `- [Home](${BASE_URL}/): Browse featured and recent technical content.`,
        `- [All articles](${BASE_URL}/articles): Browse published TechWiki articles.`,
        `- [Categories](${BASE_URL}/categories): Browse the technical taxonomy.`,
        `- [Authors](${BASE_URL}/authors): View contributor profiles and expertise.`,
        `- [RSS feed](${BASE_URL}/feed.xml): Subscribe to newly published and updated content.`,
        `- [Full LLM index](${BASE_URL}/llms-full.txt): Machine-oriented index of published content.`,
        "",
        "## Categories",
        "",
        ...categories.map(
            (category) =>
                `- [${category.name}](${BASE_URL}/${category.full_path || category.slug}): ${category.description || `Technical articles in ${category.name}.`}`,
        ),
        "",
        "## Recent articles",
        "",
        ...articles.slice(0, 30).map((article) => {
            const category =
                article.category?.full_path ||
                article.category?.slug ||
                "articles";
            return `- [${article.title}](${BASE_URL}/${category}/${article.slug}): ${article.excerpt || `${article.article_type} article.`}`;
        }),
        "",
        "## Machine-readable access",
        "",
        "- Append `.md` to a canonical article URL for the Markdown representation.",
        `- Read the public content API at ${BASE_URL}/api/content/v1/.`,
        `- Search troubleshooting content at ${BASE_URL}/api/content/v1/troubleshoot?q=... .`,
        "",
        "## Usage notes",
        "",
        "Use the canonical HTML page when citing TechWiki to people. Markdown and JSON representations contain the same editorial content and exist to make retrieval easier for software. Published articles may include version-specific compatibility information and last-verified dates.",
        "",
    ];

    return new Response(lines.join("\n"), {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=300, s-maxage=300",
        },
    });
}
