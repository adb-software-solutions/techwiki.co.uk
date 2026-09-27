import { FloatingEditButton } from "@/components/wiki/ArticleActions";
import { ArticleActionsBar } from "@/components/wiki/ArticleActionsBar";
import { MarkdownRenderer } from "@/components/wiki/MarkdownRenderer";
import { getArticleByPath } from "@/lib/wiki/api";
import {
    SiBluesky,
    SiDevdotto,
    SiFacebook,
    SiGithub,
    SiInstagram,
    SiStackoverflow,
    SiTwitch,
    SiX,
    SiYoutube,
} from "@icons-pack/react-simple-icons";
import { Globe } from "lucide-react";
import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FaLinkedin } from "react-icons/fa";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const getPhotoUrl = (photo: string | null | undefined): string | null => {
    if (!photo) return null;
    if (photo.startsWith("http")) return photo;
    return `${API_BASE}${photo}`;
};

interface ArticlePageProps {
    params: Promise<{ slug: string }>;
}

export async function generateMetadata({
    params,
}: ArticlePageProps): Promise<Metadata> {
    const { slug } = await params;
    const response = await getArticleByPath(slug).catch(() => null);

    if (!response?.success || !response.article) {
        return { title: "Article Not Found | TechWiki" };
    }

    const article = response.article;
    return {
        title: article.meta_title || `${article.title} | TechWiki`,
        description: article.meta_description || article.excerpt,
        openGraph: {
            title: article.title,
            description: article.excerpt,
            type: "article",
            publishedTime: article.published_at || undefined,
            modifiedTime: article.updated_at,
            authors: article.author
                ? [`${article.author.first_name} ${article.author.last_name}`]
                : undefined,
            images: article.featured_image_url
                ? [{ url: article.featured_image_url }]
                : undefined,
        },
    };
}

// Revalidate every 60 seconds (ISR)
export const revalidate = 60;

