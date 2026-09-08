import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Developer Tools",
    description:
        "Free browser-based developer and sysadmin tools for JSON, Base64, URLs, UUIDs, timestamps, and Unix permissions.",
    alternates: { canonical: "https://techwiki.co.uk/tools" },
};

const tools = [
    ["json-formatter", "JSON Formatter", "Format, validate, and minify JSON locally in your browser."],
    ["base64", "Base64 Encoder / Decoder", "Encode UTF-8 text to Base64 or decode Base64 back to text."],
    ["url-encoder", "URL Encoder / Decoder", "Encode and decode URL components without sending data to a server."],
    ["uuid-generator", "UUID Generator", "Generate RFC 4122 version 4 UUIDs using your browser's cryptographic API."],
    ["timestamp-converter", "Unix Timestamp Converter", "Convert Unix timestamps to readable dates and dates back to timestamps."],
    ["chmod-calculator", "chmod Calculator", "Convert Linux rwx permissions into octal chmod values."],
] as const;

export default function ToolsPage() {
    return (
        <div className="mx-auto max-w-5xl">
            <header className="mb-8">
                <h1 className="text-3xl font-bold text-white">Developer Tools</h1>
                <p className="mt-2 max-w-3xl text-gray-400">
                    Small, fast utilities for common development and systems administration tasks. These tools run locally in your browser unless stated otherwise.
                </p>
            </header>
            <div className="grid gap-4 md:grid-cols-2">
                {tools.map(([slug, name, description]) => (
                    <Link
                        key={slug}
                        href={`/tools/${slug}`}
                        className="rounded-xl border border-gray-700 bg-gray-800/50 p-5 transition hover:border-blue-500/60 hover:bg-gray-800"
                    >
                        <h2 className="text-lg font-semibold text-white">{name}</h2>
                        <p className="mt-2 text-sm text-gray-400">{description}</p>
                    </Link>
                ))}
            </div>
        </div>
    );
}
