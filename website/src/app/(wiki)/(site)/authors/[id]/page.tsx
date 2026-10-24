"use client";

import { ArticleCard } from "@/components/wiki/ArticleCard";
import { getAuthorArticles, getAuthorProfile } from "@/lib/wiki/api";
import type { ArticleSummary } from "@/lib/wiki/types";
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
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { FaLinkedin } from "react-icons/fa";

interface AuthorProfile {
    id: string;
    first_name: string;
    last_name: string;
    bio: string;
    website: string;
    photo?: string;
    github: string;
    twitter: string;
    bluesky?: string;
    linkedin?: string;
    instagram?: string;
    facebook?: string;
    devto?: string;
    stackoverflow?: string;
    youtube?: string;
    twitch?: string;
    articles_count: number;
}

type IconComponent = React.ComponentType<{ className?: string }>;

interface SocialPlatform {
    key: keyof AuthorProfile;
    label: string;
    icon: IconComponent;
}

const SOCIAL_PLATFORMS: SocialPlatform[] = [
    {
        key: "website",
        label: "Website",
        icon: Globe,
    },
    {
        key: "github",
        label: "GitHub",
        icon: SiGithub,
    },
    {
        key: "twitter",
        label: "X (Twitter)",
        icon: SiX,
    },
    {
        key: "bluesky",
        label: "Bluesky",
        icon: SiBluesky,
    },
    {
        key: "linkedin",
        label: "LinkedIn",
        icon: FaLinkedin,
    },
    {
        key: "instagram",
        label: "Instagram",
        icon: SiInstagram,
    },
    {
        key: "facebook",
        label: "Facebook",
        icon: SiFacebook,
    },
    {
        key: "devto",
        label: "Dev.to",
        icon: SiDevdotto,
    },
    {
        key: "stackoverflow",
        label: "Stack Overflow",
        icon: SiStackoverflow,
    },
    {
        key: "youtube",
        label: "YouTube",
        icon: SiYoutube,
    },
    {
        key: "twitch",
        label: "Twitch",
        icon: SiTwitch,
    },
];

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const getPhotoUrl = (photo: string | null | undefined): string | null => {
    if (!photo) return null;
    if (photo.startsWith("http")) return photo;
    return `${API_BASE}${photo}`;
};

