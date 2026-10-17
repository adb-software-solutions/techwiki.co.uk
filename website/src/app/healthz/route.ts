import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * GET /healthz for Docker's health check. The site has no dependency a
 * restart could fix, so it is "ok" whenever the server can answer.
 */
export function GET(): NextResponse {
    return NextResponse.json(
        {
            status: "ok",
            checks: {
                server: {
                    ok: true,
                    uptime_seconds: Math.round(process.uptime()),
                },
            },
        },
        { headers: { "Cache-Control": "no-store" } },
    );
}
