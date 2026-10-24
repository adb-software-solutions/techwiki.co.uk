"use client";

import { adminApi } from "@/components/admin/api";
import {
    AccessDenied,
    buttonClass,
    Card,
    EmptyState,
    isModeratorUser,
    LoadingState,
    PageHeader,
    SourceBadge,
    StatusBadge,
    timeAgo,
} from "@/components/admin/ui";
import { useAuth } from "@/lib/auth";
import type {
    DecidedQueueItem,
    ModerationQueueResponse,
    QueueArticle,
    QueueTab,
} from "@/lib/wiki/types";
import { Bot, ChevronRight, CircleCheckBig, Inbox } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

const PER_PAGE = 20;

const TABS: { id: QueueTab; label: string; empty: string }[] = [
    {
        id: "pending",
        label: "Pending review",
        empty: "Nothing is waiting for review.",
    },
    {
        id: "changes_requested",
        label: "Changes requested",
        empty: "No articles are waiting on their authors.",
    },
    {
        id: "automation",
        label: "Automation drafts",
        empty: "No drafts from the authoring API are waiting.",
    },
    {
        id: "decided",
        label: "Recently decided",
        empty: "No decisions in the last 30 days.",
    },
];

const ACTION_LABELS: Record<string, string> = {
    publish: "Published",
    request_changes: "Requested changes",
    reject: "Rejected",
    unpublish: "Unpublished",
};

function authorName(article: QueueArticle | DecidedQueueItem["article"]) {
    if (!article.author) return "Unknown author";
    return (
        `${article.author.first_name} ${article.author.last_name}`.trim() ||
        "Unknown author"
    );
}

function QueueRow({ article, tab }: { article: QueueArticle; tab: QueueTab }) {
    return (
        <Link
            href={`/dashboard/moderation/${article.id}`}
            className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-gray-800/50"
        >
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-white group-hover:text-blue-300">
                        {article.title}
                    </span>
                    <SourceBadge source={article.source} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-400">
                    <span>{authorName(article)}</span>
                    {article.category && <span>{article.category.name}</span>}
                    <span className="capitalize">{article.article_type}</span>
                </div>
                {tab === "changes_requested" && article.moderation_notes && (
                    <p className="mt-2 line-clamp-1 text-sm text-orange-300/80">
                        “{article.moderation_notes}”
                    </p>
                )}
            </div>
            <div className="hidden text-right text-sm sm:block">
                <div className="text-gray-300">
                    {timeAgo(article.waiting_since)}
                </div>
                <div className="text-xs text-gray-500">waiting since</div>
            </div>
            <ChevronRight className="h-4 w-4 text-gray-600 group-hover:text-gray-300" />
        </Link>
    );
}

function DecidedRow({ item }: { item: DecidedQueueItem }) {
    return (
        <Link
            href={`/dashboard/moderation/${item.article.id}`}
            className="group flex items-start gap-4 px-5 py-4 transition-colors hover:bg-gray-800/50"
        >
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-medium text-white group-hover:text-blue-300">
                        {item.article.title}
                    </span>
                    <StatusBadge status={item.new_status} />
                </div>
                <div className="mt-1 text-sm text-gray-400">
                    {ACTION_LABELS[item.action] ?? item.action} by{" "}
                    {item.actor?.name ?? "someone"}
                </div>
                {item.notes && (
                    <p className="mt-2 line-clamp-2 text-sm text-gray-400">
                        “{item.notes}”
                    </p>
                )}
            </div>
            <div className="shrink-0 text-sm text-gray-400">
                {timeAgo(item.created_at)}
            </div>
        </Link>
    );
}

