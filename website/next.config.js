const path = require("node:path");

// The pnpm workspace's root: its node_modules holds the packages that
// website/node_modules links to.
const workspaceRoot = path.join(__dirname, "..");

/** @type {import('next').NextConfig} */

const nextConfig = {
    reactStrictMode: false,
    outputFileTracingRoot: workspaceRoot,
    turbopack: {
        root: workspaceRoot,
    },
    images: {
        // Widths /_next/image will resize to. Next's default list goes up
        // to 3840, and a crawler asking for every width at once makes sharp
        // hold hundreds of MB of native memory. Nothing on the site needs
        // an image wider than 1920, so larger widths only cost memory.
        deviceSizes: [640, 750, 828, 1080, 1200, 1920],
        // Next.js refuses to optimise images from private addresses, which
        // includes the API's media on localhost during development.
        dangerouslyAllowLocalIP: process.env.NODE_ENV === "development",
        remotePatterns: [
            {
                protocol: "https",
                hostname: "img.youtube.com",
                port: "",
                pathname: "/vi/**",
            },
            {
                protocol: "http",
                hostname: "localhost",
                port: "8000",
                pathname: "/media/**",
            },
            {
                protocol: "https",
                hostname: "api.techwiki.co.uk",
                port: "",
                pathname: "/media/**",
            },
        ],
    },
    async rewrites() {
        return [
            {
                source: "/:category/:slug.md",
                destination: "/api/content/v1/markdown/:category/:slug",
            },
            {
                source: "/:parent/:category/:slug.md",
                destination: "/api/content/v1/markdown/:parent/:category/:slug",
            },
        ];
    },
};

module.exports = nextConfig;