export default function AuthorProfilePage() {
    const params = useParams();
    const userId = params.id as string;

    const [author, setAuthor] = useState<AuthorProfile | null>(null);
    const [articles, setArticles] = useState<ArticleSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingArticles, setLoadingArticles] = useState(false);
    const [page, setPage] = useState(1);
    const [totalArticles, setTotalArticles] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const perPage = 12;

    useEffect(() => {
        async function loadAuthor() {
            setLoading(true);
            setError(null);

            try {
                const response = await getAuthorProfile(userId);
                if (response.success && response.user) {
                    setAuthor(response.user);
                } else {
                    setError(response.message || "Author not found");
                }
            } catch (err) {
                console.error("Failed to load author profile:", err);
                setError("Failed to load author profile");
            } finally {
                setLoading(false);
            }
        }

        loadAuthor();
    }, [userId]);

    useEffect(() => {
        if (!author) return;

        async function loadArticles() {
            setLoadingArticles(true);

            try {
                const response = await getAuthorArticles(userId, {
                    page,
                    per_page: perPage,
                });

                if (response.success) {
                    setArticles(response.articles);
                    setTotalArticles(response.total);
                }
            } catch (err) {
                console.error("Failed to load author articles:", err);
            } finally {
                setLoadingArticles(false);
            }
        }

        loadArticles();
    }, [author, userId, page]);

    if (loading) {
        return (
            <div className="flex min-h-[500px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
        );
    }

    if (error || !author) {
        return (
            <div className="space-y-6">
                <div>
                    <h1 className="text-3xl font-bold text-white">
                        Author Not Found
                    </h1>
                    <p className="mt-2 text-gray-400">
                        {error || "The author profile could not be found."}
                    </p>
                </div>
                <Link
                    href="/categories"
                    className="inline-block rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700"
                >
                    ← Back to Categories
                </Link>
            </div>
        );
    }

    const totalPages = Math.ceil(totalArticles / perPage);

    return (
        <div className="space-y-12">
            {/* Author Header */}
            <div className="rounded-lg border border-gray-700 bg-gradient-to-r from-gray-800 to-gray-900 p-8">
                <div className="flex flex-col gap-6 md:flex-row md:items-center">
                    {/* Avatar */}
                    {author.photo ? (
                        <Image
                            src={getPhotoUrl(author.photo) || ""}
                            alt={`${author.first_name} ${author.last_name}`}
                            width={96}
                            height={96}
                            className="h-24 w-24 rounded-lg object-cover"
                        />
                    ) : (
                        <div className="flex h-24 w-24 items-center justify-center rounded-lg bg-blue-600">
                            <span className="text-4xl font-bold text-white">
                                {author.first_name.charAt(0)}
                                {author.last_name.charAt(0)}
                            </span>
                        </div>
                    )}

                    {/* Info */}
                    <div className="flex-1">
                        <h1 className="text-3xl font-bold text-white">
                            {author.first_name} {author.last_name}
                        </h1>

                        {author.bio && (
                            <p className="mt-2 text-gray-300">{author.bio}</p>
                        )}

                        {/* Stats */}
                        <div className="mt-4 flex gap-6">
                            <div>
                                <p className="text-2xl font-bold text-white">
                                    {author.articles_count}
                                </p>
                                <p className="text-sm text-gray-400">
                                    Article
                                    {author.articles_count !== 1 ? "s" : ""}
                                </p>
                            </div>
                        </div>

                        {/* Social Links */}
                        <div className="mt-4 flex flex-wrap gap-2">
                            {SOCIAL_PLATFORMS.map((platform) => {
                                const value = author[platform.key];
                                if (!value) return null;
                                return (
                                    <a
                                        key={platform.key}
                                        href={value as string}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-600 text-gray-300 transition-colors hover:border-blue-500 hover:text-blue-400 sm:h-9 sm:w-9"
                                        title={platform.label}
                                    >
                                        <platform.icon className="h-5 w-5 sm:h-5 sm:w-5" />
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Articles Section */}
            <div>
                <div className="mb-8">
                    <h2 className="text-2xl font-bold text-white">
                        Published Articles
                    </h2>
                    <p className="mt-1 text-gray-400">
                        {totalArticles} article{totalArticles !== 1 ? "s" : ""}{" "}
                        by this author
                    </p>
                </div>

                {articles.length > 0 ? (
                    <>
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                            {articles.map((article) => (
                                <ArticleCard
                                    key={article.id}
                                    article={article}
                                />
                            ))}
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="mt-8 flex items-center justify-center gap-2">
                                <button
                                    onClick={() =>
                                        setPage((p) => Math.max(1, p - 1))
                                    }
                                    disabled={page === 1}
                                    className="rounded-lg border border-gray-600 px-4 py-2 text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:opacity-50"
                                >
                                    ← Previous
                                </button>

                                <div className="flex gap-1">
                                    {Array.from(
                                        { length: totalPages },
                                        (_, i) => i + 1,
                                    ).map((p) => (
                                        <button
                                            key={p}
                                            onClick={() => setPage(p)}
                                            className={`h-10 w-10 rounded-lg transition-colors ${
                                                p === page
                                                    ? "bg-blue-600 text-white"
                                                    : "border border-gray-600 text-gray-300 hover:border-gray-500 hover:text-white"
                                            }`}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>

                                <button
                                    onClick={() =>
                                        setPage((p) =>
                                            Math.min(totalPages, p + 1),
                                        )
                                    }
                                    disabled={page === totalPages}
                                    className="rounded-lg border border-gray-600 px-4 py-2 text-gray-300 transition-colors hover:border-gray-500 hover:text-white disabled:opacity-50"
                                >
                                    Next →
                                </button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="rounded-lg border border-gray-700 bg-gray-800/50 px-6 py-12 text-center">
                        <p className="text-gray-400">
                            {loadingArticles
                                ? "Loading articles..."
                                : "This author has not published any articles yet."}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
