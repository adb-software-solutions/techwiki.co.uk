const BASE_URL = "https://techwiki.co.uk/api/content/v1";

export async function GET(): Promise<Response> {
    return Response.json({
        name: "TechWiki public content API",
        version: "1.0",
        documentation: `${BASE_URL}/openapi.json`,
        endpoints: {
            articles: `${BASE_URL}/articles`,
            categories: `${BASE_URL}/categories`,
            search: `${BASE_URL}/search?q=docker`,
            troubleshoot: `${BASE_URL}/troubleshoot?q=error`,
            markdown: `${BASE_URL}/markdown?path=cloud/rclone-usage`,
        },
    });
}
