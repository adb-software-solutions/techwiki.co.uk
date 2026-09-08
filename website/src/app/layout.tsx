import type { Metadata } from "next";

import { GoogleAdSenseScript } from "@/lib/analytics/AdSense";
import { GoogleAnalytics } from "@/lib/analytics/GoogleAnalytics";
import "./globals.css";

const SITE_URL = "https://techwiki.co.uk";
const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

export const metadata: Metadata = {
    metadataBase: new URL(SITE_URL),
    applicationName: "TechWiki",
    title: {
        default: "TechWiki",
        template: "%s | TechWiki",
    },
    description:
        "Practical technical documentation, tutorials, troubleshooting guides, and references for developers and system administrators.",
    alternates: {
        canonical: SITE_URL,
        types: {
            "application/rss+xml": `${SITE_URL}/feed.xml`,
        },
    },
    openGraph: {
        type: "website",
        siteName: "TechWiki",
        url: SITE_URL,
        title: "TechWiki",
        description:
            "Practical technical documentation, tutorials, troubleshooting guides, and references for developers and system administrators.",
    },
    twitter: {
        card: "summary_large_image",
        title: "TechWiki",
        description:
            "Practical technical documentation, tutorials, troubleshooting guides, and references for developers and system administrators.",
    },
    other: ADSENSE_CLIENT_ID
        ? { "google-adsense-account": ADSENSE_CLIENT_ID }
        : undefined,
};

const websiteStructuredData = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${SITE_URL}/#website`,
    url: SITE_URL,
    name: "TechWiki",
    description:
        "Practical technical documentation, tutorials, troubleshooting guides, and references for developers and system administrators.",
    publisher: { "@id": `${SITE_URL}/#organization` },
    potentialAction: {
        "@type": "SearchAction",
        target: `${SITE_URL}/search?q={search_term_string}`,
        "query-input": "required name=search_term_string",
    },
};

const organizationStructuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${SITE_URL}/#organization`,
    name: "TechWiki",
    url: SITE_URL,
};

export default async function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en-GB" className="h-full" suppressHydrationWarning>
            <head>
                <link
                    rel="icon"
                    type="image/png"
                    href="/favicon-96x96.png"
                    sizes="96x96"
                />
                <link rel="shortcut icon" href="/favicon.ico" />
                <link
                    rel="apple-touch-icon"
                    sizes="180x180"
                    href="/apple-touch-icon.png"
                />
                <meta name="apple-mobile-web-app-title" content="Tech Wiki" />
                <link rel="manifest" href="/site.webmanifest" />
                <meta
                    httpEquiv="Permissions-Policy"
                    content="picture-in-picture '*'"
                />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify(websiteStructuredData),
                    }}
                />
                <script
                    type="application/ld+json"
                    dangerouslySetInnerHTML={{
                        __html: JSON.stringify(organizationStructuredData),
                    }}
                />
            </head>
            <body className="h-full bg-[#1c324a] text-gray-200">
                <GoogleAnalytics />
                <GoogleAdSenseScript />
                {children}
            </body>
        </html>
    );
}
