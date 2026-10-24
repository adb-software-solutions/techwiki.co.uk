import { ArticleCard } from "@/components/wiki/ArticleCard";
import { getArticles } from "@/lib/wiki/api";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Blog | TechWiki",
    description:
        "Tech blog posts, insights, and news from the TechWiki community",
};

// Revalidate every 60 seconds
export const revalidate = 60;

interface BlogPageProps {
    searchParams: Promise<{ page?: string }>;
}

export default async function BlogPage({ searchParams }: BlogPageProps) {
    const { page = "1" } = await searchParams;
    const currentPage = parseInt(page, 10);

    const articlesRes = await getArticles({
        article_type: "blog",
        page: currentPage,
        per_page: 12,
    }).catch(() => null);

    const articles = articlesRes?.success ? articlesRes.articles : [];
    const totalPages = articlesRes?.success ? articlesRes.total_pages : 0;
    const total = articlesRes?.success ? articlesRes.total : 0;

    return (
        <div>
            <div className="mb-8">
                <h1 className="mb-2 text-3xl font-bold text-white">Blog</h1>
                <p className="text-gray-400">
                    Insights, tutorials, and news from the TechWiki community
                </p>
                <div className="mt-2 text-sm text-gray-500">
                    {total} post{total !== 1 ? "s" : ""}
                </div>
            </div>

            {articles.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {articles.map((article) => (
                        <ArticleCard
                            key={article.id}
                            article={article}
                            variant="featured"
                        />
                    ))}
                </div>
            ) : (
                <div className="py-12 text-center">
                    <div className="mb-4 text-4xl">📝</div>
                    <p className="mb-4 text-gray-400">No blog posts yet</p>
                    <Link
                        href="/new"
                        className="inline-block rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700"
                    >
                        Write the first post
                    </Link>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                    <Link
                        href={`/blog?page=${currentPage - 1}`}
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
                        href={`/blog?page=${currentPage + 1}`}
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
