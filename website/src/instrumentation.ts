// Runs once when the Next.js server starts. (JSON logs are set up earlier,
// by src/lib/observability/json-console.mjs; see Dockerfile.website.)
export async function register(): Promise<void> {
    if (process.env.NEXT_RUNTIME === "nodejs") {
        const { trackHttpRequests } = await import(
            "@/lib/observability/metrics"
        );
        trackHttpRequests();
    }
}
