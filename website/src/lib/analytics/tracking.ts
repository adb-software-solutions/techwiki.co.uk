"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// Generate or retrieve session ID
function getSessionId(): string {
    if (typeof window === "undefined") return "";

    try {
        let sessionId = sessionStorage.getItem("tw_session_id");
        if (!sessionId) {
            sessionId = `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
            sessionStorage.setItem("tw_session_id", sessionId);
        }
        return sessionId;
    } catch {
        return "";
    }
}

// Track an event to our internal analytics
async function trackEvent<T = unknown>(
    endpoint: string,
    data: Record<string, unknown>,
    keepalive = false,
): Promise<T | null> {
    const sessionId = getSessionId();
    if (!sessionId) return null;
    try {
        const response = await fetch(
            `${API_BASE}/api/analytics/track/${endpoint}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                // Lets the request finish while the page is being left.
                keepalive,
                body: JSON.stringify({ ...data, session_id: sessionId }),
            },
        );
        return response.ok ? ((await response.json()) as T) : null;
    } catch {
        // Analytics should never break the app
        return null;
    }
}

function scrollDepth(): number {
    const scrollable =
        document.documentElement.scrollHeight - window.innerHeight;
    if (scrollable <= 0) return 100;
    return Math.min(100, Math.round((window.scrollY / scrollable) * 100));
}

/**
 * Records a page view for each public page and reports visible time and
 * scroll depth when the visitor leaves or hides it. The API works out from
 * the path whether the page is an article.
 */
export function SiteAnalytics() {
    const pathname = usePathname();

    useEffect(() => {
        let pageViewId: string | null = null;
        let visibleMs = 0;
        let visibleSince: number | null =
            document.visibilityState === "visible" ? Date.now() : null;
        let maxScroll = scrollDepth();

        const viewRequest = trackEvent<{ id: string | null }>("pageview", {
            path: pathname,
            full_url: window.location.href,
            referrer: document.referrer || null,
        }).then((result) => {
            pageViewId = result?.id ?? null;
        });

        const sendEngagement = () => {
            if (visibleSince !== null) {
                visibleMs += Date.now() - visibleSince;
                visibleSince = null;
            }
            if (!pageViewId) return;
            trackEvent(
                "engagement",
                {
                    page_view_id: pageViewId,
                    seconds: Math.round(visibleMs / 1000),
                    scroll_depth: maxScroll,
                },
                true,
            );
        };
        const onScroll = () => {
            maxScroll = Math.max(maxScroll, scrollDepth());
        };
        const onVisibility = () => {
            if (document.visibilityState === "hidden") {
                sendEngagement();
            } else {
                visibleSince = Date.now();
            }
        };

        window.addEventListener("scroll", onScroll, { passive: true });
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("pagehide", sendEngagement);
        return () => {
            window.removeEventListener("scroll", onScroll);
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("pagehide", sendEngagement);
            // Client-side navigation to another page.
            viewRequest.then(sendEngagement);
        };
    }, [pathname]);

    return null;
}

/**
 * Track search events. Resolves to the search's ID, for trackSearchClick.
 */
export async function trackSearch(
    query: string,
    resultsCount: number,
    filters?: { category?: string; type?: string },
): Promise<string | null> {
    const result = await trackEvent<{ id: string }>("search", {
        query,
        results_count: resultsCount,
        category_filter: filters?.category || null,
        type_filter: filters?.type || null,
    });
    return result?.id || null;
}

/** Record which result a search led to; sent as the visitor navigates away. */
export function trackSearchClick(
    searchId: string,
    articleId: string,
    position: number,
) {
    return trackEvent(
        "search-click",
        { search_id: searchId, article_id: articleId, position },
        true,
    );
}

/**
 * Track custom events
 */
export function trackCustomEvent(
    eventType: string,
    eventAction: string,
    options?: {
        category?: string;
        label?: string;
        value?: number;
        pagePath?: string;
        articleId?: string;
        metadata?: Record<string, unknown>;
    },
) {
    return trackEvent("event", {
        event_type: eventType,
        event_action: eventAction,
        event_category: options?.category,
        event_label: options?.label,
        event_value: options?.value,
        page_path:
            options?.pagePath ||
            (typeof window !== "undefined" ? window.location.pathname : ""),
        article_id: options?.articleId,
        metadata: options?.metadata,
    });
}

/**
 * Pre-built event trackers for common actions
 */
export const internalAnalytics = {
    // Article interactions
    articleCopyLink: (articleId: string) =>
        trackCustomEvent("article_action", "copy_link", { articleId }),

    articleSuggestEdit: (articleId: string) =>
        trackCustomEvent("article_action", "suggest_edit", { articleId }),

    articleEdit: (articleId: string) =>
        trackCustomEvent("article_action", "edit", { articleId }),

    articleShare: (articleId: string, platform: string) =>
        trackCustomEvent("article_action", "share", {
            articleId,
            metadata: { platform },
        }),

    // Navigation
    categoryClick: (categorySlug: string) =>
        trackCustomEvent("navigation", "category_click", {
            metadata: { category: categorySlug },
        }),

    tagClick: (tagSlug: string) =>
        trackCustomEvent("navigation", "tag_click", {
            metadata: { tag: tagSlug },
        }),

    // Auth
    loginClick: () => trackCustomEvent("auth", "login_click"),
    signupClick: () => trackCustomEvent("auth", "signup_click"),
    logoutClick: () => trackCustomEvent("auth", "logout_click"),

    // Content creation
    newArticleStart: () => trackCustomEvent("content", "new_article_start"),
    articleSave: (articleId: string, isDraft: boolean) =>
        trackCustomEvent("content", isDraft ? "save_draft" : "save_publish", {
            articleId,
        }),

    // External links
    externalLinkClick: (url: string) =>
        trackCustomEvent("link", "external_click", {
            metadata: { url },
        }),

    // Errors
    error: (errorType: string, errorMessage: string) =>
        trackCustomEvent("error", errorType, {
            label: errorMessage,
        }),
};

export default internalAnalytics;
