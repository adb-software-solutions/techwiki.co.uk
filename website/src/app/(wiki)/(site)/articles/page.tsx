import { ArticleCard } from "@/components/wiki/ArticleCard";
import { getArticles } from "@/lib/wiki/api";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "All Articles | TechWiki",
    description: "Browse all documentation, tutorials, and guides on TechWiki",
};

// Revalidate every 60 seconds
export const revalidate = 60;

interface ArticlesPageProps {
    searchParams: Promise<{ page?: string; type?: string }>;
}

export default async function ArticlesPage({
    searchParams,
}: ArticlesPageProps) {
    const { page = "1", type } = await searchParams;
    const currentPage = parseInt(page, 10);

    const articlesRes = await getArticles({
        article_type: type,
        page: currentPage,
        per_page: 12,
    }).catch(() => null);

    const articles = articlesRes?.success ? articlesRes.articles : [];
    const totalPages = articlesRes?.success ? articlesRes.total_pages : 0;
    const total = articlesRes?.success ? articlesRes.total : 0;

    return (
        <div>
            <div className="mb-8">
                <h1 className="mb-2 text-3xl font-bold text-white">
                    All Articles
                </h1>
                <p className="text-gray-400">
                    Browse all documentation, tutorials, and guides
                </p>
                <div className="mt-2 text-sm text-gray-500">
                    {total} article{total !== 1 ? "s" : ""}
                </div>
            </div>

            {/* Filter bar */}
            <div className="mb-6 flex items-center gap-4">
                <span className="text-gray-400">Filter by type:</span>
                <div className="flex items-center gap-2">
                    {[
                        "",
                        "documentation",
                        "tutorial",
                        "blog",
                        "guide",
                        "reference",
                    ].map((t) => (
                        <Link
                            key={t}
                            href={`/articles${t ? `?type=${t}` : ""}`}
                            className={`rounded-lg px-3 py-1 text-sm transition-colors ${
                                (type || "") === t
                                    ? "bg-blue-600 text-white"
                                    : "bg-gray-800 text-gray-300 hover:bg-gray-700"
                            }`}
                        >
                            {t ? t.charAt(0).toUpperCase() + t.slice(1) : "All"}
                        </Link>
                    ))}
                </div>
            </div>

            {/* Articles grid */}
            {articles.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {articles.map((article) => (
                        <ArticleCard key={article.id} article={article} />
                    ))}
                </div>
            ) : (
                <div className="py-12 text-center">
                    <div className="mb-4 text-4xl">📄</div>
                    <p className="mb-4 text-gray-400">No articles yet</p>
                    <Link
                        href="/new"
                        className="inline-block rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
                    >
                        Write the first article
                    </Link>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                    <Link
                        href={`/articles?page=${currentPage - 1}${type ? `&type=${type}` : ""}`}
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
                        href={`/articles?page=${currentPage + 1}${type ? `&type=${type}` : ""}`}
                        className={`rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white hover:bg-gray-700 ${
                            currentPage >= totalPages
                                ? "pointer-events-none opacity-50"
                                : ""
                        }`}
                    >
                        Next
                    </Link>
                </div>
            )}
        </div>
    );
}
