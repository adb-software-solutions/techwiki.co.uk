"use client";

import { adminApi } from "@/components/admin/api";
import {
    AccessDenied,
    Card,
    EmptyState,
    isAdminUser,
    LoadingState,
    PageHeader,
} from "@/components/admin/ui";
import { SiteLink } from "@/components/wiki/SiteLink";
import { useAuth } from "@/lib/auth";
import { ArrowDownRight, ArrowUpRight, ChartColumn } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

type Period = "24h" | "7d" | "30d" | "90d";

const PERIODS: { value: Period; label: string }[] = [
    { value: "24h", label: "24 hours" },
    { value: "7d", label: "7 days" },
    { value: "30d", label: "30 days" },
    { value: "90d", label: "90 days" },
];

interface Ranked {
    name: string;
    views: number;
}

interface Report {
    success: boolean;
    bucket: "hour" | "day";
    summary: {
        page_views: number;
        visitors: number;
        article_views: number;
        searches: number;
        changes: Record<
            "page_views" | "visitors" | "article_views" | "searches",
            number | null
        >;
        avg_read_seconds: number | null;
        avg_scroll_depth: number | null;
        search_click_rate: number | null;
        zero_result_searches: number;
    };
    series: { t: string; page_views: number; visitors: number }[];
    top_pages: { path: string; views: number; visitors: number }[];
    top_articles: {
        article_id: string;
        title: string;
        url: string;
        category: string | null;
        views: number;
        visitors: number;
        avg_seconds: number | null;
        avg_scroll: number | null;
    }[];
    referrers: { source: string; views: number }[];
    devices: Ranked[];
    browsers: Ranked[];
    operating_systems: Ranked[];
    searches: {
        top: {
            query: string;
            count: number;
            click_rate: number;
            avg_results: number;
        }[];
        zero_results: { query: string; count: number }[];
    };
}

interface Realtime {
    active_users: number;
    top_pages: { path: string; count: number }[];
}

const number = new Intl.NumberFormat("en-GB");

