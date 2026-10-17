import { metrics } from "@/lib/observability/metrics";

export const dynamic = "force-dynamic";

/** GET /metrics for Prometheus. nginx does not serve it publicly. */
export async function GET(): Promise<Response> {
    const { registry } = metrics();
    return new Response(await registry.metrics(), {
        headers: {
            "Content-Type": registry.contentType,
            "Cache-Control": "no-store",
        },
    });
}
