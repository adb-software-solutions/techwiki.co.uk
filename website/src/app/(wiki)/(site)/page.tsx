import { ArticleCard } from "@/components/wiki/ArticleCard";
import { getArticles, getCategories } from "@/lib/wiki/api";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "TechWiki - Documentation & Tutorials for Developers",
    description:
        "Comprehensive documentation, tutorials, and guides for developers. Learn about programming, DevOps, and modern software development.",
};

// Revalidate every 60 seconds
export const revalidate = 60;

export default async function WikiHomePage() {
    // Fetch featured and recent articles
    const [featuredRes, recentRes, categoriesRes] = await Promise.all([
        getArticles({ featured: true, per_page: 3 }).catch(() => null),
        getArticles({ per_page: 6 }).catch(() => null),
        getCategories().catch(() => null),
    ]);

    const featuredArticles = featuredRes?.success ? featuredRes.articles : [];
    const recentArticles = recentRes?.success ? recentRes.articles : [];
    const categories = categoriesRes?.success ? categoriesRes.categories : [];

    return (
        <div>
            {/* Hero section */}
            <section className="py-12 text-center">
                <h1 className="mb-4 text-4xl font-bold text-white md:text-5xl">
                    Welcome to TechWiki
                </h1>
                <p className="mx-auto max-w-2xl text-xl text-gray-400">
                    Your comprehensive resource for documentation, tutorials,
                    and guides on programming, DevOps, and modern software
                    development.
                </p>
            </section>

            {/* Featured articles */}
            {featuredArticles.length > 0 && (
                <section className="mb-12">
                    <div className="mb-6 flex items-center justify-between">
                        <h2 className="text-2xl font-bold text-white">
                            Featured
                        </h2>
                    </div>
                    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {featuredArticles.map((article) => (
                            <ArticleCard
                                key={article.id}
                                article={article}
                                variant="featured"
                            />
                        ))}
                    </div>
                </section>
            )}

            {/* Categories grid */}
            {categories.length > 0 && (
                <section className="mb-12">
                    <div className="mb-6 flex items-center justify-between">
                        <h2 className="text-2xl font-bold text-white">
                            Browse by Category
                        </h2>
                        <Link
                            href="/categories"
                            className="text-blue-400 hover:text-blue-300"
                        >
                            View all
                        </Link>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                        {categories.slice(0, 8).map((category) => (
                            <Link
                                key={category.id}
                                href={`/${category.slug}`}
                                className="group rounded-xl border border-gray-700/50 bg-gray-800/50 p-4 transition-colors hover:border-gray-600 hover:bg-gray-800"
                            >
                                <div className="mb-2 flex items-center gap-3">
                                    {category.icon && (
                                        <span className="text-2xl">
                                            {category.icon}
                                        </span>
                                    )}
                                    <h3 className="font-semibold text-white transition-colors group-hover:text-blue-400">
                                        {category.name}
                                    </h3>
                                </div>
                                {category.description && (
                                    <p className="line-clamp-2 text-sm text-gray-400">
                                        {category.description}
                                    </p>
                                )}
                                <div className="mt-3 text-xs text-gray-500">
                                    {category.article_count} articles
                                </div>
                            </Link>
                        ))}
                    </div>
                </section>
            )}

            {/* Recent articles */}
            {recentArticles.length > 0 && (
                <section>
                    <div className="mb-6 flex items-center justify-between">
                        <h2 className="text-2xl font-bold text-white">
                            Recent Articles
                        </h2>
                        <Link
                            href="/articles"
                            className="text-blue-400 hover:text-blue-300"
                        >
                            View all
                        </Link>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                        {recentArticles.map((article) => (
                            <ArticleCard key={article.id} article={article} />
                        ))}
                    </div>
                </section>
            )}

            {/* Empty state */}
            {featuredArticles.length === 0 &&
                recentArticles.length === 0 &&
                categories.length === 0 && (
                    <div className="py-16 text-center">
                        <div className="mb-4 text-6xl">📝</div>
                        <h2 className="mb-2 text-2xl font-bold text-white">
                            No content yet
                        </h2>
                        <p className="mb-6 text-gray-400">
                            Be the first to contribute to TechWiki!
                        </p>
                        <Link
                            href="/new"
                            className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700"
                        >
                            Write an article
                        </Link>
                    </div>
                )}
        </div>
    );
}