function duration(seconds: number | null): string {
    if (seconds === null) return "—";
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function Change({ value }: { value: number | null }) {
    if (value === null) {
        return <span className="text-gray-500">No earlier data</span>;
    }
    const up = value >= 0;
    const Icon = up ? ArrowUpRight : ArrowDownRight;
    return (
        <span
            className={`inline-flex items-center gap-0.5 ${up ? "text-emerald-300" : "text-red-300"}`}
        >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {up ? "+" : ""}
            {value}%<span className="ml-1 text-gray-500">vs previous</span>
        </span>
    );
}

function Stat({
    label,
    value,
    footer,
}: {
    label: string;
    value: string;
    footer: ReactNode;
}) {
    return (
        <Card>
            <div className="text-sm text-gray-400">{label}</div>
            <div className="mt-1 text-3xl font-semibold text-white tabular-nums">
                {value}
            </div>
            <div className="mt-2 text-xs">{footer}</div>
        </Card>
    );
}

function TrafficChart({
    series,
    bucket,
}: {
    series: Report["series"];
    bucket: Report["bucket"];
}) {
    const [hover, setHover] = useState<number | null>(null);
    const max = Math.max(1, ...series.map((point) => point.page_views));
    const label = (iso: string) =>
        new Date(iso).toLocaleString(
            "en-GB",
            bucket === "hour"
                ? { hour: "2-digit", minute: "2-digit" }
                : { day: "numeric", month: "short" },
        );
    const tickEvery = Math.max(1, Math.ceil(series.length / 8));
    const active = hover === null ? null : series[hover];

    return (
        <div>
            <div className="mb-3 flex h-5 items-baseline justify-between gap-4 text-sm">
                <span className="text-gray-400">Page views per {bucket}</span>
                {active && (
                    <span className="text-gray-300 tabular-nums">
                        <span className="text-white">{label(active.t)}</span>
                        {" · "}
                        {number.format(active.page_views)} views
                        {" · "}
                        {number.format(active.visitors)} visitors
                    </span>
                )}
            </div>
            <div className="relative h-56">
                {[0.25, 0.5, 0.75].map((line) => (
                    <div
                        key={line}
                        className="absolute inset-x-0 border-t border-gray-700/40"
                        style={{ bottom: `${line * 100}%` }}
                    />
                ))}
                <div className="absolute top-0 right-0 text-[11px] text-gray-500 tabular-nums">
                    {number.format(max)}
                </div>
                <div
                    className="absolute inset-0 flex items-end gap-[2px] border-b border-gray-600"
                    onMouseLeave={() => setHover(null)}
                >
                    {series.map((point, index) => (
                        <button
                            key={point.t}
                            type="button"
                            className="group flex h-full min-w-0 flex-1 items-end focus:outline-none"
                            onMouseEnter={() => setHover(index)}
                            onFocus={() => setHover(index)}
                            aria-label={`${label(point.t)}: ${point.page_views} page views, ${point.visitors} visitors`}
                        >
                            <span
                                className={`block w-full rounded-t-[4px] transition-colors ${hover === index ? "bg-blue-300" : "bg-blue-500"}`}
                                style={{
                                    height: `${(point.page_views / max) * 100}%`,
                                    minHeight: point.page_views ? 2 : 0,
                                }}
                            />
                        </button>
                    ))}
                </div>
            </div>
            <div className="mt-2 flex text-[11px] text-gray-500">
                {series.map((point, index) => (
                    <span
                        key={point.t}
                        className="min-w-0 flex-1 overflow-hidden whitespace-nowrap"
                    >
                        {index % tickEvery === 0 ? label(point.t) : ""}
                    </span>
                ))}
            </div>
        </div>
    );
}

function RankedList({
    title,
    rows,
    empty,
}: {
    title: string;
    rows: { key: string; label: ReactNode; value: number; detail?: string }[];
    empty: string;
}) {
    const max = Math.max(1, ...rows.map((row) => row.value));
    return (
        <Card>
            <h2 className="mb-4 font-semibold text-white">{title}</h2>
            {rows.length === 0 ? (
                <p className="text-sm text-gray-500">{empty}</p>
            ) : (
                <ul className="space-y-2.5">
                    {rows.map((row) => (
                        <li key={row.key}>
                            <div className="flex items-baseline justify-between gap-3 text-sm">
                                <span className="min-w-0 truncate text-gray-200">
                                    {row.label}
                                </span>
                                <span className="shrink-0 text-gray-300 tabular-nums">
                                    {number.format(row.value)}
                                    {row.detail && (
                                        <span className="ml-2 text-xs text-gray-500">
                                            {row.detail}
                                        </span>
                                    )}
                                </span>
                            </div>
                            <div className="mt-1 h-1.5 rounded-full bg-gray-800">
                                <div
                                    className="h-full rounded-full bg-blue-500/70"
                                    style={{
                                        width: `${(row.value / max) * 100}%`,
                                    }}
                                />
                            </div>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    );
}

export default function AnalyticsPage() {
    const { user } = useAuth();
    const admin = isAdminUser(user);
    const [period, setPeriod] = useState<Period>("7d");
    const [report, setReport] = useState<Report | null>(null);
    const [realtime, setRealtime] = useState<Realtime | null>(null);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (!admin) return;
        let cancelled = false;
        setReport(null);
        setFailed(false);
        adminApi<Report>(`/api/analytics/dashboard?period=${period}`)
            .then((data) => {
                if (cancelled) return;
                if (data.success) setReport(data);
                else setFailed(true);
            })
            .catch(() => !cancelled && setFailed(true));
        return () => {
            cancelled = true;
        };
    }, [admin, period]);

    useEffect(() => {
        if (!admin) return;
        const load = () =>
            adminApi<Realtime>("/api/analytics/realtime")
                .then(setRealtime)
                .catch(() => {});
        load();
        const interval = setInterval(load, 30000);
        return () => clearInterval(interval);
    }, [admin]);

    if (!admin) return <AccessDenied what="Analytics" />;

    const summary = report?.summary;

    return (
        <div>
            <PageHeader
                title="Analytics"
                description="Visits to the public site, excluding bots and admin pages."
                actions={
                    <>
                        {realtime && (
                            <span className="inline-flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
                                <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                                {realtime.active_users} active in the last 30
                                min
                            </span>
                        )}
                        <div
                            className="inline-flex rounded-lg border border-gray-700 bg-gray-900/60 p-0.5"
                            role="tablist"
                            aria-label="Period"
                        >
                            {PERIODS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    role="tab"
                                    aria-selected={period === option.value}
                                    onClick={() => setPeriod(option.value)}
                                    className={`rounded-md px-3 py-1.5 text-sm transition-colors ${period === option.value ? "bg-gray-700 text-white" : "text-gray-400 hover:text-white"}`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>
                    </>
                }
            />

            {failed ? (
                <EmptyState
                    title="Analytics could not be loaded"
                    description="Try again in a moment."
                />
            ) : !report || !summary ? (
                <LoadingState />
            ) : summary.page_views === 0 ? (
                <EmptyState
                    icon={<ChartColumn className="h-8 w-8" />}
                    title="No visits recorded in this period"
                    description="Visits are recorded from the public site as people browse it. Try a longer period."
                />
            ) : (
                <div className="space-y-6">
                    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                        <Stat
                            label="Page views"
                            value={number.format(summary.page_views)}
                            footer={
                                <Change value={summary.changes.page_views} />
                            }
                        />
                        <Stat
                            label="Visitors"
                            value={number.format(summary.visitors)}
                            footer={<Change value={summary.changes.visitors} />}
                        />
                        <Stat
                            label="Article reads"
                            value={number.format(summary.article_views)}
                            footer={
                                <Change value={summary.changes.article_views} />
                            }
                        />
                        <Stat
                            label="Avg. reading time"
                            value={duration(summary.avg_read_seconds)}
                            footer={
                                <span className="text-gray-500">
                                    {summary.avg_scroll_depth === null
                                        ? "Scroll depth not recorded yet"
                                        : `Readers scroll ${summary.avg_scroll_depth}% on average`}
                                </span>
                            }
                        />
                    </div>

                    <Card>
                        <TrafficChart
                            series={report.series}
                            bucket={report.bucket}
                        />
                    </Card>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        <Card
                            padded={false}
                            className="min-w-0 overflow-hidden"
                        >
                            <h2 className="px-5 pt-5 pb-3 font-semibold text-white">
                                Top articles
                            </h2>
                            {report.top_articles.length === 0 ? (
                                <p className="px-5 pb-5 text-sm text-gray-500">
                                    No article reads in this period.
                                </p>
                            ) : (
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm">
                                        <thead className="text-left text-xs text-gray-500">
                                            <tr className="border-b border-gray-700/60">
                                                <th className="w-full px-5 py-2 font-medium">
                                                    Article
                                                </th>
                                                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
                                                    Reads
                                                </th>
                                                <th className="px-3 py-2 text-right font-medium whitespace-nowrap">
                                                    Readers
                                                </th>
                                                <th className="px-5 py-2 text-right font-medium whitespace-nowrap">
                                                    Avg. time
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-800">
                                            {report.top_articles.map(
                                                (article) => (
                                                    <tr
                                                        key={article.article_id}
                                                    >
                                                        <td className="max-w-0 px-5 py-2.5">
                                                            <SiteLink
                                                                href={
                                                                    article.url
                                                                }
                                                                className="block truncate text-gray-100 hover:text-blue-300"
                                                            >
                                                                {article.title}
                                                            </SiteLink>
                                                            {article.category && (
                                                                <span className="text-xs text-gray-500">
                                                                    {
                                                                        article.category
                                                                    }
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right text-gray-200 tabular-nums">
                                                            {number.format(
                                                                article.views,
                                                            )}
                                                        </td>
                                                        <td className="px-3 py-2.5 text-right text-gray-400 tabular-nums">
                                                            {number.format(
                                                                article.visitors,
                                                            )}
                                                        </td>
                                                        <td className="px-5 py-2.5 text-right text-gray-400 tabular-nums">
                                                            {duration(
                                                                article.avg_seconds,
                                                            )}
                                                        </td>
                                                    </tr>
                                                ),
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </Card>
                        <RankedList
                            title="Top pages"
                            empty="No page views in this period."
                            rows={report.top_pages.map((page) => ({
                                key: page.path,
                                label: page.path,
                                value: page.views,
                                detail: `${number.format(page.visitors)} visitors`,
                            }))}
                        />
                    </div>

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-4">
                        <RankedList
                            title="Sources"
                            empty="No referrers recorded."
                            rows={report.referrers.map((row) => ({
                                key: row.source,
                                label: row.source,
                                value: row.views,
                            }))}
                        />
                        {(
                            [
                                ["Devices", report.devices],
                                ["Browsers", report.browsers],
                                ["Operating systems", report.operating_systems],
                            ] as const
                        ).map(([title, rows]) => (
                            <RankedList
                                key={title}
                                title={title}
                                empty="Nothing recorded."
                                rows={rows.map((row) => ({
                                    key: row.name,
                                    // Device types arrive lowercase.
                                    label:
                                        title === "Devices"
                                            ? row.name.charAt(0).toUpperCase() +
                                              row.name.slice(1)
                                            : row.name,
                                    value: row.views,
                                }))}
                            />
                        ))}
                    </div>

                    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                        <RankedList
                            title={`Searches · ${number.format(summary.searches)}${summary.search_click_rate === null ? "" : ` · ${summary.search_click_rate}% led to a click`}`}
                            empty="No searches in this period."
                            rows={report.searches.top.map((row) => ({
                                key: row.query,
                                label: `“${row.query}”`,
                                value: row.count,
                                detail: `${row.click_rate}% clicked`,
                            }))}
                        />
                        <RankedList
                            title={`Searches with no results · ${number.format(summary.zero_result_searches)}`}
                            empty="Every search found something."
                            rows={report.searches.zero_results.map((row) => ({
                                key: row.query,
                                label: `“${row.query}”`,
                                value: row.count,
                            }))}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}
