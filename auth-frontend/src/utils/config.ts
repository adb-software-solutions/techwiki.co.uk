/**
 * Configuration for the TechWiki auth service.
 */

// Get the API URL from environment or default to localhost
export const API_URL =
    import.meta.env.VITE_API_URL || "https://api.techwiki.co.uk";

// Allowed redirect origins for security
const ALLOWED_REDIRECT_ORIGINS = [
    import.meta.env.VITE_APP_URL || "https://techwiki.co.uk",
    import.meta.env.VITE_ADMIN_URL || "https://admin.techwiki.co.uk",
    import.meta.env.VITE_DOCS_URL || "https://docs.techwiki.co.uk",
    import.meta.env.VITE_AUTH_URL || "https://auth.techwiki.co.uk",
    API_URL,
];

/**
 * Validate that a redirect URL is safe to redirect to.
 * Only allows redirects to known TechWiki subdomains.
 */
export function isValidRedirectUrl(url: string): boolean {
    if (!url) return false;

    try {
        const parsed = new URL(url);

        // Check if the origin matches any allowed origin
        return ALLOWED_REDIRECT_ORIGINS.some((allowed) => {
            try {
                const allowedParsed = new URL(allowed);
                return parsed.origin === allowedParsed.origin;
            } catch {
                return false;
            }
        });
    } catch {
        // If URL parsing fails, check if it's a relative path
        return url.startsWith("/");
    }
}

/**
 * Get the redirect URL from query params, with validation.
 */
export function getRedirectUrl(): string {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next");

    if (next && isValidRedirectUrl(next)) {
        return next;
    }

    // Default to main app
    return import.meta.env.VITE_APP_URL || "http://localhost:5173";
}

/**
 * Get the default app URL for redirects after auth.
 */
export function getDefaultAppUrl(): string {
    return import.meta.env.VITE_APP_URL || "http://localhost:5173";
}
