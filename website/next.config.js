/** @type {import('next').NextConfig} */

const nextConfig = {
    reactStrictMode: false,
    outputFileTracingRoot: __dirname,
    images: {
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
                destination:
                    "/api/content/v1/markdown?path=:category/:slug",
            },
            {
                source: "/:parent/:category/:slug.md",
                destination:
                    "/api/content/v1/markdown?path=:parent/:category/:slug",
            },
        ];
    },
};

module.exports = nextConfig;
