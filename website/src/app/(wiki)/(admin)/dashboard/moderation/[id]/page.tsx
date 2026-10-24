"use client";

import { adminApi } from "@/components/admin/api";
import {
    AccessDenied,
    buttonClass,
    Card,
    EmptyState,
    inputClass,
    isModeratorUser,
    LoadingState,
    PageHeader,
    SourceBadge,
    StatusBadge,
    statusLabel,
    timeAgo,
    useToast,
} from "@/components/admin/ui";
import { MarkdownRenderer } from "@/components/wiki/MarkdownRenderer";
import { SiteLink } from "@/components/wiki/SiteLink";
import { useAuth } from "@/lib/auth";
import { moderateArticle } from "@/lib/wiki/api";
import type {
    ModerationArticleResponse,
    WorkflowAction,
} from "@/lib/wiki/types";
import { ArrowLeft, ExternalLink, History, SquarePen } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const DECISIONS: {
    action: WorkflowAction;
    label: string;
    variant: "success" | "secondary" | "danger";
    needsNotes?: boolean;
}[] = [
    { action: "publish", label: "Publish", variant: "success" },
    {
        action: "request_changes",
        label: "Request changes",
        variant: "secondary",
        needsNotes: true,
    },
    { action: "reject", label: "Reject", variant: "danger", needsNotes: true },
    { action: "unpublish", label: "Unpublish", variant: "secondary" },
    { action: "archive", label: "Archive", variant: "secondary" },
    { action: "restore", label: "Restore as draft", variant: "secondary" },
];

const TAB_LABELS: Record<string, string> = {
    pending: "Pending review",
    changes_requested: "Changes requested",
    automation: "Automation drafts",
};

const HISTORY_LABELS: Record<string, string> = {
    submit: "Submitted for review",
    withdraw: "Withdrawn by author",
    publish: "Published",
    request_changes: "Changes requested",
    reject: "Rejected",
    unpublish: "Unpublished",
    archive: "Archived",
    restore: "Restored as draft",
};

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex justify-between gap-4 py-1.5 text-sm">
            <dt className="text-gray-400">{label}</dt>
            <dd className="text-right text-gray-200">
                {value === "" || value == null ? "—" : value}
            </dd>
        </div>
    );
}

