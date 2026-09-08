import { ArticleCard } from "@/components/wiki/ArticleCard";
import { getArticles, getCategory } from "@/lib/wiki/api";
import type { ArticleSummary, Category } from "@/lib/wiki/types";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

const BASE_URL = "https://techwiki.co.uk";

interface CategoryPageProps {
    params: Promise<{ category: string }>;
    searchParams: Promise<{ page?: string; type?: string }>;
}

interface CategoryResponse {
    success: boolean;
    category?: Category;
}

function asCategoryResponse(value: unknown): CategoryResponse | null {
    if (!value || typeof value !== "object") return null;
    return value as CategoryResponse;
}

export async function generateMetadata({
    params,
}: CategoryPageProps): Promise<Metadata> {
    const { category: slug } = await params;
    const rawResponse = await getCategory(slug).catch(() => null);
    const response = asCategoryResponse(rawResponse);

    if (!response?.success || !response.category) {
        return { title: "Category Not Found | TechWiki" };
    }

    const category = response.category;
    const canonical = `${BASE_URL}/${category.full_path || category.slug}`;
    return {
        title: `${category.name} | TechWiki`,
        description:
            category.description ||
            `Browse ${category.name} documentation, tutorials, guides, and troubleshooting articles on TechWiki.`,
        alternates: { canonical },
    };
}

export const revalidate = 60;

function TopicSection({
    title,
    description,
    articles,
}: {
    title: string;
    description: string;
    articles: ArticleSummary[];
}) {
    if (articles.length === 0) return null;

    return (
        <section className="mb-10">
            <div className="mb-4">
                <h2 className="text-xl font-semibold text-white">{title}</h2>
                <p className="mt-1 text-sm text-gray-400">{description}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {articles.slice(0, 6).map((article) => (
                    <ArticleCard key={article.id} article={article} />
                ))}
            </div>
        </section>
    );
}

export default async function CategoryPage({
    params,
    searchParams,
}: CategoryPageProps) {
    const { category: slug } = await params;
    const { page = "1", type } = await searchParams;
    const currentPage = Math.max(parseInt(page, 10) || 1, 1);

    const [rawCategoryRes, articlesRes, hubArticlesRes] = await Promise.all([
        getCategory(slug).catch(() => null),
        getArticles({
            category: slug,
            article_type: type,
            page: currentPage,
            per_page: 12,
        }).catch(() => null),
        !type && currentPage === 1
            ? getArticles({ category: slug, page: 1, per_page: 100 }).catch(
                  () => null,
              )
            : Promise.resolve(null),
    ]);

    const categoryRes = asCategoryResponse(rawCategoryRes);
    if (!categoryRes?.success || !categoryRes.category) {
        notFound();
    }

    const category = categoryRes.category;
    const articles = articlesRes?.success ? articlesRes.articles : [];
    const totalPages = articlesRes?.success ? articlesRes.total_pages : 0;
    const total = articlesRes?.success ? articlesRes.total : 0;
    const hubArticles = hubArticlesRes?.success ? hubArticlesRes.articles : [];

    const featured = hubArticles.filter((article) => article.is_featured);
    const learn = hubArticles.filter((article) =>
        ["tutorial", "guide"].includes(article.article_type),
    );
    const reference = hubArticles.filter((article) =>
        ["documentation", "reference"].includes(article.article_type),
    );

    const categoryStructuredData = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "@id": `${BASE_URL}/${category.full_path || category.slug}#collection`,
        url: `${BASE_URL}/${category.full_path || category.slug}`,
        name: `${category.name} | TechWiki`,
        description:
            category.description ||
            `Technical documentation and guides about ${category.name}.`,
        isPartOf: { "@id": `${BASE_URL}/#website` },
    };

    return (
        <div>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(categoryStructuredData),
                }}
            />

            <header className="mb-8">
                <div className="mb-4 flex items-center gap-3">
                    {category.icon && (
                        <span className="text-4xl">{category.icon}</span>
                    )}
                    <div>
                        <h1 className="text-3xl font-bold text-white">
                            {category.name}
                        </h1>
                        {category.description && (
                            <p className="mt-1 max-w-3xl text-gray-400">
                                {category.description}
                            </p>
                        )}
                    </div>
                </div>
                <div className="text-sm text-gray-500">
                    {total} article{total !== 1 ? "s" : ""}
                </div>
            </header>

            {!type && currentPage === 1 && (
                <div className="mb-12 rounded-xl border border-gray-700/60 bg-gray-900/30 p-5 md:p-6">
                    <div className="mb-6">
                        <h2 className="text-2xl font-bold text-white">
                            {category.name} topic guide
                        </h2>
                        <p className="mt-2 text-gray-400">
                            Start with the key guides, then use the references and
                            troubleshooting material below as you need them.
                        </p>
                    </div>
                    <TopicSection
                        title="Start here"
                        description="Featured articles that provide the best entry points into this topic."
                        articles={featured}
                    />
                    <TopicSection
                        title="Learn and build"
                        description="Step-by-step tutorials and longer practical guides."
                        articles={learn}
                    />
                    <TopicSection
                        title="Documentation and reference"
                        description="Concise material to keep nearby while you work."
                        articles={reference}
                    />
                </div>
            )}

            <div className="mb-6 flex flex-wrap items-center gap-4">
                <span className="text-gray-400">Filter by type:</span>
                <div className="flex flex-wrap items-center gap-2">
                    {[
                        "",
                        "documentation",
                        "tutorial",
                        "blog",
                        "guide",
                        "reference",
                    ].map((articleType) => (
                        <Link
                            key={articleType}
                            href={`/${slug}${articleType ? `?type=${articleType}` : ""}`}
                            className={`rounded-lg px-3 py-1 text-sm transition-colors ${
                                (type || "") === articleType
                                    ? "bg-blue-600 text-white"
                                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                            }`}
                        >
                            {articleType
                                ? articleType.charAt(0).toUpperCase() +
                                  articleType.slice(1)
                                : "All"}
                        </Link>
                    ))}
                </div>
            </div>

            {articles.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                    {articles.map((article) => (
                        <ArticleCard key={article.id} article={article} />
                    ))}
                </div>
            ) : (
                <div className="py-12 text-center">
                    <p className="text-gray-400">
                        No articles in this category yet.
                    </p>
                </div>
            )}

            {totalPages > 1 && (
                <nav
                    aria-label={`${category.name} article pages`}
                    className="mt-8 flex items-center justify-center gap-2"
                >
                    <Link
                        href={`/${slug}?page=${currentPage - 1}${type ? `&type=${type}` : ""}`}
                        className={`rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white hover:bg-gray-700 ${
                            currentPage <= 1
                                ? "pointer-events-none opacity-50"
                                : ""
                        }`}
                    >
                        Previous
                    </Link>
                    <span className="text-gray-400">
                        Page {currentPage} of {totalPages}
                    </span>
                    <Link
                        href={`/${slug}?page=${currentPage + 1}${type ? `&type=${type}` : ""}`}
                        className={`rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white hover:bg-gray-700 ${
                            currentPage >= totalPages
                                ? "pointer-events-none opacity-50"
                                : ""
                        }`}
                    >
                        Next
                    </Link>
                </nav>
            )}
        </div>
    );
}
