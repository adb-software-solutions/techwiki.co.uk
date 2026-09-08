"use client";

import "katex/dist/katex.min.css";
import { useEffect, useRef } from "react";

interface MarkdownRendererProps {
    html: string;
    className?: string;
}

/**
 * Renders pre-rendered HTML from the backend with client-side enhancements
 * for syntax highlighting, Mermaid diagrams, and LaTeX math.
 */
export function MarkdownRenderer({
    html,
    className = "",
}: MarkdownRendererProps) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;

        // Enhance code blocks with Prism.js
        enhanceCodeBlocks(containerRef.current);

        // Render Mermaid diagrams
        renderMermaidDiagrams(containerRef.current);

        // Render LaTeX math
        renderLatexMath(containerRef.current);
    }, [html]);

    return (
        <div
            ref={containerRef}
            className={`prose prose-slate dark:prose-invert max-w-none ${className}`}
            dangerouslySetInnerHTML={{ __html: html }}
        />
    );
}

/**
 * Enhances code blocks with syntax highlighting using Prism.js
 */
async function enhanceCodeBlocks(container: HTMLElement) {
    try {
        // Dynamically import Prism
        const Prism = (await import("prismjs" as never)).default;

        // Import common language support
        await Promise.all(
            [
                import("prismjs/components/prism-typescript" as never),
                import("prismjs/components/prism-javascript" as never),
                import("prismjs/components/prism-jsx" as never),
                import("prismjs/components/prism-tsx" as never),
                import("prismjs/components/prism-python" as never),
                import("prismjs/components/prism-bash" as never),
                import("prismjs/components/prism-json" as never),
                import("prismjs/components/prism-yaml" as never),
                import("prismjs/components/prism-css" as never),
                import("prismjs/components/prism-sql" as never),
                import("prismjs/components/prism-markdown" as never),
                import("prismjs/components/prism-docker" as never),
                import("prismjs/components/prism-rust" as never),
                import("prismjs/components/prism-go" as never),
            ].map((p) => p.catch(() => {})),
        );

        // Find all code blocks and highlight them
        const codeBlocks = container.querySelectorAll("pre code");
        codeBlocks.forEach((block) => {
            if (block instanceof HTMLElement) {
                Prism.highlightElement(block);
            }
        });
    } catch (error) {
        console.warn("Prism highlighting failed:", error);
    }
}

/**
 * Renders Mermaid diagrams from fenced code blocks
 */
async function renderMermaidDiagrams(container: HTMLElement) {
    // Find mermaid code blocks
    const mermaidBlocks = container.querySelectorAll(
        "pre code.language-mermaid, pre.mermaid",
    );

    if (mermaidBlocks.length === 0) return;

    try {
        // Dynamically import Mermaid
        const mermaid = (await import("mermaid" as never)).default;

        mermaid.initialize({
            startOnLoad: false,
            theme: "dark",
            securityLevel: "strict",
            fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        });

        for (let i = 0; i < mermaidBlocks.length; i++) {
            const block = mermaidBlocks[i];
            const code = block.textContent || "";

            try {
                const { svg } = await mermaid.render(`mermaid-${i}`, code);

                // Create a new div with the rendered SVG
                const wrapper = document.createElement("div");
                wrapper.className = "mermaid-diagram my-4 flex justify-center";
                wrapper.innerHTML = svg;

                // Replace the code block with the rendered diagram
                const pre = block.closest("pre");
                if (pre && pre.parentNode) {
                    pre.parentNode.replaceChild(wrapper, pre);
                }
            } catch (error) {
                console.error("Mermaid rendering error:", error);
            }
        }
    } catch (error) {
        console.warn("Mermaid import failed:", error);
    }
}

/**
 * Renders LaTeX math expressions
 */
async function renderLatexMath(container: HTMLElement) {
    try {
        const katex = (await import("katex" as never)).default;

        // Process display math: $$...$$
        const displayMathRegex = /\$\$([^$]+)\$\$/g;
        const blockElements = container.querySelectorAll("p, div, span");

        blockElements.forEach((element) => {
            if (element.innerHTML.includes("$$")) {
                element.innerHTML = element.innerHTML.replace(
                    displayMathRegex,
                    (match: string, math: string) => {
                        try {
                            return katex.renderToString(math.trim(), {
                                displayMode: true,
                                throwOnError: false,
                            });
                        } catch {
                            return match;
                        }
                    },
                );
            }
        });

        // Process inline math: $...$
        const inlineMathRegex = /\$([^$\n]+)\$/g;

        blockElements.forEach((element) => {
            if (
                element.innerHTML.includes("$") &&
                !element.innerHTML.includes("$$")
            ) {
                element.innerHTML = element.innerHTML.replace(
                    inlineMathRegex,
                    (match: string, math: string) => {
                        try {
                            return katex.renderToString(math.trim(), {
                                displayMode: false,
                                throwOnError: false,
                            });
                        } catch {
                            return match;
                        }
                    },
                );
            }
        });
    } catch (error) {
        console.warn("KaTeX rendering failed:", error);
    }
}

export default MarkdownRenderer;
