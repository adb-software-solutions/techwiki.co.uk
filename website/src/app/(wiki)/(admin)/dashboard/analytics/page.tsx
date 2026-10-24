"use client";

import { useAuth } from "@/lib/auth";
import {
    ArrowTrendingDownIcon,
    ArrowTrendingUpIcon,
    ChartBarIcon,
    ClockIcon,
    ComputerDesktopIcon,
    DevicePhoneMobileIcon,
    DeviceTabletIcon,
    EyeIcon,
    MagnifyingGlassIcon,
    UsersIcon,
} from "@heroicons/react/24/outline";
import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface AnalyticsSummary {
    period: string;
    total_page_views: number;
    unique_visitors: number;
    total_article_views: number;
    total_searches: number;
    avg_time_on_article: number | null;
    bounce_rate: number | null;
    page_views_change: number | null;
    visitors_change: number | null;
    article_views_change: number | null;
    searches_change: number | null;
}

interface TopArticle {
    rank: number;
    article_id: string;
    article_title: string;
    article_slug: string;
    category_name: string | null;
    view_count: number;
    unique_visitors: number;
}

interface TopSearchQuery {
    rank: number;
    query: string;
    search_count: number;
    click_through_rate: number | null;
}

interface DeviceBreakdown {
    desktop: number;
    mobile: number;
    tablet: number;
    desktop_percentage: number;
    mobile_percentage: number;
    tablet_percentage: number;
}

interface AnalyticsDashboard {
    summary: AnalyticsSummary;
    top_articles: TopArticle[];
    top_searches: TopSearchQuery[];
    device_breakdown: DeviceBreakdown;
}

interface RealtimeData {
    active_users: number;
    top_pages: { path: string; count: number }[];
}

function StatCard({
    title,
    value,
    change,
    icon: Icon,
    format = "number",
}: {
    title: string;
    value: number | null;
    change: number | null;
    icon: React.ElementType;
    format?: "number" | "time" | "percentage";
}) {
    const formatValue = (val: number | null) => {
        if (val === null) return "—";
        if (format === "time") {
            const mins = Math.floor(val / 60);
            const secs = Math.round(val % 60);
            return `${mins}m ${secs}s`;
        }
        if (format === "percentage") {
            return `${val.toFixed(1)}%`;
        }
        return val.toLocaleString();
    };

    const isPositive = change !== null && change >= 0;

    return (
        <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-6">
            <div className="flex items-start justify-between">
                <div>
                    <p className="text-sm text-gray-400">{title}</p>
                    <p className="mt-1 text-3xl font-bold text-white">
                        {formatValue(value)}
                    </p>
                </div>
                <div className="rounded-lg bg-blue-500/20 p-3">
                    <Icon className="h-6 w-6 text-blue-400" />
                </div>
            </div>
            {change !== null && (
                <div className="mt-4 flex items-center gap-1">
                    {isPositive ? (
                        <ArrowTrendingUpIcon className="h-4 w-4 text-green-400" />
                    ) : (
                        <ArrowTrendingDownIcon className="h-4 w-4 text-red-400" />
                    )}
                    <span
                        className={`text-sm ${isPositive ? "text-green-400" : "text-red-400"}`}
                    >
                        {isPositive ? "+" : ""}
                        {change.toFixed(1)}%
                    </span>
                    <span className="text-sm text-gray-500">
                        vs previous period
                    </span>
                </div>
            )}
        </div>
    );
}

