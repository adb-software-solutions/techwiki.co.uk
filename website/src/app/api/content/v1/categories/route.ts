import { getCategories } from "@/lib/wiki/api";

export const revalidate = 300;

export async function GET(): Promise<Response> {
    const response = await getCategories().catch(() => null);
    if (!response) {
        return Response.json(
            { success: false, message: "Content service unavailable" },
            { status: 503 },
        );
    }

    return Response.json(response, {
        headers: { "Cache-Control": "public, max-age=300, s-maxage=300" },
    });
}
