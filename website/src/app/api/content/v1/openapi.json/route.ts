const BASE_URL = "https://techwiki.co.uk/api/content/v1";

export async function GET(): Promise<Response> {
    return Response.json({
        openapi: "3.1.0",
        info: {
            title: "TechWiki Public Content API",
            version: "1.0.0",
            description:
                "Read-only access to TechWiki technical articles, categories, search, troubleshooting, and Markdown representations.",
        },
        servers: [{ url: BASE_URL }],
        paths: {
            "/articles": {
                get: {
                    operationId: "listArticles",
                    summary: "List published TechWiki articles",
                    parameters: [
                        {
                            name: "page",
                            in: "query",
                            schema: { type: "integer", minimum: 1 },
                        },
                        {
                            name: "per_page",
                            in: "query",
                            schema: {
                                type: "integer",
                                minimum: 1,
                                maximum: 100,
                            },
                        },
                        {
                            name: "category",
                            in: "query",
                            schema: { type: "string" },
                        },
                        {
                            name: "article_type",
                            in: "query",
                            schema: { type: "string" },
                        },
                        {
                            name: "tag",
                            in: "query",
                            schema: { type: "string" },
                        },
                    ],
                    responses: { "200": { description: "Published articles" } },
                },
            },
            "/articles/{category}/{slug}": {
                get: {
                    operationId: "getArticle",
                    summary: "Get a published article",
                    parameters: [
                        {
                            name: "category",
                            in: "path",
                            required: true,
                            schema: { type: "string" },
                        },
                        {
                            name: "slug",
                            in: "path",
                            required: true,
                            schema: { type: "string" },
                        },
                    ],
                    responses: {
                        "200": { description: "Article content and metadata" },
                        "404": { description: "Article not found" },
                    },
                },
            },
            "/categories": {
                get: {
                    operationId: "listCategories",
                    summary: "List TechWiki categories",
                    responses: { "200": { description: "Active categories" } },
                },
            },
            "/search": {
                get: {
                    operationId: "searchArticles",
                    summary: "Search published TechWiki articles",
                    parameters: [
                        {
                            name: "q",
                            in: "query",
                            required: true,
                            schema: { type: "string" },
                        },
                    ],
                    responses: { "200": { description: "Search results" } },
                },
            },
            "/troubleshoot": {
                get: {
                    operationId: "troubleshoot",
                    summary:
                        "Find articles matching an error message or technical problem",
                    parameters: [
                        {
                            name: "q",
                            in: "query",
                            required: true,
                            schema: { type: "string" },
                        },
                    ],
                    responses: {
                        "200": {
                            description: "Ranked troubleshooting results",
                        },
                    },
                },
            },
        },
    });
}