export default function ReviewArticlePage() {
    const { id } = useParams<{ id: string }>();
    const { user } = useAuth();
    const router = useRouter();
    const toast = useToast();
    const [data, setData] = useState<ModerationArticleResponse | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notes, setNotes] = useState("");
    const [busy, setBusy] = useState<WorkflowAction | null>(null);
    const moderator = isModeratorUser(user);

    const load = useCallback(async () => {
        const result = await adminApi<ModerationArticleResponse>(
            `/api/wiki/moderation/articles/${id}`,
        );
        if (result.success) {
            setData(result);
            setError(null);
        } else {
            setError(result.message || "Article not found");
        }
    }, [id]);

    useEffect(() => {
        if (moderator) load().catch(() => setError("Could not load article"));
    }, [moderator, load]);

    if (!moderator) return <AccessDenied what="Reviewing articles" />;
    if (error)
        return (
            <EmptyState
                title={error}
                action={
                    <Link
                        href="/dashboard/moderation"
                        className={buttonClass("secondary")}
                    >
                        Back to the queue
                    </Link>
                }
            />
        );
    if (!data) return <LoadingState />;

    const { article, history, queue, actions } = data;
    const decisions = DECISIONS.filter((d) => actions.includes(d.action));
    const backHref = `/dashboard/moderation${queue.tab ? `?tab=${queue.tab}` : ""}`;
    const author = article.author
        ? `${article.author.first_name} ${article.author.last_name}`.trim()
        : "Unknown author";

    const decide = async (action: WorkflowAction, needsNotes?: boolean) => {
        if (needsNotes && !notes.trim()) {
            toast("Add a note for the author first.", "error");
            return;
        }
        setBusy(action);
        try {
            const result = await moderateArticle(article.id, action, notes);
            if (!result.success) {
                toast(result.message, "error");
                return;
            }
            toast(`${article.title}: ${statusLabel(result.new_status)}`);
            setNotes("");
            if (queue.tab && result.next_article_id) {
                router.push(`/dashboard/moderation/${result.next_article_id}`);
            } else if (queue.tab) {
                router.push(backHref);
            } else {
                await load();
            }
        } finally {
            setBusy(null);
        }
    };

    return (
        <div>
            <PageHeader
                eyebrow={
                    <Link
                        href={backHref}
                        className="inline-flex items-center gap-1 hover:text-white"
                    >
                        <ArrowLeft className="h-3.5 w-3.5" />
                        {queue.tab ? TAB_LABELS[queue.tab] : "Moderation queue"}
                        {queue.position &&
                            ` · ${queue.position} of ${queue.total}`}
                    </Link>
                }
                title={article.title}
                description={
                    <span className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={article.status} />
                        <SourceBadge source={article.source} />
                        <span>
                            by {author} · updated {timeAgo(article.updated_at)}
                        </span>
                    </span>
                }
                actions={
                    <>
                        <Link
                            href={`/edit/${article.id}`}
                            className={buttonClass("secondary")}
                        >
                            <SquarePen className="h-4 w-4" />
                            Edit
                        </Link>
                        {article.status === "published" && (
                            <SiteLink
                                href={article.full_url}
                                className={buttonClass("secondary")}
                            >
                                <ExternalLink className="h-4 w-4" />
                                View live
                            </SiteLink>
                        )}
                    </>
                }
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0 space-y-6">
                    {article.moderation_notes &&
                        article.status === "changes_requested" && (
                            <Card className="border-orange-500/30 bg-orange-500/5">
                                <div className="text-sm font-medium text-orange-300">
                                    Changes requested
                                </div>
                                <p className="mt-1 text-sm whitespace-pre-line text-gray-300">
                                    {article.moderation_notes}
                                </p>
                            </Card>
                        )}
                    <Card className="p-6 lg:p-8">
                        {article.excerpt && (
                            <p className="mb-6 border-l-2 border-blue-500/60 pl-4 text-gray-300">
                                {article.excerpt}
                            </p>
                        )}
                        <MarkdownRenderer html={article.rendered_html} />
                    </Card>
                </div>

                <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
                    <Card>
                        <h2 className="mb-3 font-medium text-white">
                            Decision
                        </h2>
                        {decisions.length === 0 ? (
                            <p className="text-sm text-gray-400">
                                No actions are available for an article that is{" "}
                                {statusLabel(article.status).toLowerCase()}.
                            </p>
                        ) : (
                            <>
                                <label
                                    htmlFor="moderation-notes"
                                    className="mb-1 block text-sm text-gray-400"
                                >
                                    Note for the author
                                </label>
                                <textarea
                                    id="moderation-notes"
                                    rows={4}
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Required when requesting changes or rejecting"
                                    className={inputClass}
                                />
                                <div className="mt-4 grid gap-2">
                                    {decisions.map((d) => (
                                        <button
                                            key={d.action}
                                            type="button"
                                            disabled={busy !== null}
                                            onClick={() =>
                                                decide(d.action, d.needsNotes)
                                            }
                                            className={`${buttonClass(d.variant)} w-full`}
                                        >
                                            {busy === d.action
                                                ? "Working…"
                                                : d.label}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </Card>

                    <Card>
                        <h2 className="mb-2 font-medium text-white">Details</h2>
                        <dl className="divide-y divide-gray-700/40">
                            <Meta
                                label="Category"
                                value={article.category?.name}
                            />
                            <Meta
                                label="Type"
                                value={
                                    <span className="capitalize">
                                        {article.article_type}
                                    </span>
                                }
                            />
                            <Meta
                                label="Tags"
                                value={article.tags
                                    .map((tag) => tag.name)
                                    .join(", ")}
                            />
                            <Meta
                                label="Reading time"
                                value={`${article.reading_time} min`}
                            />
                            <Meta
                                label="Revisions"
                                value={data.revision_count}
                            />
                            <Meta
                                label="Created"
                                value={timeAgo(article.created_at)}
                            />
                            <Meta label="URL" value={article.full_url} />
                        </dl>
                        {article.meta_description && (
                            <div className="mt-3 rounded-lg bg-gray-800/60 p-3 text-sm text-gray-300">
                                <div className="mb-1 text-xs text-gray-500">
                                    Meta description
                                </div>
                                {article.meta_description}
                            </div>
                        )}
                    </Card>

                    <Card>
                        <h2 className="mb-3 flex items-center gap-2 font-medium text-white">
                            <History className="h-4 w-4 text-gray-400" />
                            History
                        </h2>
                        {history.length === 0 ? (
                            <p className="text-sm text-gray-400">
                                No status changes recorded yet.
                            </p>
                        ) : (
                            <ol className="space-y-4">
                                {history.map((entry) => (
                                    <li
                                        key={entry.id}
                                        className="border-l-2 border-gray-700 pl-3"
                                    >
                                        <div className="text-sm text-gray-200">
                                            {HISTORY_LABELS[entry.action] ??
                                                entry.action}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {entry.actor?.name ?? "Someone"} ·{" "}
                                            {timeAgo(entry.created_at)}
                                        </div>
                                        {entry.notes && (
                                            <p className="mt-1 text-sm whitespace-pre-line text-gray-400">
                                                {entry.notes}
                                            </p>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </Card>
                </aside>
            </div>
        </div>
    );
}
