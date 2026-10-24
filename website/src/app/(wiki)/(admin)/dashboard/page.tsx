"use client";

import { useAuth } from "@/lib/auth";
import type { ArticleSummary } from "@/lib/wiki/types";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface MyArticlesResponse {
    success: boolean;
    articles: ArticleSummary[];
    total: number;
}

interface PendingArticlesResponse {
    success: boolean;
    articles: ArticleSummary[];
    total: number;
}

interface ArticleStatsResponse {
    success: boolean;
    stats: {
        total: number;
        published: number;
        draft: number;
        pending_review: number;
        changes_requested: number;
        approved: number;
        archived: number;
    };
}

export default function DashboardPage() {
    const { user, isAuthenticated, isLoading, getLoginUrl } = useAuth();
    const router = useRouter();
    const [recentArticles, setRecentArticles] = useState<ArticleSummary[]>([]);
    const [pendingArticles, setPendingArticles] = useState<ArticleSummary[]>(
        [],
    );
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<ArticleStatsResponse["stats"] | null>(
        null,
    );

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push(getLoginUrl("/dashboard"));
        }
    }, [isLoading, isAuthenticated, router, getLoginUrl]);

    useEffect(() => {
        if (!isAuthenticated) return;

        async function fetchData() {
            try {
                const [articlesRes, pendingRes, statsRes] = await Promise.all([
                    fetch(`${API_BASE}/api/wiki/me/articles?per_page=5`, {
                        credentials: "include",
                    }),
                    fetch(`${API_BASE}/api/wiki/me/pending`, {
                        credentials: "include",
                    }),
                    fetch(`${API_BASE}/api/wiki/me/stats`, {
                        credentials: "include",
                    }),
                ]);

                const articlesData: MyArticlesResponse =
                    await articlesRes.json();
                const pendingData: PendingArticlesResponse =
                    await pendingRes.json();
                const statsData: ArticleStatsResponse = await statsRes.json();

                if (articlesData.success) {
                    setRecentArticles(articlesData.articles);
                }
                if (pendingData.success) {
                    setPendingArticles(pendingData.articles);
                }
                if (statsData.success) {
                    setStats(statsData.stats);
                }
            } catch (error) {
                console.error("Failed to fetch dashboard data:", error);
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [isAuthenticated]);

    if (isLoading || !isAuthenticated) {
        return (
            <div className="flex min-h-[400px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
        );
    }

    const statCards = [
        {
            label: "Total Articles",
            value: stats?.total || 0,
            icon: "📝",
            href: "/dashboard/articles",
        },
        {
            label: "Pending Review",
            value: stats?.pending_review || 0,
            icon: "⏳",
            href: "/dashboard/articles?status=pending_review",
        },
        {
            label: "Published",
            value: stats?.published || 0,
            icon: "✅",
            href: "/dashboard/articles?status=published",
        },
    ];

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">Dashboard</h1>
                    <p className="mt-1 text-gray-400">
                        Welcome back, {user?.firstName || user?.email}
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

            {/* Stats */}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {statCards.map((stat) => (
                    <Link
                        key={stat.label}
                        href={stat.href}
                        className="rounded-lg bg-gray-800/50 p-6 transition-colors hover:bg-gray-800"
                    >
                        <div className="flex items-center gap-4">
                            <span className="text-3xl">{stat.icon}</span>
                            <div>
                                <p className="text-2xl font-bold text-white">
                                    {stat.value}
                                </p>
                                <p className="text-sm text-gray-400">
                                    {stat.label}
                                </p>
                            </div>
                        </div>
                    </Link>
                ))}
            </div>

            {/* Pending Review Alert */}
            {pendingArticles.length > 0 && (
                <div className="rounded-lg border border-yellow-700/50 bg-yellow-900/20 p-4">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">⏳</span>
                        <div className="flex-1">
                            <h3 className="font-medium text-yellow-300">
                                Articles Pending Review
                            </h3>
                            <p className="text-sm text-yellow-200/70">
                                You have {pendingArticles.length} article(s)
                                waiting for moderator review.
                            </p>
                        </div>
                        <Link
                            href="/dashboard/articles?status=pending_review"
                            className="text-sm text-yellow-300 hover:text-yellow-200"
                        >
                            View all →
                        </Link>
                    </div>
                </div>
            )}

            {/* Moderator Section */}
            {user?.canModerate && (
                <div className="rounded-lg border border-purple-700/50 bg-purple-900/20 p-4">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">🛡️</span>
                        <div className="flex-1">
                            <h3 className="font-medium text-purple-300">
                                Moderation Queue
                            </h3>
                            <p className="text-sm text-purple-200/70">
                                You have moderator access. Review pending
                                submissions.
                            </p>
                        </div>
                        <Link
                            href="/dashboard/moderation"
                            className="text-sm text-purple-300 hover:text-purple-200"
                        >
                            Open queue →
                        </Link>
                    </div>
                </div>
            )}

            {/* Category Management Section */}
            {(user?.isStaff || user?.isModerator) && (
                <div className="rounded-lg border border-blue-700/50 bg-blue-900/20 p-4">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">📚</span>
                        <div className="flex-1">
                            <h3 className="font-medium text-blue-300">
                                Category Management
                            </h3>
                            <p className="text-sm text-blue-200/70">
                                Create and organize article categories.
                            </p>
                        </div>
                        <Link
                            href="/dashboard/categories"
                            className="text-sm text-blue-300 hover:text-blue-200"
                        >
                            Manage →
                        </Link>
                    </div>
                </div>
            )}

            {/* Admin Section */}
            {(user?.isStaff || user?.isSuperuser) && (
                <div className="rounded-lg border border-cyan-700/50 bg-cyan-900/20 p-4">
                    <div className="flex items-center gap-3">
                        <span className="text-2xl">⚙️</span>
                        <div className="flex-1">
                            <h3 className="font-medium text-cyan-300">
                                Administration
                            </h3>
                            <p className="text-sm text-cyan-200/70">
                                Manage users, roles, access, and site analytics.
                            </p>
                        </div>
                        <Link
                            href="/dashboard/admin"
                            className="text-sm text-cyan-300 hover:text-cyan-200"
                        >
                            Open admin →
                        </Link>
                    </div>
                </div>
            )}

            {/* Recent Articles */}
            <div>
                <div className="mb-4 flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-white">
                        Recent Articles
                    </h2>
                    <Link
                        href="/dashboard/articles"
                        className="text-sm text-blue-400 hover:text-blue-300"
                    >
                        View all →
                    </Link>
                </div>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                    </div>
                ) : recentArticles.length === 0 ? (
                    <div className="rounded-lg bg-gray-800/50 p-8 text-center">
                        <p className="mb-4 text-gray-400">
                            You haven&apos;t written any articles yet.
                        </p>
                        <Link
                            href="/new"
                            className="text-blue-400 hover:text-blue-300"
                        >
                            Write your first article →
                        </Link>
                    </div>
                ) : (
                    <div className="divide-y divide-gray-700/50 rounded-lg bg-gray-800/50">
                        {recentArticles.map((article) => (
                            <div
                                key={article.id}
                                className="flex items-center justify-between p-4"
                            >
                                <div className="min-w-0 flex-1">
                                    <Link
                                        href={
                                            article.category
                                                ? `/${article.category.slug}/${article.slug}`
                                                : `/articles/${article.slug}`
                                        }
                                        className="block truncate font-medium text-white hover:text-blue-400"
                                    >
                                        {article.title}
                                    </Link>
                                    <div className="mt-1 flex items-center gap-3 text-sm text-gray-400">
                                        <StatusBadge status={article.status} />
                                        <span>
                                            {new Date(
                                                article.updated_at,
                                            ).toLocaleDateString()}
                                        </span>
                                        {article.view_count > 0 && (
                                            <span>
                                                {article.view_count} views
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <Link
                                    href={`/edit/${article.id}`}
                                    className="ml-4 text-gray-400 hover:text-white"
                                >
                                    Edit
                                </Link>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Quick Links */}
            <div>
                <h2 className="mb-4 text-xl font-semibold text-white">
                    Quick Links
                </h2>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    <QuickLink href="/new" icon="✏️" label="New Article" />
                    <QuickLink
                        href="/dashboard/articles"
                        icon="📄"
                        label="My Articles"
                    />
                    <QuickLink
                        href="/dashboard/profile"
                        icon="👤"
                        label="Edit Profile"
                    />
                    {user?.canModerate && (
                        <QuickLink
                            href="/dashboard/moderation"
                            icon="🛡️"
                            label="Moderation"
                        />
                    )}
                </div>
            </div>
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

function QuickLink({
    href,
    icon,
    label,
}: {
    href: string;
    icon: string;
    label: string;
}) {
    return (
        <Link
            href={href}
            className="flex items-center gap-3 rounded-lg bg-gray-800/50 p-4 transition-colors hover:bg-gray-800"
        >
            <span className="text-xl">{icon}</span>
            <span className="text-gray-300">{label}</span>
        </Link>
    );
}
