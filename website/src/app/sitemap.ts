import { getSitemapData } from "@/lib/wiki/api";
import type { MetadataRoute } from "next";

const BASE_URL = "https://techwiki.co.uk";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
    // Static discovery pages. Omit lastModified unless we have a meaningful
    // content-derived timestamp rather than claiming they changed on every hit.
    const staticPages: MetadataRoute.Sitemap = [
        {
            url: BASE_URL,
            changeFrequency: "daily",
            priority: 1.0,
        },
        {
            url: `${BASE_URL}/categories`,
            changeFrequency: "weekly",
            priority: 0.8,
        },
        {
            url: `${BASE_URL}/articles`,
            changeFrequency: "daily",
            priority: 0.8,
        },
        {
            url: `${BASE_URL}/authors`,
            changeFrequency: "weekly",
            priority: 0.6,
        },
    ];

    // Fetch dynamic wiki content
    try {
        const sitemapData = await getSitemapData();

        if (sitemapData.success) {
            const articlePages: MetadataRoute.Sitemap =
                sitemapData.articles.map((article) => ({
                    url: `${BASE_URL}${article.url}`,
                    lastModified: new Date(article.lastModified),
                    changeFrequency: article.changeFrequency as
                        | "daily"
                        | "weekly"
                        | "monthly",
                    priority: article.priority,
                }));

            const categoryPages: MetadataRoute.Sitemap =
                sitemapData.categories.map((category) => ({
                    url: `${BASE_URL}${category.url}`,
                    lastModified: new Date(category.lastModified),
                    changeFrequency: category.changeFrequency as
                        | "daily"
                        | "weekly"
                        | "monthly",
                    priority: category.priority,
                }));

            return [...staticPages, ...categoryPages, ...articlePages];
        }
    } catch {
        // The content API may be unavailable during a standalone frontend build.
        // Static routes still produce a valid sitemap in that case.
    }

    return staticPages;
}
