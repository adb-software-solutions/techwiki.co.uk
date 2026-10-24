import NextLink from "next/link";
import type { ComponentPropsWithoutRef } from "react";

type Props = ComponentPropsWithoutRef<"a"> & { href: string };

// AdSense Auto ads initialise once per document, so with client-side navigation
// the first page's ads would persist across the site. When AdSense is enabled,
// public links load a fresh document so each page gets its own ads, and moving
// between the public site and the ad-free admin area loads or drops the script.
export function SiteLink({ href, ...props }: Props) {
    if (process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID) {
        return <a href={href} {...props} />;
    }
    return <NextLink href={href} {...props} />;
}

/** Navigate programmatically across the public/admin boundary. */
export function navigateToSite(href: string, push: (href: string) => void) {
    if (process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID) {
        window.location.assign(href);
    } else {
        push(href);
    }
}
