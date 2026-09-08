import { getArticleByPath } from "@/lib/wiki/api";
import type { Metadata } from "next";

const BASE_URL = "https://techwiki.co.uk";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ArticleLayoutProps {
    children: React.ReactNode;
    params: Promise<{ category: string; slug: string }>;
}

interface CompatibilityRecord {
    id: string;
    technology: string;
    version: string;
    environment: string;
    status: "verified" | "partial" | "known_issue";
    notes: string;
    verified_at: string;
}

async function getCompatibility(path: string): Promise<CompatibilityRecord[]> {
    try {
        const response = await fetch(
            `${API_BASE}/api/wiki/compatibility/by-path/${path}`,
            { next: { revalidate: 60 } },
        );
        if (!response.ok) return [];
        const data = (await response.json()) as {
            success: boolean;
            records?: CompatibilityRecord[];
        };
        return data.success ? data.records || [] : [];
    } catch {
        return [];
    }
}

export async function generateMetadata({
    params,
}: ArticleLayoutProps): Promise<Metadata> {
    const { category, slug } = await params;
    const response = await getArticleByPath(`${category}/${slug}`).catch(
        () => null,
    );

    if (!response?.success || !response.article) return {};

    const article = response.article;
    const canonical = `${BASE_URL}${article.full_url}`;

    return {
        alternates: {
            canonical,
            types: {
                "text/markdown": `${canonical}.md`,
            },
        },
        twitter: {
            card: article.featured_image_url
                ? "summary_large_image"
                : "summary",
            title: article.meta_title || article.title,
            description: article.meta_description || article.excerpt,
            images: article.featured_image_url
                ? [article.featured_image_url]
                : undefined,
        },
    };
}

export default async function ArticleLayout({
    children,
    params,
}: ArticleLayoutProps) {
    const { category, slug } = await params;
    const articlePath = `${category}/${slug}`;
    const [response, compatibility] = await Promise.all([
        getArticleByPath(articlePath).catch(() => null),
        getCompatibility(articlePath),
    ]);

    if (!response?.success || !response.article) return children;

    const article = response.article;
    const canonical = `${BASE_URL}${article.full_url}`;
    const authorName = article.author
        ? `${article.author.first_name} ${article.author.last_name}`.trim()
        : "TechWiki";
    const authorUrl = article.author
        ? `${BASE_URL}/authors/${article.author.id}`
        : BASE_URL;
    const categoryName = article.category?.name || "Articles";
    const categoryUrl = article.category
        ? `${BASE_URL}/${article.category.full_path || article.category.slug}`
        : `${BASE_URL}/articles`;

    const articleStructuredData = {
        "@context": "https://schema.org",
        "@type": "TechArticle",
        "@id": `${canonical}#article`,
        mainEntityOfPage: canonical,
        url: canonical,
        headline: article.title,
        description: article.meta_description || article.excerpt,
        articleSection: categoryName,
        keywords: article.tags.map((tag) => tag.name).join(", "),
        datePublished: article.published_at || article.created_at,
        dateModified: article.updated_at,
        author: {
            "@type": "Person",
            name: authorName,
            url: authorUrl,
        },
        publisher: {
            "@id": `${BASE_URL}/#organization`,
        },
        image: article.featured_image_url || undefined,
        about: compatibility.map((record) => ({
            "@type": "Thing",
            name: [record.technology, record.version].filter(Boolean).join(" "),
            description: record.environment || record.notes || undefined,
        })),
    };

    const breadcrumbStructuredData = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        itemListElement: [
            {
                "@type": "ListItem",
                position: 1,
                name: "Home",
                item: BASE_URL,
            },
            {
                "@type": "ListItem",
                position: 2,
                name: categoryName,
                item: categoryUrl,
            },
            {
                "@type": "ListItem",
                position: 3,
                name: article.title,
                item: canonical,
            },
        ],
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(articleStructuredData),
                }}
            />
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(breadcrumbStructuredData),
                }}
            />
            {compatibility.length > 0 && (
                <aside className="mx-auto mb-6 max-w-4xl rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-4">
                    <h2 className="text-sm font-semibold tracking-wide text-emerald-300 uppercase">
                        Tested with
                    </h2>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {compatibility.map((record) => (
                            <span
                                key={record.id}
                                title={record.notes || record.environment}
                                className="rounded-md border border-gray-700 bg-gray-900/70 px-2.5 py-1 text-sm text-gray-300"
                            >
                                {record.technology}
                                {record.version ? ` ${record.version}` : ""}
                                {record.environment
                                    ? ` · ${record.environment}`
                                    : ""}
                                {` · verified ${new Date(record.verified_at).toLocaleDateString("en-GB")}`}
                            </span>
                        ))}
                    </div>
                </aside>
            )}
            {children}
        </>
    );
}
