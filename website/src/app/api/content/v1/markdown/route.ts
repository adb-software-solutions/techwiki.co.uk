import { articleMarkdown } from "@/lib/wiki/markdown";
import type { NextRequest } from "next/server";

export const revalidate = 60;

// /api/content/v1/markdown?path=<category>/<slug>
export async function GET(request: NextRequest): Promise<Response> {
    return articleMarkdown(request.nextUrl.searchParams.get("path") ?? "");
}
