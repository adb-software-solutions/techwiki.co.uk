const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;
const GOOGLE_SELLER_ID = "f08c47fec0942fa0";

export function GET() {
    // Enable separately from ads so seller verification can precede MCM approval.
    if (process.env.NEXT_PUBLIC_EZOIC_ADS_TXT_ENABLED === "true") {
        return new Response(null, {
            status: 301,
            headers: {
                Location: "https://srv.adstxtmanager.com/19390/techwiki.co.uk",
                "Cache-Control": "public, max-age=3600",
            },
        });
    }

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
