import { getArticles } from "@/lib/wiki/api";
import type { NextRequest } from "next/server";

export const revalidate = 60;

export async function GET(request: NextRequest): Promise<Response> {
    const params = request.nextUrl.searchParams;
    const response = await getArticles({
        page: Number(params.get("page") || "1"),
        per_page: Math.min(Number(params.get("per_page") || "20"), 100),
        category: params.get("category") || undefined,
        article_type: params.get("article_type") || undefined,
        tag: params.get("tag") || undefined,
    }).catch(() => null);

    if (!response) {
        return Response.json(
            { success: false, message: "Content service unavailable" },
            { status: 503 },
        );
    }

    return Response.json(response, {
        headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
}
