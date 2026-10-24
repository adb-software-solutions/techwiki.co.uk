"use client";

import { adminApi } from "@/components/admin/api";
import {
    ArticleFormFields,
    toPayload,
    useUnsavedChangesWarning,
    validate,
    valuesFromArticle,
    type ArticleFormValues,
} from "@/components/admin/ArticleForm";
import {
    buttonClass,
    Card,
    EmptyState,
    LoadingState,
    SourceBadge,
    StatusBadge,
    timeAgo,
    useToast,
} from "@/components/admin/ui";
import { SiteLink } from "@/components/wiki/SiteLink";
import { canEditArticle, useAuth } from "@/lib/auth";
import type { Article, WorkflowAction } from "@/lib/wiki/types";
import { ArrowLeft, ExternalLink } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

interface ArticleWithActions {
    success: boolean;
    message?: string;
    article: Article;
    actions: WorkflowAction[];
}

// Status the editor sends with a save to perform each workflow action.
const ACTION_STATUS: Partial<Record<WorkflowAction, string>> = {
    publish: "published",
    submit: "pending_review",
    withdraw: "draft",
    unpublish: "draft",
    restore: "draft",
};

const ACTION_LABELS: Partial<Record<WorkflowAction, string>> = {
    publish: "Publish",
    submit: "Submit for review",
    withdraw: "Withdraw from review",
    unpublish: "Unpublish",
    restore: "Restore as draft",
    archive: "Archive",
};

const PRIMARY_ACTIONS: WorkflowAction[] = ["publish", "submit", "restore"];

export default function EditArticlePage() {
    const { id } = useParams<{ id: string }>();
    const router = useRouter();
    const toast = useToast();
    const { user } = useAuth();
    const [article, setArticle] = useState<Article | null>(null);
    const [actions, setActions] = useState<WorkflowAction[]>([]);
    const [values, setValues] = useState<ArticleFormValues | null>(null);
    const [saved, setSaved] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);

    const load = useCallback(async () => {
        const data = await adminApi<ArticleWithActions>(
            `/api/wiki/articles/${id}`,
        );
        if (!data.success) {
            setError(data.message || "Article not found");
            return;
        }
        const formValues = valuesFromArticle(data.article);
        setArticle(data.article);
        setActions(data.actions ?? []);
        setValues(formValues);
        setSaved(JSON.stringify(formValues));
    }, [id]);

    useEffect(() => {
        load().catch(() => setError("Could not load the article"));
    }, [load]);

    const dirty = values !== null && JSON.stringify(values) !== saved;
    useUnsavedChangesWarning(dirty);

    const save = useCallback(
        async (action?: WorkflowAction) => {
            if (!values) return;
            const problem = validate(values);
            if (problem) {
                toast(problem, "error");
                return;
            }
            setBusy(action ?? "save");
            try {
                const status = action ? ACTION_STATUS[action] : undefined;
                const result = await adminApi<{
                    success: boolean;
                    message?: string;
                }>(`/api/wiki/articles/${id}`, {
                    method: "PUT",
                    body: { ...toPayload(values), ...(status && { status }) },
                });
                if (!result.success) {
                    toast(result.message || "Could not save", "error");
                    return;
                }
                await load();
                toast(
                    action ? `${ACTION_LABELS[action]}: done` : "Changes saved",
                );
            } finally {
                setBusy(null);
            }
        },
        [values, id, load, toast],
    );

    const archive = async () => {
        if (!confirm("Archive this article? It will be hidden from the site."))
            return;
        setBusy("archive");
        const result = await adminApi<{ success: boolean; message?: string }>(
            `/api/wiki/articles/${id}`,
            { method: "DELETE" },
        );
        setBusy(null);
        if (result.success) {
            toast("Article archived");
            router.push("/dashboard/articles");
        } else {
            toast(result.message || "Could not archive", "error");
        }
    };

    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "s") {
                event.preventDefault();
                if (!busy) save();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [save, busy]);

    if (error)
        return (
            <EmptyState
                title={error}
                action={
                    <Link
                        href="/dashboard/articles"
                        className={buttonClass("secondary")}
                    >
                        Back to my articles
                    </Link>
                }
            />
        );
    if (!article || !values) return <LoadingState />;
    if (!canEditArticle(user, article.author?.id ?? null))
        return (
            <EmptyState
                title="You can't edit this article"
                description="Only its author, moderators and administrators can edit it."
            />
        );

    const primary = PRIMARY_ACTIONS.find((a) => actions.includes(a));
    const secondary = actions.filter(
        (a) => a !== primary && a in ACTION_LABELS && a !== "archive",
    );
    const published = article.status === "published";

    return (
        <div>
            <div className="sticky top-16 z-20 -mx-4 mb-6 border-b border-gray-700/60 bg-[#16283b]/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10">
                <div className="flex flex-wrap items-center gap-3">
                    <Link
                        href="/dashboard/articles"
                        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-800 hover:text-white"
                        aria-label="Back to my articles"
                    >
                        <ArrowLeft className="h-4 w-4" />
                    </Link>
                    <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-white">
                            {values.title || "Untitled"}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                            <StatusBadge status={article.status} />
                            <SourceBadge source={article.source} />
                            {dirty ? (
                                <span className="text-yellow-300">
                                    Unsaved changes
                                </span>
                            ) : (
                                <span>Saved {timeAgo(article.updated_at)}</span>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {published && (
                            <SiteLink
                                href={article.full_url}
                                className={buttonClass("ghost", "sm")}
                            >
                                <ExternalLink className="h-4 w-4" />
                                View live
                            </SiteLink>
                        )}
                        {secondary.map((action) => (
                            <button
                                key={action}
                                type="button"
                                disabled={busy !== null}
                                onClick={() => save(action)}
                                className={buttonClass("ghost", "sm")}
                            >
                                {busy === action
                                    ? "Working…"
                                    : ACTION_LABELS[action]}
                            </button>
                        ))}
                        {actions.includes("archive") && (
                            <button
                                type="button"
                                disabled={busy !== null}
                                onClick={archive}
                                className={`${buttonClass("ghost", "sm")} text-red-300 hover:text-red-200`}
                            >
                                Archive
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={busy !== null || !dirty}
                            onClick={() => save()}
                            className={buttonClass(
                                primary ? "secondary" : "primary",
                                "sm",
                            )}
                            title="Save (Ctrl/⌘+S)"
                        >
                            {busy === "save"
                                ? "Saving…"
                                : published
                                  ? "Update live article"
                                  : "Save"}
                        </button>
                        {primary && (
                            <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => save(primary)}
                                className={buttonClass(
                                    primary === "publish"
                                        ? "success"
                                        : "primary",
                                    "sm",
                                )}
                            >
                                {busy === primary
                                    ? "Working…"
                                    : ACTION_LABELS[primary]}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            <ArticleFormFields
                values={values}
                onChange={setValues}
                sidebarTop={
                    article.moderation_notes &&
                    (article.status === "changes_requested" ||
                        article.status === "draft") ? (
                        <Card className="border-orange-500/30 bg-orange-500/5">
                            <div className="text-sm font-medium text-orange-300">
                                Reviewer feedback
                            </div>
                            <p className="mt-1 text-sm whitespace-pre-line text-gray-300">
                                {article.moderation_notes}
                            </p>
                        </Card>
                    ) : null
                }
            />
        </div>
    );
}
