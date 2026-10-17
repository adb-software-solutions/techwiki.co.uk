/**
 * Prometheus metrics, served at GET /metrics: the standard Node.js process
 * metrics, plus http_request_duration_seconds{method, status_code} for every
 * request the server answers (except /healthz and /metrics themselves).
 *
 * Next.js bundles instrumentation and each route separately, so the one
 * registry per process is kept on globalThis.
 */
import { subscribe } from "node:diagnostics_channel";
import type { IncomingMessage, ServerResponse } from "node:http";

import {
    Histogram,
    Registry,
    collectDefaultMetrics,
} from "@prometheus-io/client";

const UNTRACKED = new Set(["/healthz", "/metrics"]);
const METHODS = new Set([
    "GET",
    "HEAD",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "OPTIONS",
]);

export interface Metrics {
    registry: Registry;
    requests: Histogram<"method" | "status_code">;
}

export function createMetrics(): Metrics {
    const registry = new Registry();
    collectDefaultMetrics({ register: registry });
    const requests = new Histogram({
        name: "http_request_duration_seconds",
        help: "Time to answer an HTTP request, by method and status code.",
        labelNames: ["method", "status_code"] as const,
        registers: [registry],
    });
    return { registry, requests };
}

const store = globalThis as typeof globalThis & {
    __observabilityMetrics?: Metrics;
    __observabilityTracking?: boolean;
};

export function metrics(): Metrics {
    store.__observabilityMetrics ??= createMetrics();
    return store.__observabilityMetrics;
}

export function observeRequest(
    target: Metrics,
    method: string | undefined,
    url: string | undefined,
    statusCode: number,
    seconds: number,
): void {
    const path = (url ?? "/").split("?", 1)[0].replace(/(.)\/$/, "$1");
    if (UNTRACKED.has(path)) {
        return;
    }
    // Bounded labels only: no paths, and unknown methods are grouped.
    const upper = (method ?? "").toUpperCase();
    target.requests.observe(
        {
            method: METHODS.has(upper) ? upper : "other",
            status_code: String(statusCode),
        },
        seconds,
    );
}

/** Times every request the process serves, using Node's built-in HTTP diagnostics channels. */
export function trackHttpRequests(): void {
    if (store.__observabilityTracking) {
        return;
    }
    store.__observabilityTracking = true;
    const started = new WeakMap<ServerResponse, number>();
    subscribe("http.server.request.start", (message) => {
        const { response } = message as { response: ServerResponse };
        started.set(response, performance.now());
    });
    subscribe("http.server.response.finish", (message) => {
        const { request, response } = message as {
            request: IncomingMessage;
            response: ServerResponse;
        };
        const start = started.get(response);
        if (start === undefined) {
            return;
        }
        observeRequest(
            metrics(),
            request.method,
            request.url,
            response.statusCode,
            (performance.now() - start) / 1000,
        );
    });
}
