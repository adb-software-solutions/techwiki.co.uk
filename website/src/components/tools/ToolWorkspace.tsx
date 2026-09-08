"use client";

import { useMemo, useState } from "react";

type ToolSlug =
    | "json-formatter"
    | "base64"
    | "url-encoder"
    | "uuid-generator"
    | "timestamp-converter"
    | "chmod-calculator";

function TextTool({
    transform,
    reverse,
    inputLabel = "Input",
}: {
    transform: (value: string) => string;
    reverse?: (value: string) => string;
    inputLabel?: string;
}) {
    const [input, setInput] = useState("");
    const [output, setOutput] = useState("");
    const [error, setError] = useState("");

    const run = (fn: (value: string) => string) => {
        try {
            setOutput(fn(input));
            setError("");
        } catch (err) {
            setOutput("");
            setError(err instanceof Error ? err.message : "Unable to process input");
        }
    };

    return (
        <div className="space-y-4">
            <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-300">{inputLabel}</span>
                <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    rows={10}
                    className="w-full rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-sm text-gray-100"
                />
            </label>
            <div className="flex flex-wrap gap-2">
                <button onClick={() => run(transform)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500">
                    Convert
                </button>
                {reverse && (
                    <button onClick={() => run(reverse)} className="rounded-lg bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-600">
                        Reverse
                    </button>
                )}
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <label className="block">
                <span className="mb-2 block text-sm font-medium text-gray-300">Output</span>
                <textarea readOnly value={output} rows={10} className="w-full rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-sm text-gray-100" />
            </label>
        </div>
    );
}

function JsonTool() {
    const [input, setInput] = useState("");
    const [output, setOutput] = useState("");
    const [error, setError] = useState("");
    const process = (pretty: boolean) => {
        try {
            const parsed = JSON.parse(input);
            setOutput(JSON.stringify(parsed, null, pretty ? 2 : 0));
            setError("");
        } catch (err) {
            setError(err instanceof Error ? err.message : "Invalid JSON");
            setOutput("");
        }
    };
    return (
        <div className="space-y-4">
            <textarea value={input} onChange={(event) => setInput(event.target.value)} rows={12} placeholder='{"hello":"world"}' className="w-full rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-sm text-gray-100" />
            <div className="flex gap-2">
                <button onClick={() => process(true)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">Format & validate</button>
                <button onClick={() => process(false)} className="rounded-lg bg-gray-700 px-4 py-2 text-sm text-white">Minify</button>
            </div>
            {error && <p className="text-sm text-red-400">{error}</p>}
            <textarea readOnly value={output} rows={12} className="w-full rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-sm text-gray-100" />
        </div>
    );
}

function UuidTool() {
    const [count, setCount] = useState(5);
    const [nonce, setNonce] = useState(0);
    const values = useMemo(
        () => Array.from({ length: count }, () => crypto.randomUUID()),
        [count, nonce],
    );
    return (
        <div className="space-y-4">
            <div className="flex items-center gap-3">
                <input type="number" min={1} max={100} value={count} onChange={(event) => setCount(Math.min(100, Math.max(1, Number(event.target.value) || 1)))} className="w-24 rounded-lg border border-gray-700 bg-gray-950 p-2 text-white" />
                <button onClick={() => setNonce((value) => value + 1)} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">Generate</button>
            </div>
            <textarea readOnly rows={Math.min(count + 1, 18)} value={values.join("\n")} className="w-full rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-sm text-gray-100" />
        </div>
    );
}

function TimestampTool() {
    const [timestamp, setTimestamp] = useState(() => Math.floor(Date.now() / 1000).toString());
    const [date, setDate] = useState(() => new Date().toISOString().slice(0, 16));
    const parsedDate = new Date(Number(timestamp) * (timestamp.length > 10 ? 1 : 1000));
    const parsedTimestamp = Math.floor(new Date(date).getTime() / 1000);
    return (
        <div className="space-y-6">
            <label className="block"><span className="mb-2 block text-sm text-gray-300">Unix timestamp</span><input value={timestamp} onChange={(event) => setTimestamp(event.target.value.trim())} className="w-full rounded-lg border border-gray-700 bg-gray-950 p-3 font-mono text-white" /><span className="mt-2 block text-sm text-gray-400">{Number.isNaN(parsedDate.getTime()) ? "Invalid timestamp" : parsedDate.toISOString()}</span></label>
            <label className="block"><span className="mb-2 block text-sm text-gray-300">Date / time</span><input type="datetime-local" value={date} onChange={(event) => setDate(event.target.value)} className="rounded-lg border border-gray-700 bg-gray-950 p-3 text-white" /><span className="mt-2 block font-mono text-sm text-gray-400">{Number.isNaN(parsedTimestamp) ? "Invalid date" : parsedTimestamp}</span></label>
        </div>
    );
}

function ChmodTool() {
    const [bits, setBits] = useState([true, true, true, true, false, true, true, false, true]);
    const labels = ["User read", "User write", "User execute", "Group read", "Group write", "Group execute", "Other read", "Other write", "Other execute"];
    const octal = [0, 1, 2].map((group) => (bits[group * 3] ? 4 : 0) + (bits[group * 3 + 1] ? 2 : 0) + (bits[group * 3 + 2] ? 1 : 0)).join("");
    return (
        <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-3">{labels.map((label, index) => <label key={label} className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-900 p-3 text-sm text-gray-300"><input type="checkbox" checked={bits[index]} onChange={() => setBits((current) => current.map((value, bitIndex) => bitIndex === index ? !value : value))} />{label}</label>)}</div>
            <div className="rounded-lg bg-gray-950 p-4 font-mono text-xl text-white">chmod {octal} file</div>
        </div>
    );
}

export function ToolWorkspace({ tool }: { tool: ToolSlug }) {
    if (tool === "json-formatter") return <JsonTool />;
    if (tool === "base64") return <TextTool transform={(value) => btoa(unescape(encodeURIComponent(value)))} reverse={(value) => decodeURIComponent(escape(atob(value.trim())))} />;
    if (tool === "url-encoder") return <TextTool transform={encodeURIComponent} reverse={decodeURIComponent} />;
    if (tool === "uuid-generator") return <UuidTool />;
    if (tool === "timestamp-converter") return <TimestampTool />;
    return <ChmodTool />;
}
