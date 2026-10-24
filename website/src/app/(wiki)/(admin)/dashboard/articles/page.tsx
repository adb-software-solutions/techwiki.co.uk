"use client";

import { adminApi } from "@/components/admin/api";
import {
    buttonClass,
    Card,
    EmptyState,
    inputClass,
    LoadingState,
    PageHeader,
    SourceBadge,
    StatusBadge,
    timeAgo,
} from "@/components/admin/ui";
import { SiteLink } from "@/components/wiki/SiteLink";
import type { ArticleSummary } from "@/lib/wiki/types";
import { ExternalLink, FileText, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const PER_PAGE = 20;

const FILTERS: { status: string; label: string }[] = [
    { status: "", label: "All" },
    { status: "draft", label: "Drafts" },
    { status: "pending_review", label: "Pending review" },
    { status: "changes_requested", label: "Changes requested" },
    { status: "published", label: "Published" },
    { status: "archived", label: "Archived" },
];

interface ArticlesResponse {
    success: boolean;
    articles: ArticleSummary[];
    total: number;
    total_pages: number;
}

interface StatsResponse {
    success: boolean;
    stats: Record<string, number>;
}

function articleUrl(article: ArticleSummary): string {
    return article.category
        ? `/${article.category.slug}/${article.slug}`
        : `/articles/${article.slug}`;
}

function MyArticles() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const status = searchParams.get("status") || "";
    const page = Number(searchParams.get("page") || "1");
    const query = searchParams.get("q") || "";
    const [search, setSearch] = useState(query);
    const [data, setData] = useState<ArticlesResponse | null>(null);
    const [stats, setStats] = useState<Record<string, number>>({});

    const setParams = (next: {
        status?: string;
        page?: number;
        q?: string;
    }) => {
        const params = new URLSearchParams();
        const s = next.status ?? status;
        const q = next.q ?? query;
        if (s) params.set("status", s);
        if (q) params.set("q", q);
        if ((next.page ?? 1) > 1) params.set("page", String(next.page));
        const qs = params.toString();
        router.push(`/dashboard/articles${qs ? `?${qs}` : ""}`);
    };

    useEffect(() => {
        adminApi<StatsResponse>("/api/wiki/me/stats")
            .then((result) => result.success && setStats(result.stats))
            .catch(() => {});
    }, []);

    useEffect(() => {
        let cancelled = false;
        setData(null);
        const params = new URLSearchParams({
            page: String(page),
            per_page: String(PER_PAGE),
        });
        if (status) params.set("status", status);
        if (query) params.set("q", query);
        adminApi<ArticlesResponse>(`/api/wiki/me/articles?${params}`)
            .then((result) => !cancelled && setData(result))
            .catch(() => {});
        return () => {
            cancelled = true;
        };
    }, [status, page, query]);

    // Debounce the search box into the URL.
    useEffect(() => {
        if (search === query) return;
        const timer = setTimeout(() => setParams({ q: search, page: 1 }), 300);
        return () => clearTimeout(timer);
    }, [search]);

    return (
        <div>
            <PageHeader
                title="My articles"
                description="Everything you've written, most recently updated first."
                actions={
                    <Link href="/new" className={buttonClass("primary")}>
                        <Plus className="h-4 w-4" />
                        New article
                    </Link>
                }
            />

            <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex gap-1 overflow-x-auto">
                    {FILTERS.map((filter) => {
                        const active = filter.status === status;
                        const count = filter.status
                            ? stats[filter.status]
                            : stats.total;
                        return (
                            <button
                                key={filter.status || "all"}
                                onClick={() =>
                                    setParams({
                                        status: filter.status,
                                        page: 1,
                                    })
                                }
                                className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm whitespace-nowrap transition-colors ${
                                    active
                                        ? "bg-gray-700/80 text-white"
                                        : "text-gray-400 hover:bg-gray-800 hover:text-gray-200"
                                }`}
                            >
                                {filter.label}
                                {count !== undefined && (
                                    <span className="text-xs text-gray-500">
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>
                <div className="relative w-full lg:w-72">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500" />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search titles"
                        aria-label="Search your articles"
                        className={`${inputClass} pl-9`}
                    />
                </div>
            </div>

            {!data ? (
                <LoadingState />
            ) : data.articles.length === 0 ? (
                <EmptyState
                    icon={<FileText className="h-8 w-8" />}
                    title={
                        query || status
                            ? "No matching articles"
                            : "You haven't written anything yet"
                    }
                    description={
                        query || status
                            ? "Try a different filter or search."
                            : "Start a draft. You can come back and finish it whenever you like."
                    }
                    action={
                        !query && !status ? (
                            <Link
                                href="/new"
                                className={buttonClass("primary")}
                            >
                                Write your first article
                            </Link>
                        ) : undefined
                    }
                />
            ) : (
                <Card padded={false} className="overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="border-b border-gray-700/60 text-xs tracking-wider text-gray-500 uppercase">
                            <tr>
                                <th className="px-5 py-3 font-medium">Title</th>
                                <th className="hidden px-5 py-3 font-medium md:table-cell">
                                    Status
                                </th>
                                <th className="hidden px-5 py-3 font-medium lg:table-cell">
                                    Category
                                </th>
                                <th className="hidden px-5 py-3 text-right font-medium sm:table-cell">
                                    Views
                                </th>
                                <th className="hidden px-5 py-3 text-right font-medium sm:table-cell">
                                    Updated
                                </th>
                                <th className="px-5 py-3">
                                    <span className="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/60">
                            {data.articles.map((article) => (
                                <tr
                                    key={article.id}
                                    className="transition-colors hover:bg-gray-800/40"
                                >
                                    <td className="max-w-0 px-5 py-3">
                                        <Link
                                            href={`/edit/${article.id}`}
                                            className="block truncate font-medium text-white hover:text-blue-300"
                                        >
                                            {article.title}
                                        </Link>
                                        <div className="mt-1 flex items-center gap-2 md:hidden">
                                            <StatusBadge
                                                status={article.status}
                                            />
                                        </div>
                                    </td>
                                    <td className="hidden px-5 py-3 md:table-cell">
                                        <div className="flex items-center gap-2">
                                            <StatusBadge
                                                status={article.status}
                                            />
                                            <SourceBadge
                                                source={article.source}
                                            />
                                        </div>
                                    </td>
                                    <td className="hidden px-5 py-3 text-gray-400 lg:table-cell">
                                        {article.category?.name ?? "—"}
                                    </td>
                                    <td className="hidden px-5 py-3 text-right text-gray-400 tabular-nums sm:table-cell">
                                        {article.view_count.toLocaleString()}
                                    </td>
                                    <td className="hidden px-5 py-3 text-right whitespace-nowrap text-gray-400 sm:table-cell">
                                        {timeAgo(article.updated_at)}
                                    </td>
                                    <td className="px-5 py-3 text-right whitespace-nowrap">
                                        {article.status === "published" && (
                                            <SiteLink
                                                href={articleUrl(article)}
                                                className="mr-3 inline-flex items-center gap-1 text-gray-400 hover:text-white"
                                                aria-label={`View ${article.title} on the site`}
                                            >
                                                <ExternalLink className="h-4 w-4" />
                                            </SiteLink>
                                        )}
                                        <Link
                                            href={`/edit/${article.id}`}
                                            className="text-blue-400 hover:text-blue-300"
                                        >
                                            Edit
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </Card>
            )}

            {data && data.total_pages > 1 && (
                <div className="mt-5 flex items-center justify-between text-sm text-gray-400">
                    <span>
                        Page {page} of {data.total_pages} · {data.total}{" "}
                        articles
                    </span>
                    <div className="flex gap-2">
                        <button
                            className={buttonClass("secondary", "sm")}
                            disabled={page <= 1}
                            onClick={() => setParams({ page: page - 1 })}
                        >
                            Previous
                        </button>
                        <button
                            className={buttonClass("secondary", "sm")}
                            disabled={page >= data.total_pages}
                            onClick={() => setParams({ page: page + 1 })}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function MyArticlesPage() {
    return (
        <Suspense fallback={<LoadingState />}>
            <MyArticles />
        </Suspense>
    );
}
