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
