import type { MetadataRoute } from "next";

const ALLOWED_AI_AND_SEARCH_AGENTS = [
    // OpenAI / ChatGPT search, user-directed retrieval, and model crawling.
    "OAI-SearchBot",
    "ChatGPT-User",
    "GPTBot",
    // Anthropic / Claude search, user-directed retrieval, and model crawling.
    "Claude-SearchBot",
    "Claude-User",
    "ClaudeBot",
    // Google Search and the Google-Extended control token used by Gemini.
    "Googlebot",
    "Google-Extended",
    // Microsoft Copilot web grounding is primarily backed by Bing Search.
    "Bingbot",
    // Additional major agent/search ecosystems. The wildcard rule below also
    // keeps TechWiki available to agents that do not publish a dedicated token.
    "Applebot",
    "PerplexityBot",
    "Perplexity-User",
] as const;

export default function robots(): MetadataRoute.Robots {
    return {
        rules: [
            ...ALLOWED_AI_AND_SEARCH_AGENTS.map((userAgent) => ({
                userAgent,
                allow: "/",
            })),
            {
                userAgent: "*",
                allow: "/",
            },
        ],
        sitemap: "https://techwiki.co.uk/sitemap.xml",
    };
}
