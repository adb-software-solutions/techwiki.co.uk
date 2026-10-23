"use client";

import { useAuth } from "@/lib/auth";
import type { ArticleSummary } from "@/lib/wiki/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PendingArticlesResponse {
    success: boolean;
    articles: ArticleSummary[];
    total: number;
}

export default function ModerationPage() {
    const { user, isAuthenticated, isLoading, getLoginUrl } = useAuth();
    const router = useRouter();
    const [articles, setArticles] = useState<ArticleSummary[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState<string | null>(null);
    const perPage = 20;

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push(getLoginUrl("/dashboard/moderation"));
            return;
        }
        if (
            !isLoading &&
            user &&
            !user.canModerate &&
            !user.isStaff &&
            !user.isSuperuser
        ) {
            router.push("/dashboard");
        }
    }, [isLoading, isAuthenticated, user, router, getLoginUrl]);

    useEffect(() => {
        if (!isAuthenticated || !user?.canModerate) return;

        async function fetchPending() {
            setLoading(true);
            try {
                const res = await fetch(
                    `${API_BASE}/api/wiki/moderation/pending?page=${page}&per_page=${perPage}`,
                    { credentials: "include" },
                );
                const data: PendingArticlesResponse = await res.json();

                if (data.success) {
                    setArticles(data.articles);
                    setTotal(data.total);
                }
            } catch (error) {
                console.error("Failed to fetch pending articles:", error);
            } finally {
                setLoading(false);
            }
        }

        fetchPending();
    }, [isAuthenticated, user, page]);

    const handleModeration = async (
        articleId: string,
        action: string,
        notes?: string,
    ) => {
        setActionLoading(articleId);
        try {
            const res = await fetch(
                `${API_BASE}/api/wiki/articles/${articleId}/moderate`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ action, notes: notes || "" }),
                },
            );
            const data = await res.json();

            if (data.success) {
                // Remove from list
                setArticles((prev) => prev.filter((a) => a.id !== articleId));
                setTotal((prev) => prev - 1);
            } else {
                alert(data.message || "Moderation action failed");
            }
        } catch (error) {
            console.error("Moderation error:", error);
            alert("Failed to perform moderation action");
        } finally {
            setActionLoading(null);
        }
    };

    if (isLoading || !isAuthenticated || !user?.canModerate) {
        return (
            <div className="flex min-h-[400px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
        );
    }

    const totalPages = Math.ceil(total / perPage);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white">
                    Moderation Queue
                </h1>
                <p className="mt-1 text-gray-400">
                    {total} article{total !== 1 ? "s" : ""} pending review
                </p>
            </div>

            {/* Queue */}
            {loading ? (
                <div className="flex items-center justify-center py-12">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                </div>
            ) : articles.length === 0 ? (
                <div className="rounded-lg bg-gray-800/50 p-8 text-center">
                    <span className="mb-4 block text-4xl">🎉</span>
                    <p className="text-gray-400">
                        No articles pending review. Great job!
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                    {articles.map((article) => (
                        <div
                            key={article.id}
                            className="rounded-lg bg-gray-800/50 p-6"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <Link
                                        href={`/edit/${article.id}`}
                                        className="text-xl font-semibold text-white hover:text-blue-400"
                                    >
                                        {article.title}
                                    </Link>
                                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-gray-400">
                                        {article.category && (
                                            <span className="rounded bg-gray-700 px-2 py-0.5">
                                                {article.category.name}
                                            </span>
                                        )}
                                        <span>
                                            Type: {article.article_type}
                                        </span>
                                        <span>•</span>
                                        <span>
                                            By: {article.author?.first_name}{" "}
                                            {article.author?.last_name}
                                        </span>
                                        <span>•</span>
                                        <span>
                                            Submitted:{" "}
                                            {new Date(
                                                article.created_at,
                                            ).toLocaleDateString()}
                                        </span>
                                    </div>
                                    {article.excerpt && (
                                        <p className="mt-3 line-clamp-2 text-gray-400">
                                            {article.excerpt}
                                        </p>
                                    )}
                                </div>

                                <StatusBadge status={article.status} />
                            </div>

                            {/* Actions */}
                            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-gray-700/50 pt-4">
                                <Link
                                    href={`/edit/${article.id}?preview=true`}
                                    className="rounded bg-gray-700 px-3 py-1.5 text-sm text-white hover:bg-gray-600"
                                >
                                    Preview
                                </Link>
                                <button
                                    onClick={() =>
                                        handleModeration(article.id, "approve")
                                    }
                                    disabled={actionLoading === article.id}
                                    className="rounded bg-green-600 px-3 py-1.5 text-sm text-white hover:bg-green-500 disabled:opacity-50"
                                >
                                    {actionLoading === article.id
                                        ? "..."
                                        : "Approve"}
                                </button>
                                <button
                                    onClick={() =>
                                        handleModeration(article.id, "publish")
                                    }
                                    disabled={actionLoading === article.id}
                                    className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500 disabled:opacity-50"
                                >
                                    {actionLoading === article.id
                                        ? "..."
                                        : "Approve & Publish"}
                                </button>
                                <button
                                    onClick={() => {
                                        const notes = prompt(
                                            "Enter feedback for the author:",
                                        );
                                        if (notes) {
                                            handleModeration(
                                                article.id,
                                                "request_changes",
                                                notes,
                                            );
                                        }
                                    }}
                                    disabled={actionLoading === article.id}
                                    className="rounded bg-orange-600 px-3 py-1.5 text-sm text-white hover:bg-orange-500 disabled:opacity-50"
                                >
                                    Request Changes
                                </button>
                                <button
                                    onClick={() => {
                                        if (
                                            confirm(
                                                "Are you sure you want to reject this article?",
                                            )
                                        ) {
                                            const notes = prompt(
                                                "Reason for rejection:",
                                            );
                                            handleModeration(
                                                article.id,
                                                "reject",
                                                notes || "",
                                            );
                                        }
                                    }}
                                    disabled={actionLoading === article.id}
                                    className="rounded bg-red-600 px-3 py-1.5 text-sm text-white hover:bg-red-500 disabled:opacity-50"
                                >
                                    Reject
                                </button>
                            </div>
                        </div>
                    ))}
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
        pending_review: { color: "bg-yellow-600", label: "Pending Review" },
        changes_requested: {
            color: "bg-orange-600",
            label: "Changes Requested",
        },
    };

    const config = statusConfig[status] || {
        color: "bg-gray-600",
        label: status,
    };

    return (
        <span
            className={`inline-flex items-center rounded px-2 py-0.5 text-xs ${config.color} shrink-0 text-white`}
        >
            {config.label}
        </span>
    );
}
