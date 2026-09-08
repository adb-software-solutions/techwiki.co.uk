import type { ArticleSummary } from "@/lib/wiki/types";
import Link from "next/link";

export function RelatedArticles({
    articles,
}: {
    articles: ArticleSummary[];
}) {
    if (articles.length === 0) return null;

    return (
        <aside className="mx-auto mt-10 max-w-4xl border-t border-gray-700 pt-8">
            <h2 className="text-xl font-semibold text-white">Related articles</h2>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
                {articles.map((article) => {
                    const category =
                        article.category?.full_path ||
                        article.category?.slug ||
                        "articles";
                    return (
                        <Link
                            key={article.id}
                            href={`/${category}/${article.slug}`}
                            className="rounded-lg border border-gray-700 bg-gray-800/40 p-4 transition hover:border-blue-500/50 hover:bg-gray-800"
                        >
                            <h3 className="font-medium text-white">
                                {article.title}
                            </h3>
                            {article.excerpt && (
                                <p className="mt-1 line-clamp-2 text-sm text-gray-400">
                                    {article.excerpt}
                                </p>
                            )}
                        </Link>
                    );
                })}
            </div>
        </aside>
    );
}