export default async function StandaloneArticlePage({
    params,
}: ArticlePageProps) {
    const { slug } = await params;
    const response = await getArticleByPath(slug).catch(() => null);

    if (!response?.success || !response.article) {
        notFound();
    }

    const article = response.article;
    const authorName = article.author
        ? `${article.author.first_name} ${article.author.last_name}`.trim()
        : "Anonymous";

    const publishedDate = article.published_at
        ? new Date(article.published_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
              year: "numeric",
          })
        : null;

    const updatedDate = new Date(article.updated_at).toLocaleDateString(
        "en-GB",
        {
            day: "numeric",
            month: "long",
            year: "numeric",
        },
    );

    return (
        <article className="mx-auto max-w-4xl">
            {/* Breadcrumb */}
            <nav className="mb-8 flex items-center gap-2 text-sm text-gray-400">
                <Link href="/" className="hover:text-white">
                    Home
                </Link>
                <span>/</span>
                <Link href="/articles" className="hover:text-white">
                    Articles
                </Link>
                <span>/</span>
                <span className="text-gray-300">{article.title}</span>
            </nav>

            {/* Featured image */}
            {article.featured_image_url && (
                <div className="relative mb-8 h-64 overflow-hidden rounded-xl md:h-96">
                    <Image
                        src={article.featured_image_url}
                        alt={article.title}
                        fill
                        className="object-cover"
                        priority
                    />
                </div>
            )}

            {/* Article header */}
            <header className="mb-8">
                {/* Tags and type */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-blue-500/20 px-2 py-1 text-xs font-medium text-blue-400">
                        {article.article_type.charAt(0).toUpperCase() +
                            article.article_type.slice(1)}
                    </span>
                    {article.tags.map((tag) => (
                        <Link
                            key={tag.id}
                            href={`/search?tag=${tag.slug}`}
                            className="rounded bg-gray-700 px-2 py-1 text-xs font-medium text-gray-300 hover:bg-gray-600"
                        >
                            {tag.name}
                        </Link>
                    ))}
                </div>

                <h1 className="mb-4 text-3xl font-bold text-white md:text-4xl">
                    {article.title}
                </h1>

                {article.excerpt && (
                    <p className="mb-6 text-xl text-gray-400">
                        {article.excerpt}
                    </p>
                )}

                {/* Meta info */}
                <div className="flex flex-wrap items-center gap-4 border-b border-gray-700 pb-6 text-sm text-gray-400">
                    {article.author ? (
                        <Link
                            href={`/authors/${article.author.id}`}
                            className="flex items-center gap-2 transition-colors hover:text-blue-400"
                        >
                            {getPhotoUrl(article.author.photo) ? (
                                <Image
                                    src={
                                        getPhotoUrl(article.author.photo) || ""
                                    }
                                    alt={authorName}
                                    width={32}
                                    height={32}
                                    className="h-8 w-8 rounded-full object-cover"
                                />
                            ) : (
                                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-700 text-white">
                                    {authorName.charAt(0).toUpperCase()}
                                </div>
                            )}
                            <span>{authorName}</span>
                        </Link>
                    ) : (
                        <div className="flex items-center gap-2">
                            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-700 text-white">
                                {authorName.charAt(0).toUpperCase()}
                            </div>
                            <span>{authorName}</span>
                        </div>
                    )}
                    {publishedDate && <span>Published {publishedDate}</span>}
                    <span>{article.reading_time} min read</span>
                    <span>{article.view_count} views</span>
                </div>
            </header>

            {/* Article content */}
            <div className="mb-12">
                <MarkdownRenderer html={article.rendered_html} />
            </div>

            {/* Article footer */}
            <footer className="border-t border-gray-700 pt-6">
                <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-gray-400">
                    <div>
                        Last updated: {updatedDate}
                        <span className="ml-2 text-gray-600">
                            v{article.version}
                        </span>
                    </div>
                    <ArticleActionsBar
                        articleId={article.id}
                        articleSlug={article.slug}
                        categorySlug={article.category?.slug || "articles"}
                    />
                </div>

                {/* Author bio */}
                {article.author && (
                    <div className="mt-8 rounded-xl bg-gray-800/50 p-6">
                        <div className="flex items-start gap-4">
                            <Link
                                href={`/authors/${article.author.id}`}
                                className="shrink-0"
                            >
                                {getPhotoUrl(article.author.photo) ? (
                                    <Image
                                        src={
                                            getPhotoUrl(article.author.photo) ||
                                            ""
                                        }
                                        alt={authorName}
                                        width={64}
                                        height={64}
                                        className="h-16 w-16 rounded-full object-cover ring-2 ring-gray-700 transition-all hover:ring-blue-500"
                                    />
                                ) : (
                                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-700 text-2xl text-white ring-2 ring-gray-700 transition-all hover:ring-blue-500">
                                        {authorName.charAt(0).toUpperCase()}
                                    </div>
                                )}
                            </Link>
                            <div className="flex-1">
                                <Link
                                    href={`/authors/${article.author.id}`}
                                    className="font-semibold text-white transition-colors hover:text-blue-400"
                                >
                                    {authorName}
                                </Link>
                                {article.author.bio && (
                                    <p className="mt-1 text-gray-400">
                                        {article.author.bio}
                                    </p>
                                )}
                                <div className="mt-3 flex flex-wrap items-center gap-3">
                                    {article.author.website && (
                                        <a
                                            href={article.author.website}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-gray-400 transition-colors hover:text-blue-400"
                                            title="Website"
                                        >
                                            <Globe size={16} />
                                        </a>
                                    )}
                                    {article.author.github && (
                                        <a
                                            href={article.author.github}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-gray-400 transition-colors hover:text-blue-400"
                                            title="GitHub"
                                        >
                                            <SiGithub size={16} />
                                        </a>
                                    )}
                                    {article.author.twitter && (
                                        <a
                                            href={article.author.twitter}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-gray-400 transition-colors hover:text-blue-400"
                                            title="X (Twitter)"
                                        >
                                            <SiX size={16} />
                                        </a>
                                    )}
                                    {article.author.bluesky && (
                                        <a
                                            href={article.author.bluesky}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-gray-400 transition-colors hover:text-blue-400"
                                            title="Bluesky"
                                        >
                                            <SiBluesky size={16} />
                                        </a>
                                    )}
                                    {article.author.linkedin && (
                                        <a
                                            href={article.author.linkedin}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-gray-400 transition-colors hover:text-blue-400"
                                            title="LinkedIn"
                                        >
                                            <FaLinkedin size={16} />
                                        </a>
                                    )}
                                    {article.author.instagram && (
                                        <a
                                            href={article.author.instagram}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-gray-400 transition-colors hover:text-blue-400"
                                            title="Instagram"
                                        >
                                            <SiInstagram size={16} />
                                        </a>
                                    )}
                                    {article.author.facebook && (
                                        <a
                                            href={article.author.facebook}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-gray-400 transition-colors hover:text-blue-400"
                                            title="Facebook"
                                        >
                                            <SiFacebook size={16} />
                                        </a>
                                    )}
                                    {article.author.devto && (
                                        <a
                                            href={article.author.devto}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-gray-400 transition-colors hover:text-blue-400"
                                            title="DEV.to"
                                        >
                                            <SiDevdotto size={16} />
                                        </a>
                                    )}
                                    {article.author.stackoverflow && (
                                        <a
                                            href={article.author.stackoverflow}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-gray-400 transition-colors hover:text-blue-400"
                                            title="Stack Overflow"
                                        >
                                            <SiStackoverflow size={16} />
                                        </a>
                                    )}
                                    {article.author.youtube && (
                                        <a
                                            href={article.author.youtube}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-gray-400 transition-colors hover:text-blue-400"
                                            title="YouTube"
                                        >
                                            <SiYoutube size={16} />
                                        </a>
                                    )}
                                    {article.author.twitch && (
                                        <a
                                            href={article.author.twitch}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1.5 text-gray-400 transition-colors hover:text-blue-400"
                                            title="Twitch"
                                        >
                                            <SiTwitch size={16} />
                                        </a>
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </footer>

            {/* Floating edit button for authorized users */}
            <FloatingEditButton
                articleId={article.id}
                authorId={article.author?.id || null}
            />
        </article>
    );
}
