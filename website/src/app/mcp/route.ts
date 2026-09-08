import {
    getArticleByPath,
    getCategories,
    searchArticles,
} from "@/lib/wiki/api";
import type { NextRequest } from "next/server";

const PROTOCOL_VERSION = "2026-07-28";
const LEGACY_PROTOCOL_VERSION = "2025-11-25";

interface JsonRpcRequest {
    jsonrpc: "2.0";
    id?: string | number | null;
    method: string;
    params?: Record<string, unknown>;
}

const tools = [
    {
        name: "search_articles",
        description:
            "Search TechWiki's published technical documentation, tutorials, guides, and references.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", minLength: 2 },
                category: { type: "string" },
                article_type: { type: "string" },
                limit: { type: "integer", minimum: 1, maximum: 50 },
            },
            required: ["query"],
            additionalProperties: false,
        },
    },
    {
        name: "get_article",
        description:
            "Retrieve a TechWiki article by canonical category/slug path, including Markdown and metadata.",
        inputSchema: {
            type: "object",
            properties: {
                path: {
                    type: "string",
                    description: "Canonical path such as cloud/rclone-usage",
                },
            },
            required: ["path"],
            additionalProperties: false,
        },
    },
    {
        name: "list_categories",
        description: "List TechWiki's active technical categories.",
        inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
        },
    },
    {
        name: "troubleshoot",
        description:
            "Find TechWiki content relevant to an exact error message, exception, log line, or technical problem.",
        inputSchema: {
            type: "object",
            properties: {
                query: { type: "string", minLength: 2 },
                limit: { type: "integer", minimum: 1, maximum: 20 },
            },
            required: ["query"],
            additionalProperties: false,
        },
    },
] as const;

function rpcResult(id: JsonRpcRequest["id"], result: unknown): Response {
    return Response.json({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(
    id: JsonRpcRequest["id"],
    code: number,
    message: string,
    status = 200,
): Response {
    return Response.json(
        {
            jsonrpc: "2.0",
            id: id ?? null,
            error: { code, message },
        },
        { status },
    );
}

function textToolResult(data: unknown) {
    return {
        content: [
            {
                type: "text",
                text: JSON.stringify(data, null, 2),
            },
        ],
        structuredContent: data,
        isError: false,
    };
}

function argumentString(
    args: Record<string, unknown>,
    key: string,
): string | undefined {
    const value = args[key];
    return typeof value === "string" ? value.trim() : undefined;
}

function argumentNumber(
    args: Record<string, unknown>,
    key: string,
): number | undefined {
    const value = args[key];
    return typeof value === "number" && Number.isFinite(value)
        ? value
        : undefined;
}

async function callTool(name: string, args: Record<string, unknown>) {
    if (name === "search_articles") {
        const query = argumentString(args, "query");
        if (!query || query.length < 2) throw new Error("query is required");
        const limit = Math.min(
            Math.max(argumentNumber(args, "limit") || 10, 1),
            50,
        );
        const response = await searchArticles({
            q: query,
            category: argumentString(args, "category"),
            article_type: argumentString(args, "article_type"),
            page: 1,
            per_page: limit,
        });
        return textToolResult(response);
    }

    if (name === "get_article") {
        const path = argumentString(args, "path")?.replace(/^\/+|\/+$/g, "");
        if (!path) throw new Error("path is required");
        const response = await getArticleByPath(path);
        if (!response.success || !response.article) {
            throw new Error("Article not found");
        }
        const canonical = `https://techwiki.co.uk${response.article.full_url}`;
        return textToolResult({
            ...response.article,
            canonical_url: canonical,
            markdown_url: `${canonical}.md`,
        });
    }

    if (name === "list_categories") {
        return textToolResult(await getCategories());
    }

    if (name === "troubleshoot") {
        const query = argumentString(args, "query");
        if (!query || query.length < 2) throw new Error("query is required");
        const limit = Math.min(
            Math.max(argumentNumber(args, "limit") || 10, 1),
            20,
        );
        const response = await searchArticles({
            q: query,
            page: 1,
            per_page: Math.max(limit, 20),
        });
        return textToolResult({
            query,
            results: response.results.slice(0, limit).map((article) => ({
                ...article,
                canonical_url: `https://techwiki.co.uk/${article.category?.full_path || article.category?.slug || "articles"}/${article.slug}`,
            })),
        });
    }

    throw new Error(`Unknown tool: ${name}`);
}

export async function GET(): Promise<Response> {
    return Response.json({
        name: "TechWiki MCP Server",
        protocolVersion: PROTOCOL_VERSION,
        endpoint: "https://techwiki.co.uk/mcp",
        capabilities: { tools: {} },
    });
}

export async function POST(request: NextRequest): Promise<Response> {
    let body: JsonRpcRequest;
    try {
        body = (await request.json()) as JsonRpcRequest;
    } catch {
        return rpcError(null, -32700, "Parse error", 400);
    }

    if (body.jsonrpc !== "2.0" || !body.method) {
        return rpcError(body.id, -32600, "Invalid Request", 400);
    }

    const requestedVersion =
        request.headers.get("MCP-Protocol-Version") || LEGACY_PROTOCOL_VERSION;
    const isModern = requestedVersion === PROTOCOL_VERSION;

    if (isModern) {
        const headerMethod = request.headers.get("Mcp-Method");
        if (!headerMethod || headerMethod !== body.method) {
            return rpcError(
                body.id,
                -32020,
                "Mcp-Method header must match the JSON-RPC method",
                400,
            );
        }
        if (body.method === "tools/call") {
            const toolName = (body.params?.name as string | undefined) || "";
            const headerName = request.headers.get("Mcp-Name");
            if (!headerName || headerName !== toolName) {
                return rpcError(
                    body.id,
                    -32020,
                    "Mcp-Name header must match params.name",
                    400,
                );
            }
        }
    }

    if (body.method === "server/discover") {
        return rpcResult(body.id, {
            protocolVersion: PROTOCOL_VERSION,
            capabilities: { tools: {} },
            _meta: {
                "io.modelcontextprotocol/serverInfo": {
                    name: "techwiki",
                    version: "1.0.0",
                },
            },
        });
    }

    // Retain the previous handshake for clients that have not yet migrated to
    // the stateless 2026-07-28 protocol revision.
    if (body.method === "initialize") {
        return rpcResult(body.id, {
            protocolVersion: LEGACY_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: "techwiki", version: "1.0.0" },
        });
    }

    if (body.method === "tools/list") {
        return rpcResult(body.id, {
            tools,
            ttlMs: 300_000,
            cacheScope: "public",
        });
    }

    if (body.method === "tools/call") {
        const name = body.params?.name;
        const args = body.params?.arguments;
        if (typeof name !== "string") {
            return rpcError(body.id, -32602, "Tool name is required");
        }

        try {
            return rpcResult(
                body.id,
                await callTool(
                    name,
                    args && typeof args === "object"
                        ? (args as Record<string, unknown>)
                        : {},
                ),
            );
        } catch (error) {
            return rpcResult(body.id, {
                content: [
                    {
                        type: "text",
                        text:
                            error instanceof Error
                                ? error.message
                                : "Tool execution failed",
                    },
                ],
                isError: true,
            });
        }
    }

    return rpcError(body.id, -32601, "Method not found");
}
