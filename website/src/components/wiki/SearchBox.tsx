"use client";

import { analytics } from "@/lib/analytics";
import { trackSearch, trackSearchClick } from "@/lib/analytics/tracking";
import { searchArticles } from "@/lib/wiki/api";
import type { ArticleSummary, Category } from "@/lib/wiki/types";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { useRouter, useSearchParams } from "next/navigation";
import {
    Suspense,
    useCallback,
    useEffect,
    useRef,
    useState,
    useTransition,
} from "react";
import { ArticleCard } from "./ArticleCard";
import { navigateToSite } from "@/components/wiki/SiteLink";

interface SearchBoxProps {
    categories?: Category[];
    className?: string;
    initialQuery?: string;
}

function SearchBoxInner({ className = "", initialQuery }: SearchBoxProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const inputRef = useRef<HTMLInputElement>(null);

    // Initialize query from URL params or prop
    const [query, setQuery] = useState(
        initialQuery || searchParams.get("q") || "",
    );

    // Sync query with URL params when they change
    useEffect(() => {
        const urlQuery = searchParams.get("q");
        if (urlQuery && urlQuery !== query) {
            setQuery(urlQuery);
        }
    }, [searchParams]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (query.trim()) {
            navigateToSite(
                `/search?q=${encodeURIComponent(query.trim())}`,
                router.push,
            );
        }
    };

    // Keyboard shortcut: Cmd/Ctrl + K to focus search
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "k") {
                e.preventDefault();
                inputRef.current?.focus();
            }
        };

        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, []);

    return (
        <form onSubmit={handleSubmit} className={className}>
            <div className="relative">
                <MagnifyingGlassIcon className="absolute top-1/2 left-3 h-5 w-5 -translate-y-1/2 text-gray-400" />
                <input
                    ref={inputRef}
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search articles... (⌘K)"
                    className="w-full rounded-lg border border-gray-700 bg-gray-800/50 py-2 pr-4 pl-10 text-white placeholder-gray-400 focus:border-transparent focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
            </div>
        </form>
    );
}

export function SearchBox(props: SearchBoxProps) {
    return (
        <Suspense fallback={null}>
            <SearchBoxInner {...props} />
        </Suspense>
    );
}

interface SearchResultsProps {
    categories?: Category[];
}

export function SearchResults({ categories }: SearchResultsProps) {
    const searchParams = useSearchParams();
    const query = searchParams.get("q") || "";
    const categoryFilter = searchParams.get("category") || "";
    const typeFilter = searchParams.get("type") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);

    const [results, setResults] = useState<ArticleSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const searchIdRef = useRef<string | null>(null);

    const router = useRouter();

    const performSearch = useCallback(async () => {
        if (!query || query.length < 2) {
            setResults([]);
            setTotal(0);
            return;
        }

        try {
            const response = await searchArticles({
                q: query,
                category: categoryFilter || undefined,
                article_type: typeFilter || undefined,
                page,
                per_page: 20,
            });

            if (response.success) {
                setResults(response.results);
                setTotal(response.total);
                setTotalPages(Math.ceil(response.total / 20));
                setError(null);

                // Track search analytics. Later pages are the same search.
                analytics.trackSearch(query, response.total);
                if (page === 1) {
                    searchIdRef.current = null;
                    trackSearch(query, response.total, {
                        category: categoryFilter,
                        type: typeFilter,
                    }).then((id) => {
                        searchIdRef.current = id;
                    });
                }
            } else {
                setError("Search failed");
            }
        } catch (err) {
            console.error("Search error:", err);
            setError("Search failed");
            analytics.trackError("search_error", String(err), "SearchResults");
        }
    }, [query, categoryFilter, typeFilter, page]);

    useEffect(() => {
        startTransition(() => {
            performSearch();
        });
    }, [performSearch]);

    const updateFilters = (updates: Record<string, string | null>) => {
        const params = new URLSearchParams(searchParams.toString());

        Object.entries(updates).forEach(([key, value]) => {
            if (value) {
                params.set(key, value);
            } else {
                params.delete(key);
            }
        });

        // Reset to page 1 when filters change
        if (!updates.page) {
            params.delete("page");
        }

        navigateToSite(`/search?${params.toString()}`, router.push);
    };

    return (
        <div>
            {/* Filters */}
            <div className="mb-6 flex flex-wrap items-center gap-4">
                <div className="flex-1">
                    <span className="text-gray-400">
                        {isPending ? (
                            "Searching..."
                        ) : (
                            <>
                                Found{" "}
                                <span className="font-medium text-white">
                                    {total}
                                </span>{" "}
                                results
                                {query && (
                                    <>
                                        {" "}
                                        for &quot;
                                        <span className="text-white">
                                            {query}
                                        </span>
                                        &quot;
                                    </>
                                )}
                            </>
                        )}
                    </span>
                </div>

                {/* Category filter */}
                {categories && categories.length > 0 && (
                    <select
                        value={categoryFilter}
                        onChange={(e) =>
                            updateFilters({ category: e.target.value || null })
                        }
                        className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    >
                        <option value="">All categories</option>
                        {categories.map((cat) => (
                            <option key={cat.id} value={cat.slug}>
                                {cat.name}
                            </option>
                        ))}
                    </select>
                )}

                {/* Type filter */}
                <select
                    value={typeFilter}
                    onChange={(e) =>
                        updateFilters({ type: e.target.value || null })
                    }
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                >
                    <option value="">All types</option>
                    <option value="documentation">Documentation</option>
                    <option value="tutorial">Tutorial</option>
                    <option value="blog">Blog</option>
                    <option value="guide">Guide</option>
                    <option value="reference">Reference</option>
                </select>

                {/* Clear filters */}
                {(categoryFilter || typeFilter) && (
                    <button
                        onClick={() =>
                            updateFilters({ category: null, type: null })
                        }
                        className="flex items-center gap-1 px-3 py-2 text-sm text-gray-400 hover:text-white"
                    >
                        <XMarkIcon className="h-4 w-4" />
                        Clear filters
                    </button>
                )}
            </div>

            {/* Error message */}
            {error && (
                <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-400">
                    {error}
                </div>
            )}

            {/* Results */}
            {results.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {results.map((article, index) => (
                        <div
                            key={article.id}
                            onClickCapture={() => {
                                if (searchIdRef.current) {
                                    trackSearchClick(
                                        searchIdRef.current,
                                        article.id,
                                        (page - 1) * 20 + index + 1,
                                    );
                                }
                            }}
                        >
                            <ArticleCard article={article} />
                        </div>
                    ))}
                </div>
            ) : !isPending && query ? (
                <div className="py-12 text-center">
                    <p className="mb-2 text-lg text-gray-400">
                        No results found
                    </p>
                    <p className="text-sm text-gray-500">
                        Try different keywords or remove filters
                    </p>
                </div>
            ) : null}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                    <button
                        onClick={() =>
                            updateFilters({ page: String(page - 1) })
                        }
                        disabled={page <= 1}
                        className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <span className="text-gray-400">
                        Page {page} of {totalPages}
                    </span>
                    <button
                        onClick={() =>
                            updateFilters({ page: String(page + 1) })
                        }
                        disabled={page >= totalPages}
                        className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}

export default SearchBox;