function ModerationQueue() {
    const { user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const tab = (searchParams.get("tab") as QueueTab) || "pending";
    const page = Number(searchParams.get("page") || "1");
    const [data, setData] = useState<ModerationQueueResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const moderator = isModeratorUser(user);

    useEffect(() => {
        if (!moderator) return;
        let cancelled = false;
        setData(null);
        adminApi<ModerationQueueResponse>(
            `/api/wiki/moderation/queue?tab=${tab}&page=${page}&per_page=${PER_PAGE}`,
        )
            .then((result) => {
                if (cancelled) return;
                if (result.success) {
                    setData(result);
                    setError(null);
                } else {
                    setError(result.message || "Could not load the queue");
                }
            })
            .catch(() => !cancelled && setError("Could not load the queue"));
        return () => {
            cancelled = true;
        };
    }, [moderator, tab, page]);

    if (!moderator) return <AccessDenied what="The moderation queue" />;

    const setQuery = (next: { tab?: QueueTab; page?: number }) => {
        const params = new URLSearchParams();
        params.set("tab", next.tab ?? tab);
        if ((next.page ?? 1) > 1) params.set("page", String(next.page));
        router.push(`/dashboard/moderation?${params.toString()}`);
    };
    const current = TABS.find((t) => t.id === tab) ?? TABS[0];
    const totalPages = data ? Math.max(1, Math.ceil(data.total / PER_PAGE)) : 1;
    const firstWaiting =
        data && tab !== "decided" && data.items.length > 0
            ? (data.items[0] as QueueArticle)
            : null;

    return (
        <div>
            <PageHeader
                title="Moderation queue"
                description="Longest-waiting first. Open an article to read it in full and decide."
                actions={
                    firstWaiting && (
                        <Link
                            href={`/dashboard/moderation/${firstWaiting.id}`}
                            className={buttonClass("primary")}
                        >
                            Start reviewing
                        </Link>
                    )
                }
            />

            <div
                className="mb-5 flex gap-1 overflow-x-auto border-b border-gray-700/60"
                role="tablist"
            >
                {TABS.map((t) => {
                    const active = t.id === tab;
                    const count = data?.counts[t.id];
                    return (
                        <button
                            key={t.id}
                            role="tab"
                            aria-selected={active}
                            onClick={() => setQuery({ tab: t.id })}
                            className={`-mb-px flex items-center gap-2 border-b-2 px-4 py-2.5 text-sm whitespace-nowrap transition-colors ${
                                active
                                    ? "border-blue-500 text-white"
                                    : "border-transparent text-gray-400 hover:text-gray-200"
                            }`}
                        >
                            {t.id === "automation" && (
                                <Bot className="h-4 w-4" aria-hidden />
                            )}
                            {t.label}
                            {count !== undefined && (
                                <span
                                    className={`rounded-full px-2 py-0.5 text-xs ${
                                        count && t.id !== "decided"
                                            ? "bg-yellow-500/20 text-yellow-300"
                                            : "bg-gray-700/60 text-gray-400"
                                    }`}
                                >
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {error ? (
                <EmptyState title="Something went wrong" description={error} />
            ) : !data ? (
                <LoadingState />
            ) : data.items.length === 0 ? (
                <EmptyState
                    icon={
                        tab === "decided" ? (
                            <Inbox className="h-8 w-8" />
                        ) : (
                            <CircleCheckBig className="h-8 w-8" />
                        )
                    }
                    title={
                        tab === "decided" ? "No recent decisions" : "All clear"
                    }
                    description={current.empty}
                />
            ) : (
                <Card padded={false} className="divide-y divide-gray-700/60">
                    {tab === "decided"
                        ? (data.items as DecidedQueueItem[]).map((item) => (
                              <DecidedRow key={item.id} item={item} />
                          ))
                        : (data.items as QueueArticle[]).map((article) => (
                              <QueueRow
                                  key={article.id}
                                  article={article}
                                  tab={tab}
                              />
                          ))}
                </Card>
            )}

            {data && totalPages > 1 && (
                <div className="mt-5 flex items-center justify-between text-sm text-gray-400">
                    <span>
                        Page {page} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                        <button
                            className={buttonClass("secondary", "sm")}
                            disabled={page <= 1}
                            onClick={() => setQuery({ page: page - 1 })}
                        >
                            Previous
                        </button>
                        <button
                            className={buttonClass("secondary", "sm")}
                            disabled={page >= totalPages}
                            onClick={() => setQuery({ page: page + 1 })}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function ModerationPage() {
    return (
        <Suspense fallback={<LoadingState />}>
            <ModerationQueue />
        </Suspense>
    );
}
