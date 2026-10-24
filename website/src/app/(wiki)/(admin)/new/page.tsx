"use client";

import { adminApi } from "@/components/admin/api";
import {
    ArticleFormFields,
    EMPTY_ARTICLE,
    toPayload,
    useUnsavedChangesWarning,
    validate,
    type ArticleFormValues,
} from "@/components/admin/ArticleForm";
import {
    buttonClass,
    canPublishUser,
    PageHeader,
    useToast,
} from "@/components/admin/ui";
import { useAuth } from "@/lib/auth";
import type { Article } from "@/lib/wiki/types";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Intent = "draft" | "pending_review" | "published";

export default function NewArticlePage() {
    const { user } = useAuth();
    const router = useRouter();
    const toast = useToast();
    const [values, setValues] = useState<ArticleFormValues>(EMPTY_ARTICLE);
    const [busy, setBusy] = useState<Intent | null>(null);
    const canPublish = canPublishUser(user);
    const dirty = JSON.stringify(values) !== JSON.stringify(EMPTY_ARTICLE);
    useUnsavedChangesWarning(dirty && busy === null);

    const create = async (status: Intent) => {
        const problem = validate(values);
        if (problem) {
            toast(problem, "error");
            return;
        }
        setBusy(status);
        try {
            const result = await adminApi<{
                success: boolean;
                message?: string;
                article?: Article;
            }>("/api/wiki/articles", {
                method: "POST",
                body: { ...toPayload(values), status },
            });
            if (!result.success || !result.article) {
                toast(
                    result.message || "Could not create the article",
                    "error",
                );
                setBusy(null);
                return;
            }
            toast(result.message || "Article created");
            router.push(`/edit/${result.article.id}`);
        } catch {
            toast("Could not create the article", "error");
            setBusy(null);
        }
    };

    return (
        <div>
            <PageHeader
                title="New article"
                description={
                    canPublish
                        ? "Save it as a draft to keep working, or publish it straight away."
                        : "Save it as a draft, then submit it for review when it's ready."
                }
                actions={
                    <>
                        <button
                            type="button"
                            disabled={busy !== null}
                            onClick={() => create("draft")}
                            className={buttonClass("secondary")}
                        >
                            {busy === "draft" ? "Saving…" : "Save draft"}
                        </button>
                        {canPublish ? (
                            <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => create("published")}
                                className={buttonClass("success")}
                            >
                                {busy === "published"
                                    ? "Publishing…"
                                    : "Publish"}
                            </button>
                        ) : (
                            <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => create("pending_review")}
                                className={buttonClass("primary")}
                            >
                                {busy === "pending_review"
                                    ? "Submitting…"
                                    : "Submit for review"}
                            </button>
                        )}
                    </>
                }
            />
            <ArticleFormFields values={values} onChange={setValues} autoSlug />
        </div>
    );
}
