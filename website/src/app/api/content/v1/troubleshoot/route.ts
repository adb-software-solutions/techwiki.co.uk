import { searchArticles } from "@/lib/wiki/api";
import type { ArticleSummary } from "@/lib/wiki/types";
import type { NextRequest } from "next/server";

function normalise(value: string): string {
    return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function scoreResult(article: ArticleSummary, query: string): number {
    const q = normalise(query);
    const title = normalise(article.title);
    const excerpt = normalise(article.excerpt || "");

    let score = 0;
    if (title === q) score += 100;
    if (title.includes(q)) score += 60;
    if (excerpt.includes(q)) score += 30;

    for (const term of q.split(" ").filter((value) => value.length > 2)) {
        if (title.includes(term)) score += 5;
        if (excerpt.includes(term)) score += 2;
    }

    return score;
}

export const revalidate = 60;

export async function GET(request: NextRequest): Promise<Response> {
    const q = request.nextUrl.searchParams.get("q")?.trim();
    if (!q || q.length < 2) {
        return Response.json(
            {
                success: false,
                message: "Query parameter q must contain at least 2 characters",
            },
            { status: 400 },
        );
    }

    const response = await searchArticles({ q, page: 1, per_page: 50 }).catch(
        () => null,
    );
    if (!response?.success) {
        return Response.json(
            { success: false, message: "Troubleshooting search unavailable" },
            { status: 503 },
        );
    }

    const results = response.results
        .map((article) => ({
            ...article,
            relevance_score: scoreResult(article, q),
            canonical_url: `https://techwiki.co.uk/${article.category?.full_path || article.category?.slug || "articles"}/${article.slug}`,
        }))
        .sort((a, b) => b.relevance_score - a.relevance_score)
        .slice(0, 20);

    return Response.json(
        {
            success: true,
            query: q,
            intent: "technical_troubleshooting",
            results,
            total: results.length,
        },
        {
            headers: { "Cache-Control": "public, max-age=60, s-maxage=60" },
        },
    );
}
