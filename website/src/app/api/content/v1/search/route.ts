import { searchArticles } from "@/lib/wiki/api";
import type { NextRequest } from "next/server";

export const revalidate = 60;

export async function GET(request: NextRequest): Promise<Response> {
    const params = request.nextUrl.searchParams;
    const q = params.get("q")?.trim();
    if (!q) {
        return Response.json(
            { success: false, message: "Query parameter q is required" },
            { status: 400 },
        );
    }

    const response = await searchArticles({
        q,
        category: params.get("category") || undefined,
        article_type: params.get("article_type") || undefined,
        page: Number(params.get("page") || "1"),
        per_page: Math.min(Number(params.get("per_page") || "20"), 100),
    }).catch(() => null);

    if (!response) {
        return Response.json(
            { success: false, message: "Search service unavailable" },
            { status: 503 },
        );
    }

    return Response.json(response, {
        headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
    });
}
