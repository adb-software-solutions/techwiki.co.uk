import { articleMarkdown } from "@/lib/wiki/markdown";

export const revalidate = 60;

// /api/content/v1/markdown/<category>/<slug>: where the `/<path>.md`
// rewrites go. Next.js 16 doesn't pass a rewrite's added query string on
// to route handlers, so the path travels in the URL instead.
export async function GET(
    _request: Request,
    { params }: { params: Promise<{ path: string[] }> },
): Promise<Response> {
    const { path } = await params;
    return articleMarkdown(path.join("/"));
}
