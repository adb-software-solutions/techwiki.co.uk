"use client";

import { canEditArticle, useAuth } from "@/lib/auth";
import { SiteLink as Link } from "@/components/wiki/SiteLink";

interface ArticleActionsProps {
    articleId: string;
    authorId: string | null;
    className?: string;
}

/**
 * Edit/action buttons for articles.
 * Only shows when the user has permission to edit.
 */
export function ArticleActions({
    articleId,
    authorId,
    className = "",
}: ArticleActionsProps) {
    const { user, isAuthenticated, isLoading } = useAuth();

    // Don't render during loading or if not authenticated
    if (isLoading || !isAuthenticated || !user) {
        return null;
    }

    // Check if user can edit this article
    if (!canEditArticle(user, authorId)) {
        return null;
    }

    return (
        <div className={`flex items-center gap-2 ${className}`}>
            <Link
                href={`/edit/${articleId}`}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white transition-colors hover:bg-blue-500"
            >
                <svg
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                </svg>
                Edit
            </Link>
        </div>
    );
}

/**
 * Floating action button for article editing.
 * Fixed position in bottom-right corner.
 */
export function FloatingEditButton({
    articleId,
    authorId,
}: {
    articleId: string;
    authorId: string | null;
}) {
    const { user, isAuthenticated, isLoading } = useAuth();

    if (isLoading || !isAuthenticated || !user) {
        return null;
    }

    if (!canEditArticle(user, authorId)) {
        return null;
    }

    return (
        <Link
            href={`/edit/${articleId}`}
            className="fixed right-6 bottom-6 z-40 flex items-center gap-2 rounded-full bg-blue-600 px-4 py-3 text-white shadow-lg transition-all hover:bg-blue-500 hover:shadow-xl"
            title="Edit this article"
        >
            <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                />
            </svg>
            <span className="hidden sm:inline">Edit Article</span>
        </Link>
    );
}
