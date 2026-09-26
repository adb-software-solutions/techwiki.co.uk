"use client";

import { EzoicAd, EzoicProvider } from "@ezoic/react-sdk";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { EZOIC_ENABLED } from "./ezoic-config";

export function EzoicAdsProvider({ children }: { children: ReactNode }) {
    if (!EZOIC_ENABLED) return <>{children}</>;

    // The SDK loads Gatekeeper consent before the ad bundle and enables SPA mode.
    return <EzoicProvider>{children}</EzoicProvider>;
}

export function ArticleAd({
    location,
}: {
    location: "top_of_page" | "bottom_of_page";
}) {
    const pathname = usePathname();

    if (!EZOIC_ENABLED) return null;

    return (
        <aside aria-label="Advertisement" className="my-8">
            <p className="mb-2 text-center text-xs text-gray-400">
                Advertisement
            </p>
            {/* Remount on navigation so the SDK destroys the old placement and
                requests the new one. A second route hook would duplicate this. */}
            <EzoicAd key={`${pathname}:${location}`} location={location} />
        </aside>
    );
}
