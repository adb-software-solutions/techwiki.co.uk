import { ToolWorkspace } from "@/components/tools/ToolWorkspace";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

const TOOLS = {
    "json-formatter": {
        title: "JSON Formatter & Validator",
        description: "Format, validate, and minify JSON locally in your browser.",
    },
    base64: {
        title: "Base64 Encoder & Decoder",
        description: "Encode UTF-8 text to Base64 and decode Base64 back to text.",
    },
    "url-encoder": {
        title: "URL Encoder & Decoder",
        description: "Encode and decode URL components locally in your browser.",
    },
    "uuid-generator": {
        title: "UUID Generator",
        description: "Generate cryptographically random UUID v4 values in your browser.",
    },
    "timestamp-converter": {
        title: "Unix Timestamp Converter",
        description: "Convert Unix timestamps to readable dates and dates to Unix timestamps.",
    },
    "chmod-calculator": {
        title: "chmod Calculator",
        description: "Convert Linux read, write, and execute permissions into octal chmod values.",
    },
} as const;

type ToolSlug = keyof typeof TOOLS;

export function generateStaticParams() {
    return Object.keys(TOOLS).map((tool) => ({ tool }));
}

export async function generateMetadata({
    params,
}: {
    params: Promise<{ tool: string }>;
}): Promise<Metadata> {
    const { tool } = await params;
    const config = TOOLS[tool as ToolSlug];
    if (!config) return {};
    return {
        title: config.title,
        description: config.description,
        alternates: { canonical: `https://techwiki.co.uk/tools/${tool}` },
    };
}

export default async function ToolPage({
    params,
}: {
    params: Promise<{ tool: string }>;
}) {
    const { tool } = await params;
    const config = TOOLS[tool as ToolSlug];
    if (!config) notFound();

    return (
        <div className="mx-auto max-w-4xl">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-white">{config.title}</h1>
                <p className="mt-2 text-gray-400">{config.description}</p>
                <p className="mt-2 text-sm text-gray-500">Your input stays in this browser.</p>
            </header>
            <ToolWorkspace tool={tool as ToolSlug} />
        </div>
    );
}
