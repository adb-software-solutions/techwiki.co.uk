/** @jest-environment node */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

import { NextRequest } from "next/server";

import { GET as healthz } from "@/app/healthz/route";
import { GET as metricsRoute } from "@/app/metrics/route";
import { middleware } from "@/middleware";

import { SERVICE, jsonLine, useJsonConsole } from "./json-console.mjs";
import {
    createMetrics,
    metrics,
    observeRequest,
    trackHttpRequests,
} from "./metrics";

async function count(
    target: ReturnType<typeof createMetrics>,
    labels: string,
): Promise<number> {
    const text = await target.registry.metrics();
    const line = text
        .split("\n")
        .find((l) =>
            l.startsWith(`http_request_duration_seconds_count{${labels}}`),
        );
    return line ? Number(line.split(" ").pop()) : 0;
}

describe("json-console", () => {
    test("writes the fields Loki expects", () => {
        const entry = JSON.parse(
            jsonLine(
                "info",
                ["%s ready", "server"],
                SERVICE,
                new Date("2026-01-02T03:04:05Z"),
            ),
        );
        expect(entry).toEqual({
            time: "2026-01-02T03:04:05.000Z",
            level: "info",
            logger: "console",
            message: "server ready",
            service: "techwiki-website",
        });
    });

    test("adds the stack of a logged Error", () => {
        const entry = JSON.parse(jsonLine("error", [new Error("boom")]));
        expect(entry.message).toBe("boom");
        expect(entry.exception).toMatch(/^Error: boom\n {4}at /);
    });

    test("turns console output into one JSON object per line, skipping blank ones", () => {
        const saved = { ...console };
        const write = jest
            .spyOn(process.stdout, "write")
            .mockImplementation(() => true);
        let lines: string[];
        try {
            useJsonConsole();
            console.log();
            console.log("");
            console.warn("careful");
            console.error("failed:", new Error("boom"));
        } finally {
            Object.assign(console, saved);
            lines = write.mock.calls.map(([chunk]) => String(chunk));
            write.mockRestore();
        }
        expect(lines).toHaveLength(2);
        expect(lines.every((line) => line.endsWith("}\n"))).toBe(true);
        const [warn, error] = lines.map((line) => JSON.parse(line));
        expect(warn).toMatchObject({ level: "warning", message: "careful" });
        expect(error).toMatchObject({ level: "error", message: "failed:" });
        expect(error.exception).toMatch(/^Error: boom/);
    });
});

describe("metrics", () => {
    test("times requests with bounded labels", async () => {
        const target = createMetrics();
        observeRequest(target, "get", "/articles?page=2", 200, 0.01);
        observeRequest(target, "BREW", "/", 405, 0.01);
        expect(await count(target, 'method="GET",status_code="200"')).toBe(1);
        expect(await count(target, 'method="other",status_code="405"')).toBe(1);
    });

    test("leaves out its own health and metrics requests", async () => {
        const target = createMetrics();
        for (const url of ["/healthz", "/healthz/", "/metrics", "/metrics?x"]) {
            observeRequest(target, "GET", url, 200, 0.01);
        }
        expect(await count(target, 'method="GET",status_code="200"')).toBe(0);
    });

    test("records every request the process serves", async () => {
        trackHttpRequests();
        trackHttpRequests(); // Idempotent.
        const server = createServer((_req, res) => {
            res.statusCode = 201;
            res.end();
        });
        await new Promise<void>((resolve) =>
            server.listen(0, "127.0.0.1", resolve),
        );
        const { port } = server.address() as AddressInfo;
        const labels = 'method="POST",status_code="201"';
        const before = await count(metrics(), labels);
        try {
            await fetch(`http://127.0.0.1:${port}/form`, { method: "POST" });
        } finally {
            server.close();
        }
        expect(await count(metrics(), labels)).toBe(before + 1);
    });
});

describe("routes", () => {
    test("GET /healthz answers ok", async () => {
        const response = healthz();
        expect(response.status).toBe(200);
        expect(response.headers.get("cache-control")).toBe("no-store");
        const body = await response.json();
        expect(body.status).toBe("ok");
        expect(body.checks.server.ok).toBe(true);
    });

    test("GET /metrics serves the Prometheus text format", async () => {
        const response = await metricsRoute();
        expect(response.status).toBe(200);
        expect(response.headers.get("content-type")).toMatch(/^text\/plain/);
        const text = await response.text();
        expect(text).toMatch(/^# HELP process_cpu_user_seconds_total /m);
        expect(text).toMatch(
            /^# TYPE http_request_duration_seconds histogram$/m,
        );
    });
});

describe("middleware", () => {
    test("passes /healthz and /metrics straight through", async () => {
        const fetchSpy = jest.spyOn(global, "fetch");
        try {
            for (const path of ["/healthz", "/metrics"]) {
                const response = await middleware(
                    new NextRequest(`http://localhost:3000${path}`),
                );
                expect(response?.headers.get("x-middleware-next")).toBe("1");
            }
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            fetchSpy.mockRestore();
        }
    });
});
