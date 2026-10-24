"use client";

import type { ArticleSummary } from "@/lib/wiki/types";
import Image from "next/image";
import { SiteLink as Link } from "@/components/wiki/SiteLink";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const getPhotoUrl = (photo: string | null | undefined): string | null => {
    if (!photo) return null;
    if (photo.startsWith("http")) return photo;
    return `${API_BASE}${photo}`;
};

interface ArticleCardProps {
    article: ArticleSummary;
    variant?: "default" | "featured" | "compact";
}

const ARTICLE_TYPE_COLORS: Record<string, string> = {
    documentation: "bg-blue-500/20 text-blue-400",
    tutorial: "bg-green-500/20 text-green-400",
    blog: "bg-purple-500/20 text-purple-400",
    guide: "bg-orange-500/20 text-orange-400",
    reference: "bg-gray-500/20 text-gray-400",
};

const ARTICLE_TYPE_LABELS: Record<string, string> = {
    documentation: "Documentation",
    tutorial: "Tutorial",
    blog: "Blog",
    guide: "Guide",
    reference: "Reference",
};

export function ArticleCard({
    article,
    variant = "default",
}: ArticleCardProps) {
    const href = article.category
        ? `/${article.category.slug}/${article.slug}`
        : `/articles/${article.slug}`;

    const authorName = article.author
        ? `${article.author.first_name} ${article.author.last_name}`.trim()
        : "Anonymous";

    const publishedDate = article.published_at
        ? new Date(article.published_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "short",
              year: "numeric",
          })
        : null;

    if (variant === "compact") {
        return (
            <Link
                href={href}
                className="flex items-center gap-4 rounded-lg p-3 transition-colors hover:bg-gray-800/50"
            >
                <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-medium text-white">
                        {article.title}
                    </h3>
                    <div className="mt-1 flex items-center gap-2 text-xs text-gray-400">
                        {article.category && (
                            <span>{article.category.name}</span>
                        )}
                        {publishedDate && <span>• {publishedDate}</span>}
                    </div>
                </div>
                <span className="text-xs text-gray-500">
                    {article.reading_time} min
                </span>
            </Link>
        );
    }

    if (variant === "featured") {
        return (
            <article className="group relative block overflow-hidden rounded-xl bg-gradient-to-br from-gray-800 to-gray-900 transition-colors hover:from-gray-700 hover:to-gray-800">
                <Link
                    href={href}
                    aria-label={`Read ${article.title}`}
                    className="absolute inset-0 z-10 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
                />
                {article.featured_image_url && (
                    <div className="relative h-48 overflow-hidden">
                        <Image
                            src={article.featured_image_url}
                            alt={article.title}
                            fill
                            className="object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-transparent" />
                    </div>
                )}
                <div className="p-6">
                    <div className="mb-3 flex items-center gap-2">
                        <span
                            className={`rounded px-2 py-1 text-xs font-medium ${ARTICLE_TYPE_COLORS[article.article_type] || "bg-gray-500/20 text-gray-400"}`}
                        >
                            {ARTICLE_TYPE_LABELS[article.article_type] ||
                                article.article_type}
                        </span>
                        {article.is_featured && (
                            <span className="rounded bg-yellow-500/20 px-2 py-1 text-xs font-medium text-yellow-400">
                                Featured
                            </span>
                        )}
                    </div>
                    <h2 className="mb-2 text-xl font-bold text-white transition-colors group-hover:text-blue-400">
                        {article.title}
                    </h2>
                    <p className="mb-4 line-clamp-2 text-sm text-gray-400">
                        {article.excerpt}
                    </p>
                    <div className="flex items-center justify-between text-xs text-gray-500">
                        {article.author ? (
                            <Link
                                href={`/authors/${article.author.id}`}
                                className="relative z-20 flex items-center gap-2 transition-colors hover:text-blue-400"
                            >
                                {getPhotoUrl(article.author.photo) ? (
                                    <Image
                                        src={
                                            getPhotoUrl(article.author.photo) ||
                                            ""
                                        }
                                        alt={authorName}
                                        width={20}
                                        height={20}
                                        className="h-5 w-5 rounded object-cover"
                                    />
                                ) : (
                                    <div className="flex h-5 w-5 items-center justify-center rounded bg-blue-600 text-[10px] font-bold text-white">
                                        {article.author.first_name.charAt(0)}
                                    </div>
                                )}
                                <span>{authorName}</span>
                            </Link>
                        ) : (
                            <span>{authorName}</span>
                        )}
                        <div className="flex items-center gap-3">
                            {publishedDate && <span>{publishedDate}</span>}
                            <span>{article.reading_time} min read</span>
                        </div>
                    </div>
                </div>
            </article>
        );
    }

    // Default variant
    return (
        <article className="group relative block rounded-xl border border-gray-700/50 bg-gray-800/50 p-6 transition-colors hover:border-gray-600 hover:bg-gray-800">
            <Link
                href={href}
                aria-label={`Read ${article.title}`}
                className="absolute inset-0 z-10 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-400"
            />
            <div className="mb-3 flex items-center gap-2">
                <span
                    className={`rounded px-2 py-1 text-xs font-medium ${ARTICLE_TYPE_COLORS[article.article_type] || "bg-gray-500/20 text-gray-400"}`}
                >
                    {ARTICLE_TYPE_LABELS[article.article_type] ||
                        article.article_type}
                </span>
                {article.category && (
                    <span className="text-xs text-gray-500">
                        {article.category.name}
                    </span>
                )}
            </div>
            <h3 className="mb-2 text-lg font-semibold text-white transition-colors group-hover:text-blue-400">
                {article.title}
            </h3>
            <p className="mb-4 line-clamp-2 text-sm text-gray-400">
                {article.excerpt}
            </p>
            <div className="flex items-center justify-between text-xs text-gray-500">
                {article.author ? (
                    <Link
                        href={`/authors/${article.author.id}`}
                        className="relative z-20 flex items-center gap-2 transition-colors hover:text-blue-400"
                    >
                        {getPhotoUrl(article.author.photo) ? (
                            <Image
                                src={getPhotoUrl(article.author.photo) || ""}
                                alt={authorName}
                                width={20}
                                height={20}
                                className="h-5 w-5 rounded object-cover"
                            />
                        ) : (
                            <div className="flex h-5 w-5 items-center justify-center rounded bg-blue-600 text-[10px] font-bold text-white">
                                {article.author.first_name.charAt(0)}
                            </div>
                        )}
                        <span>{authorName}</span>
                    </Link>
                ) : (
                    <span>{authorName}</span>
                )}
                <div className="flex items-center gap-3">
                    <span>{article.view_count} views</span>
                    <span>{article.reading_time} min read</span>
                </div>
            </div>
        </article>
    );
}

export default ArticleCard;
