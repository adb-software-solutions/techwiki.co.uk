import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

/**
 * Middleware to handle legacy MediaWiki URL redirects
 * and other path transformations.
 */
export async function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    // Handle MediaWiki Category:Name URLs -> /category-slug
    if (pathname.startsWith("/Category:")) {
        const categoryName = pathname.slice(10); // Remove "/Category:"

        // Special case: Category:Contents -> /categories (contents page)
        if (categoryName === "Contents") {
            const url = request.nextUrl.clone();
            url.pathname = "/categories";
            return NextResponse.redirect(url, { status: 301 });
        }

        // Convert to slug format
        const slug = categoryName.replace(/_/g, "-").toLowerCase();

        const url = request.nextUrl.clone();
        url.pathname = `/${slug}`;
        return NextResponse.redirect(url, { status: 301 });
    }

    // Check if this path needs a redirect (for article URLs without categories)
    // This handles cases like /bacula-linux-ipv6-setup -> /linux/bacula-linux-ipv6-setup
    if (
        pathname.match(/^\/[a-z0-9-]+$/) &&
        !pathname.match(
            /^\/(categories|articles|search|blog|about|privacy|contribute|dashboard|new|edit|login|signup|backup|linux|windows|networking|databases|web-servers|cms|cloud|virtualization|general)$/,
        )
    ) {
        try {
            const response = await fetch(
                `${API_BASE}/api/wiki/redirects/resolve?path=${encodeURIComponent(pathname)}`,
                {
                    method: "GET",
                    headers: { Accept: "application/json" },
                },
            );

            if (response.ok) {
                const data = await response.json();
                if (data.redirect_to) {
                    const url = request.nextUrl.clone();
                    url.pathname = data.redirect_to;
                    return NextResponse.redirect(url, { status: 301 });
                }
            }
        } catch (error) {
            // Silently fail - let the request continue
            console.error("Redirect lookup failed:", error);
        }
    }

    // Handle MediaWiki-style URLs: /wiki/Page_Name -> /articles/page-name
    if (pathname.startsWith("/wiki/")) {
        const pageName = pathname.slice(6); // Remove "/wiki/"

        // Try to resolve via redirect API
        try {
            const response = await fetch(
                `${API_BASE}/api/wiki/redirects/resolve?path=${encodeURIComponent(pathname)}`,
                {
                    method: "GET",
                    headers: { Accept: "application/json" },
                },
            );

            if (response.ok) {
                const data = await response.json();
                if (data.redirect_to) {
                    const url = request.nextUrl.clone();
                    url.pathname = data.redirect_to;
                    return NextResponse.redirect(url, { status: 301 });
                }
            }
        } catch (error) {
            console.error("Redirect lookup failed:", error);
        }

        // Fallback: Convert MediaWiki page name format to slug
        const slug = pageName
            .replace(/_/g, "-") // Replace underscores with hyphens
            .toLowerCase();

        const url = request.nextUrl.clone();
        url.pathname = `/articles/${slug}`;

        return NextResponse.redirect(url, { status: 301 });
    }

    // Handle /index.php?title=Page_Name (MediaWiki query format)
    if (pathname === "/index.php") {
        const title = request.nextUrl.searchParams.get("title");
        if (title) {
            // Try redirect API first
            try {
                const lookupPath = `/index.php?title=${title}`;
                const response = await fetch(
                    `${API_BASE}/api/wiki/redirects/resolve?path=${encodeURIComponent(lookupPath)}`,
                    {
                        method: "GET",
                        headers: { Accept: "application/json" },
                    },
                );

                if (response.ok) {
                    const data = await response.json();
                    if (data.redirect_to) {
                        const url = request.nextUrl.clone();
                        url.pathname = data.redirect_to;
                        url.search = "";
                        return NextResponse.redirect(url, { status: 301 });
                    }
                }
            } catch (error) {
                console.error("Redirect lookup failed:", error);
            }

            // Fallback
            const slug = title.replace(/_/g, "-").toLowerCase();
            const url = request.nextUrl.clone();
            url.pathname = `/articles/${slug}`;
            url.search = ""; // Clear query params

            return NextResponse.redirect(url, { status: 301 });
        }
    }

    // Handle /w/index.php?title=Page_Name (another MediaWiki format)
    if (pathname === "/w/index.php") {
        const title = request.nextUrl.searchParams.get("title");
        if (title) {
            const slug = title.replace(/_/g, "-").toLowerCase();

            const url = request.nextUrl.clone();
            url.pathname = `/articles/${slug}`;
            url.search = "";

            return NextResponse.redirect(url, { status: 301 });
        }
    }

    // Handle direct MediaWiki-style article names (e.g., /Bacula_Disk_Extend)
    // These are typically capitalized with underscores
    // We need to check if this might be a MediaWiki page and redirect to /articles/slug
    if (pathname.match(/^\/[A-Z][^/]*$/) && pathname.includes("_")) {
        const pageName = pathname.slice(1); // Remove leading /
        const slug = pageName.replace(/_/g, "-").toLowerCase();

        const url = request.nextUrl.clone();
        url.pathname = `/articles/${slug}`;
        return NextResponse.redirect(url, { status: 301 });
    }

    return NextResponse.next();
}

export const config = {
    matcher: [
        // Match most paths except Next.js internals and static files
        "/((?!_next/static|_next/image|favicon.ico|api/).*)",
    ],
};
