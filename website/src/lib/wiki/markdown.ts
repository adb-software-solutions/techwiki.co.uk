import { getArticleByPath } from "@/lib/wiki/api";

const BASE_URL = "https://techwiki.co.uk";

function yamlString(value: string): string {
    return JSON.stringify(value);
}

/** An article as Markdown with YAML frontmatter, for `/<path>.md`. */
export async function articleMarkdown(path: string): Promise<Response> {
    path = path.replace(/^\/+/, "");
    if (!path) {
        return new Response("Missing article path.\n", { status: 400 });
    }

    const response = await getArticleByPath(path).catch(() => null);
    if (!response?.success || !response.article) {
        return new Response("Article not found.\n", { status: 404 });
    }

    const article = response.article;
    const canonical = `${BASE_URL}${article.full_url}`;
    const author = article.author
        ? `${article.author.first_name} ${article.author.last_name}`.trim()
        : "TechWiki";
    const categories = article.categories?.length
        ? article.categories.map((category) => category.name)
        : article.category
          ? [article.category.name]
          : [];

    const frontmatter = [
        "---",
        `title: ${yamlString(article.title)}`,
        `canonical: ${yamlString(canonical)}`,
        `author: ${yamlString(author)}`,
        `article_type: ${yamlString(article.article_type)}`,
        article.published_at
            ? `published: ${yamlString(article.published_at)}`
            : "",
        `updated: ${yamlString(article.updated_at)}`,
        `categories: ${JSON.stringify(categories)}`,
        `tags: ${JSON.stringify(article.tags.map((tag) => tag.name))}`,
        "---",
        "",
    ]
        .filter(Boolean)
        .join("\n");

    return new Response(`${frontmatter}${article.content.trim()}\n`, {
        headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Cache-Control": "public, max-age=60, s-maxage=60",
            Link: `<${canonical}>; rel="canonical"`,
            "X-Robots-Tag": "noindex",
        },
    });
}
