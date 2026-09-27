const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
const GOOGLE_SELLER_ID = "f08c47fec0942fa0";

export function GET() {
    const publisherId = ADSENSE_CLIENT_ID?.replace(/^ca-/, "");
    const body =
        publisherId && /^pub-\d{16}$/.test(publisherId)
            ? `google.com, ${publisherId}, DIRECT, ${GOOGLE_SELLER_ID}\n`
            : "";

    return new Response(body, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Cache-Control": "public, max-age=3600",
        },
    });
}
