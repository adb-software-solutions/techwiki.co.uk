import { getArticleByPath } from "@/lib/wiki/api";
import type { Metadata } from "next";

const BASE_URL = "https://techwiki.co.uk";

interface ArticleLayoutProps {
    children: React.ReactNode;
    params: Promise<{ category: string; slug: string }>;
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
    const response = await getArticleByPath(`${category}/${slug}`).catch(
        () => null,
    );

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
            {children}
        </>
    );
}
