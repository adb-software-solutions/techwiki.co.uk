"use client";

import { useAuth } from "@/lib/auth";
import type { ArticleSummary } from "@/lib/wiki/types";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface MyArticlesResponse {
    success: boolean;
    articles: ArticleSummary[];
    total: number;
}

function ArticlesContent() {
    const { isAuthenticated, isLoading, getLoginUrl } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const statusFilter = searchParams.get("status") || "";

    const [articles, setArticles] = useState<ArticleSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const perPage = 20;

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push(getLoginUrl("/dashboard/articles"));
        }
    }, [isLoading, isAuthenticated, router, getLoginUrl]);

    useEffect(() => {
        if (!isAuthenticated) return;

        async function fetchArticles() {
            setLoading(true);
            try {
                const params = new URLSearchParams({
                    page: page.toString(),
                    per_page: perPage.toString(),
                });
                if (statusFilter) {
                    params.set("status", statusFilter);
                }

                const res = await fetch(
                    `${API_BASE}/api/wiki/me/articles?${params}`,
                    { credentials: "include" },
                );
                const data: MyArticlesResponse = await res.json();

                if (data.success) {
                    setArticles(data.articles);
                    setTotal(data.total);
                }
            } catch (error) {
                console.error("Failed to fetch articles:", error);
            } finally {
                setLoading(false);
            }
        }

        fetchArticles();
    }, [isAuthenticated, page, statusFilter]);

    if (isLoading || !isAuthenticated) {
        return (
            <div className="flex min-h-[400px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
        );
    }

    const totalPages = Math.ceil(total / perPage);

    const statusOptions = [
        { value: "", label: "All" },
        { value: "draft", label: "Drafts" },
        { value: "pending_review", label: "Pending Review" },
        { value: "changes_requested", label: "Changes Requested" },
        { value: "approved", label: "Approved" },
        { value: "published", label: "Published" },
        { value: "archived", label: "Archived" },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">
                        My Articles
                    </h1>
                    <p className="mt-1 text-gray-400">
                        {total} article{total !== 1 ? "s" : ""} total
                    </p>
                </div>
                <Link
                    href="/new"
                    className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
                >
                    <span>+</span>
                    New Article
                </Link>
            </div>

            {/* Filters */}
            <div className="flex items-center gap-4">
                <label className="text-sm text-gray-400">
                    Filter by status:
                </label>
                <select
                    value={statusFilter}
                    onChange={(e) => {
                        const newParams = new URLSearchParams(searchParams);
                        if (e.target.value) {
                            newParams.set("status", e.target.value);
                        } else {
                            newParams.delete("status");
                        }
                        router.push(`/dashboard/articles?${newParams}`);
                    }}
                    className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                >
                    {statusOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>

            {/* Articles List */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                </div>
            ) : articles.length === 0 ? (
                <div className="rounded-lg bg-gray-800/50 p-8 text-center">
                    <p className="mb-4 text-gray-400">
                        {statusFilter
                            ? `No articles with status "${statusFilter}".`
                            : "You haven't written any articles yet."}
                    </p>
                    <Link
                        href="/new"
                        className="text-blue-400 hover:text-blue-300"
                    >
                        Write your first article →
                    </Link>
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg bg-gray-800/50">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-gray-700/50">
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">
                                    Title
                                </th>
                                <th className="hidden px-4 py-3 text-left text-sm font-medium text-gray-400 md:table-cell">
                                    Category
                                </th>
                                <th className="px-4 py-3 text-left text-sm font-medium text-gray-400">
                                    Status
                                </th>
                                <th className="hidden px-4 py-3 text-left text-sm font-medium text-gray-400 sm:table-cell">
                                    Updated
                                </th>
                                <th className="hidden px-4 py-3 text-left text-sm font-medium text-gray-400 lg:table-cell">
                                    Views
                                </th>
                                <th className="px-4 py-3 text-right text-sm font-medium text-gray-400">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50">
                            {articles.map((article) => (
                                <tr
                                    key={article.id}
                                    className="hover:bg-gray-700/20"
                                >
                                    <td className="px-4 py-3">
                                        <Link
                                            href={
                                                article.category
                                                    ? `/${article.category.slug}/${article.slug}`
                                                    : `/articles/${article.slug}`
                                            }
                                            className="font-medium text-white hover:text-blue-400"
                                        >
                                            {article.title}
                                        </Link>
                                    </td>
                                    <td className="hidden px-4 py-3 text-gray-400 md:table-cell">
                                        {article.category?.name || "-"}
                                    </td>
                                    <td className="px-4 py-3">
                                        <StatusBadge status={article.status} />
                                    </td>
                                    <td className="hidden px-4 py-3 text-sm text-gray-400 sm:table-cell">
                                        {new Date(
                                            article.updated_at,
                                        ).toLocaleDateString()}
                                    </td>
                                    <td className="hidden px-4 py-3 text-sm text-gray-400 lg:table-cell">
                                        {article.view_count}
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <div className="flex items-center justify-end gap-2">
                                            <Link
                                                href={`/edit/${article.id}`}
                                                className="text-sm text-blue-400 hover:text-blue-300"
                                            >
                                                Edit
                                            </Link>
                                            {article.status === "published" && (
                                                <Link
                                                    href={
                                                        article.category
                                                            ? `/${article.category.slug}/${article.slug}`
                                                            : `/articles/${article.slug}`
                                                    }
                                                    className="text-sm text-gray-400 hover:text-white"
                                                >
                                                    View
                                                </Link>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="rounded bg-gray-800 px-3 py-1 text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Previous
                    </button>
                    <span className="px-4 text-gray-400">
                        Page {page} of {totalPages}
                    </span>
                    <button
                        onClick={() =>
                            setPage((p) => Math.min(totalPages, p + 1))
                        }
                        disabled={page === totalPages}
                        className="rounded bg-gray-800 px-3 py-1 text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const statusConfig: Record<string, { color: string; label: string }> = {
        draft: { color: "bg-gray-600", label: "Draft" },
        pending_review: { color: "bg-yellow-600", label: "Pending" },
        changes_requested: {
            color: "bg-orange-600",
            label: "Changes Requested",
        },
        approved: { color: "bg-green-600", label: "Approved" },
        published: { color: "bg-blue-600", label: "Published" },
        archived: { color: "bg-gray-700", label: "Archived" },
    };

    const config = statusConfig[status] || {
        color: "bg-gray-600",
        label: status,
    };

    return (
        <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${config.color} text-white`}
        >
            {config.label}
        </span>
    );
}

export default function DashboardArticlesPage() {
    return (
        <Suspense
            fallback={
                <div className="flex min-h-[400px] items-center justify-center">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                </div>
            }
        >
            <ArticlesContent />
        </Suspense>
    );
}
