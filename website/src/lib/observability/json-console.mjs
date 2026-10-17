/**
 * Logging for Loki. The Docker image preloads this file into every Node.js
 * process (NODE_OPTIONS=--import=...) and sets LOG_FORMAT=json, so anything
 * written through `console`, including Next.js's own start-up lines, becomes
 * one JSON object per line on stdout: time, level, logger, message, service,
 * and exception when an Error was logged. Without LOG_FORMAT=json (local
 * development), `console` is left alone.
 *
 * Plain JavaScript because Node loads it before Next.js starts.
 */
import { format } from "node:util";

export const SERVICE = "techwiki-website";

const LEVELS = {
    debug: "debug",
    log: "info",
    info: "info",
    warn: "warning",
    error: "error",
};

/**
 * @param {string} level
 * @param {unknown[]} args what was passed to console
 * @param {string} [service]
 * @param {Date} [now]
 * @returns {string}
 */
export function jsonLine(level, args, service = SERVICE, now = new Date()) {
    const error = args.find((arg) => arg instanceof Error);
    const rest = error ? args.filter((arg) => arg !== error) : args;
    /** @type {Record<string, string>} */
    const entry = {
        time: now.toISOString(),
        level,
        logger: "console",
        message: format(...rest).trim() || (error?.message ?? ""),
        service,
    };
    if (error) {
        entry.exception = error.stack ?? String(error);
    }
    return JSON.stringify(entry);
}

/** @param {string} [service] */
export function useJsonConsole(service = SERVICE) {
    for (const [method, level] of Object.entries(LEVELS)) {
        /** @type {Record<string, unknown>} */ (console)[method] = (
            /** @type {unknown[]} */ ...args
        ) => {
            // Blank spacer lines (Next.js prints some) carry nothing.
            if (args.every((arg) => arg === "")) {
                return;
            }
            process.stdout.write(`${jsonLine(level, args, service)}\n`);
        };
    }
}

if (process.env.LOG_FORMAT?.toLowerCase() === "json") {
    useJsonConsole();
}
