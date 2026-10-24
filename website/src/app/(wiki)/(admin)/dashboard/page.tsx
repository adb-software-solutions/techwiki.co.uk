"use client";

import { adminApi } from "@/components/admin/api";
import {
    buttonClass,
    Card,
    EmptyState,
    isModeratorUser,
    LoadingState,
    PageHeader,
    StatusBadge,
    timeAgo,
} from "@/components/admin/ui";
import { useAuth } from "@/lib/auth";
import type { ArticleSummary, ModerationQueueResponse } from "@/lib/wiki/types";
import { ArrowRight, Bot, FileText, Inbox, Plus } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Overview {
    stats: Record<string, number>;
    recent: ArticleSummary[];
    needsWork: ArticleSummary[];
    queue: ModerationQueueResponse["counts"] | null;
}

const STAT_TILES: { key: string; label: string; href: string }[] = [
    {
        key: "published",
        label: "Published",
        href: "/dashboard/articles?status=published",
    },
    { key: "draft", label: "Drafts", href: "/dashboard/articles?status=draft" },
    {
        key: "pending_review",
        label: "Pending review",
        href: "/dashboard/articles?status=pending_review",
    },
    {
        key: "changes_requested",
        label: "Changes requested",
        href: "/dashboard/articles?status=changes_requested",
    },
];

function AttentionLink({
    href,
    icon,
    title,
    detail,
}: {
    href: string;
    icon: React.ReactNode;
    title: string;
    detail: string;
}) {
    return (
        <Link
            href={href}
            className="group flex items-center gap-4 rounded-lg border border-gray-700/60 p-4 transition-colors hover:border-gray-600 hover:bg-gray-800/40"
        >
            <div className="rounded-lg bg-yellow-500/10 p-2 text-yellow-300">
                {icon}
            </div>
            <div className="min-w-0 flex-1">
                <div className="font-medium text-white">{title}</div>
                <div className="truncate text-sm text-gray-400">{detail}</div>
            </div>
            <ArrowRight className="h-4 w-4 text-gray-500 group-hover:text-white" />
        </Link>
    );
}

export default function DashboardPage() {
    const { user } = useAuth();
    const moderator = isModeratorUser(user);
    const [overview, setOverview] = useState<Overview | null>(null);

    useEffect(() => {
        async function load() {
            const [stats, recent, needsWork, queue] = await Promise.all([
                adminApi<{ success: boolean; stats: Record<string, number> }>(
                    "/api/wiki/me/stats",
                ),
                adminApi<{ success: boolean; articles: ArticleSummary[] }>(
                    "/api/wiki/me/articles?per_page=6",
                ),
                adminApi<{ success: boolean; articles: ArticleSummary[] }>(
                    "/api/wiki/me/pending",
                ),
                moderator
                    ? adminApi<ModerationQueueResponse>(
                          "/api/wiki/moderation/queue?tab=pending&per_page=1",
                      )
                    : Promise.resolve(null),
            ]);
            setOverview({
                stats: stats.success ? stats.stats : {},
                recent: recent.success ? recent.articles : [],
                needsWork: needsWork.success
                    ? needsWork.articles.filter(
                          (a) => a.status === "changes_requested",
                      )
                    : [],
                queue: queue?.success ? queue.counts : null,
            });
        }
        load().catch(() =>
            setOverview({ stats: {}, recent: [], needsWork: [], queue: null }),
        );
    }, [moderator]);

    const firstName = user?.firstName || "there";

    return (
        <div>
            <PageHeader
                title={`Welcome back, ${firstName}`}
                description="Here's what needs your attention."
                actions={
                    <Link href="/new" className={buttonClass("primary")}>
                        <Plus className="h-4 w-4" />
                        New article
                    </Link>
                }
            />

            {!overview ? (
                <LoadingState />
            ) : (
                <div className="space-y-8">
                    <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                        {STAT_TILES.map((tile) => (
                            <Link key={tile.key} href={tile.href}>
                                <Card className="transition-colors hover:border-gray-600">
                                    <div className="text-sm text-gray-400">
                                        {tile.label}
                                    </div>
                                    <div className="mt-1 text-3xl font-semibold text-white tabular-nums">
                                        {overview.stats[tile.key] ?? 0}
                                    </div>
                                </Card>
                            </Link>
                        ))}
                    </div>

                    {(overview.queue || overview.needsWork.length > 0) && (
                        <section>
                            <h2 className="mb-3 text-sm font-semibold tracking-wider text-gray-400 uppercase">
                                Needs attention
                            </h2>
                            <div className="grid gap-3 lg:grid-cols-2">
                                {overview.queue &&
                                    overview.queue.pending > 0 && (
                                        <AttentionLink
                                            href="/dashboard/moderation"
                                            icon={<Inbox className="h-5 w-5" />}
                                            title={`${overview.queue.pending} waiting for review`}
                                            detail="Contributor submissions in the moderation queue"
                                        />
                                    )}
                                {overview.queue &&
                                    overview.queue.automation > 0 && (
                                        <AttentionLink
                                            href="/dashboard/moderation?tab=automation"
                                            icon={<Bot className="h-5 w-5" />}
                                            title={`${overview.queue.automation} automation draft${overview.queue.automation === 1 ? "" : "s"}`}
                                            detail="Drafts created through the authoring API"
                                        />
                                    )}
                                {overview.needsWork.map((article) => (
                                    <AttentionLink
                                        key={article.id}
                                        href={`/edit/${article.id}`}
                                        icon={<FileText className="h-5 w-5" />}
                                        title={article.title}
                                        detail={
                                            article.moderation_notes ||
                                            "A reviewer asked for changes"
                                        }
                                    />
                                ))}
                                {overview.queue &&
                                    overview.queue.pending === 0 &&
                                    overview.queue.automation === 0 &&
                                    overview.needsWork.length === 0 && (
                                        <p className="text-sm text-gray-400">
                                            Nothing needs your attention right
                                            now.
                                        </p>
                                    )}
                            </div>
                        </section>
                    )}

                    <section>
                        <div className="mb-3 flex items-center justify-between">
                            <h2 className="text-sm font-semibold tracking-wider text-gray-400 uppercase">
                                Recently updated
                            </h2>
                            <Link
                                href="/dashboard/articles"
                                className="text-sm text-blue-400 hover:text-blue-300"
                            >
                                All articles
                            </Link>
                        </div>
                        {overview.recent.length === 0 ? (
                            <EmptyState
                                icon={<FileText className="h-8 w-8" />}
                                title="No articles yet"
                                description="Drafts you start will show up here."
                                action={
                                    <Link
                                        href="/new"
                                        className={buttonClass("primary")}
                                    >
                                        Start a draft
                                    </Link>
                                }
                            />
                        ) : (
                            <Card
                                padded={false}
                                className="divide-y divide-gray-700/60"
                            >
                                {overview.recent.map((article) => (
                                    <Link
                                        key={article.id}
                                        href={`/edit/${article.id}`}
                                        className="flex items-center gap-4 px-5 py-3 transition-colors hover:bg-gray-800/40"
                                    >
                                        <span className="min-w-0 flex-1 truncate text-white">
                                            {article.title}
                                        </span>
                                        <StatusBadge status={article.status} />
                                        <span className="hidden w-28 text-right text-sm text-gray-400 sm:block">
                                            {timeAgo(article.updated_at)}
                                        </span>
                                    </Link>
                                ))}
                            </Card>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}