function DeviceStats({ breakdown }: { breakdown: DeviceBreakdown }) {
    const total = breakdown.desktop + breakdown.mobile + breakdown.tablet || 1;

    return (
        <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-6">
            <h3 className="mb-4 text-lg font-semibold text-white">
                Device Breakdown
            </h3>
            <div className="space-y-4">
                <div>
                    <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <ComputerDesktopIcon className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-300">
                                Desktop
                            </span>
                        </div>
                        <span className="text-sm text-white">
                            {breakdown.desktop.toLocaleString()} (
                            {breakdown.desktop_percentage.toFixed(1)}%)
                        </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-700">
                        <div
                            className="h-full rounded-full bg-blue-500"
                            style={{
                                width: `${breakdown.desktop_percentage}%`,
                            }}
                        />
                    </div>
                </div>
                <div>
                    <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <DevicePhoneMobileIcon className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-300">
                                Mobile
                            </span>
                        </div>
                        <span className="text-sm text-white">
                            {breakdown.mobile.toLocaleString()} (
                            {breakdown.mobile_percentage.toFixed(1)}%)
                        </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-700">
                        <div
                            className="h-full rounded-full bg-green-500"
                            style={{ width: `${breakdown.mobile_percentage}%` }}
                        />
                    </div>
                </div>
                <div>
                    <div className="mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <DeviceTabletIcon className="h-4 w-4 text-gray-400" />
                            <span className="text-sm text-gray-300">
                                Tablet
                            </span>
                        </div>
                        <span className="text-sm text-white">
                            {breakdown.tablet.toLocaleString()} (
                            {breakdown.tablet_percentage.toFixed(1)}%)
                        </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-700">
                        <div
                            className="h-full rounded-full bg-yellow-500"
                            style={{ width: `${breakdown.tablet_percentage}%` }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function AnalyticsDashboardPage() {
    const { user, isLoading: authLoading } = useAuth();
    const [period, setPeriod] = useState<"today" | "week" | "month">("week");
    const [dashboard, setDashboard] = useState<AnalyticsDashboard | null>(null);
    const [realtime, setRealtime] = useState<RealtimeData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Check if user is admin
    const isAdmin = user?.isStaff || user?.isSuperuser;

    useEffect(() => {
        if (authLoading) return;
        if (!isAdmin) {
            setLoading(false);
            return;
        }

        async function fetchData() {
            try {
                setLoading(true);
                const [dashboardRes, realtimeRes] = await Promise.all([
                    fetch(
                        `${API_BASE}/api/analytics/dashboard?period=${period}`,
                        {
                            credentials: "include",
                        },
                    ),
                    fetch(`${API_BASE}/api/analytics/realtime`, {
                        credentials: "include",
                    }),
                ]);

                if (dashboardRes.ok) {
                    setDashboard(await dashboardRes.json());
                } else if (dashboardRes.status === 403) {
                    setError("Admin access required");
                }

                if (realtimeRes.ok) {
                    setRealtime(await realtimeRes.json());
                }

                setLoading(false);
            } catch (err) {
                console.error("Failed to fetch analytics:", err);
                setError("Failed to load analytics");
                setLoading(false);
            }
        }

        fetchData();

        // Refresh realtime data every 30 seconds
        const interval = setInterval(async () => {
            try {
                const res = await fetch(`${API_BASE}/api/analytics/realtime`, {
                    credentials: "include",
                });
                if (res.ok) {
                    setRealtime(await res.json());
                }
            } catch (err) {
                console.error("Failed to refresh realtime:", err);
            }
        }, 30000);

        return () => clearInterval(interval);
    }, [period, isAdmin, authLoading]);

    if (authLoading || loading) {
        return (
            <div className="flex items-center justify-center py-16">
                <div className="h-8 w-8 animate-spin rounded-full border-t-2 border-b-2 border-blue-500" />
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="py-16 text-center">
                <h1 className="mb-2 text-2xl font-bold text-white">
                    Access Denied
                </h1>
                <p className="text-gray-400">
                    You need admin privileges to view analytics.
                </p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="py-16 text-center">
                <h1 className="mb-2 text-2xl font-bold text-white">Error</h1>
                <p className="text-red-400">{error}</p>
            </div>
        );
    }

    return (
        <div>
            <div className="mb-8 flex items-center justify-between">
                <h1 className="text-3xl font-bold text-white">
                    Analytics Dashboard
                </h1>
                <div className="flex items-center gap-2">
                    {realtime && (
                        <div className="flex items-center gap-2 rounded-lg bg-green-500/20 px-3 py-1.5 text-sm text-green-400">
                            <span className="h-2 w-2 animate-pulse rounded-full bg-green-500" />
                            {realtime.active_users} active now
                        </div>
                    )}
                    <select
                        value={period}
                        onChange={(e) =>
                            setPeriod(
                                e.target.value as "today" | "week" | "month",
                            )
                        }
                        className="rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white"
                    >
                        <option value="today">Today</option>
                        <option value="week">Last 7 Days</option>
                        <option value="month">Last 30 Days</option>
                    </select>
                </div>
            </div>

            {dashboard && (
                <>
                    {/* Summary Stats */}
                    <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <StatCard
                            title="Page Views"
                            value={dashboard.summary.total_page_views}
                            change={dashboard.summary.page_views_change}
                            icon={EyeIcon}
                        />
                        <StatCard
                            title="Unique Visitors"
                            value={dashboard.summary.unique_visitors}
                            change={dashboard.summary.visitors_change}
                            icon={UsersIcon}
                        />
                        <StatCard
                            title="Article Views"
                            value={dashboard.summary.total_article_views}
                            change={dashboard.summary.article_views_change}
                            icon={ChartBarIcon}
                        />
                        <StatCard
                            title="Searches"
                            value={dashboard.summary.total_searches}
                            change={dashboard.summary.searches_change}
                            icon={MagnifyingGlassIcon}
                        />
                    </div>

                    <div className="mb-8 grid gap-6 lg:grid-cols-3">
                        {/* Avg Time on Article */}
                        <StatCard
                            title="Avg. Time on Article"
                            value={dashboard.summary.avg_time_on_article}
                            change={null}
                            icon={ClockIcon}
                            format="time"
                        />
                        {/* Device Breakdown */}
                        <div className="lg:col-span-2">
                            <DeviceStats
                                breakdown={dashboard.device_breakdown}
                            />
                        </div>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2">
                        {/* Top Articles */}
                        <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-6">
                            <h3 className="mb-4 text-lg font-semibold text-white">
                                Top Articles
                            </h3>
                            {dashboard.top_articles.length > 0 ? (
                                <div className="space-y-3">
                                    {dashboard.top_articles.map((article) => (
                                        <div
                                            key={article.article_id}
                                            className="flex items-center gap-4"
                                        >
                                            <span className="w-8 text-xl font-bold text-gray-500">
                                                #{article.rank}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-white">
                                                    {article.article_title}
                                                </p>
                                                {article.category_name && (
                                                    <p className="text-sm text-gray-400">
                                                        {article.category_name}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <p className="text-white">
                                                    {article.view_count.toLocaleString()}
                                                </p>
                                                <p className="text-sm text-gray-400">
                                                    {article.unique_visitors.toLocaleString()}{" "}
                                                    unique
                                                </p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-400">No data yet</p>
                            )}
                        </div>

                        {/* Top Searches */}
                        <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-6">
                            <h3 className="mb-4 text-lg font-semibold text-white">
                                Top Searches
                            </h3>
                            {dashboard.top_searches.length > 0 ? (
                                <div className="space-y-3">
                                    {dashboard.top_searches.map((search) => (
                                        <div
                                            key={`${search.rank}-${search.query}`}
                                            className="flex items-center gap-4"
                                        >
                                            <span className="w-8 text-xl font-bold text-gray-500">
                                                #{search.rank}
                                            </span>
                                            <div className="min-w-0 flex-1">
                                                <p className="truncate text-white">
                                                    &quot;{search.query}&quot;
                                                </p>
                                            </div>
                                            <div className="text-right">
                                                <p className="text-white">
                                                    {search.search_count.toLocaleString()}
                                                </p>
                                                {search.click_through_rate !==
                                                    null && (
                                                    <p className="text-sm text-gray-400">
                                                        {search.click_through_rate.toFixed(
                                                            1,
                                                        )}
                                                        % CTR
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <p className="text-gray-400">No searches yet</p>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
