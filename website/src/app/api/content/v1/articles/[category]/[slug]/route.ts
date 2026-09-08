import { getArticleByPath } from "@/lib/wiki/api";

const BASE_URL = "https://techwiki.co.uk";

export const revalidate = 60;

export async function GET(
    _request: Request,
    { params }: { params: Promise<{ category: string; slug: string }> },
): Promise<Response> {
    const { category, slug } = await params;
    const response = await getArticleByPath(`${category}/${slug}`).catch(
        () => null,
    );

    if (!response?.success || !response.article) {
        return Response.json(
            { success: false, message: "Article not found" },
            { status: 404 },
        );
    }

    const canonical = `${BASE_URL}${response.article.full_url}`;
    return Response.json(
        {
            ...response,
            article: {
                ...response.article,
                canonical_url: canonical,
                markdown_url: `${canonical}.md`,
            },
        },
        {
            headers: {
                "Cache-Control": "public, max-age=60, s-maxage=60",
                Link: `<${canonical}>; rel="canonical"`,
            },
        },
    );
}
