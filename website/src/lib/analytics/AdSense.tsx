"use client";

import Script from "next/script";

const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

/**
 * Google AdSense initialization script for Auto Ads.
 * Include this once in the root layout.
 */
export function GoogleAdSenseScript() {
    if (!ADSENSE_CLIENT_ID) {
        return null;
    }

    return (
        <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
        />
    );
}
