"use client";

import { MarkdownEditor } from "@/components/wiki/MarkdownEditor";
import { canDeleteArticle, canEditArticle, useAuth } from "@/lib/auth";
import type { Article, Category, Tag } from "@/lib/wiki/types";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ArticleResponse {
    success: boolean;
    article: Article;
}

interface CategoriesResponse {
    success: boolean;
    categories: Category[];
}

interface TagsResponse {
    success: boolean;
    tags: Tag[];
}

export default function EditArticlePage() {
    const params = useParams();
    const articleId = params.id as string;
    const router = useRouter();
    const { user, isAuthenticated, isLoading, getLoginUrl } = useAuth();

    const [article, setArticle] = useState<Article | null>(null);
    const [categories, setCategories] = useState<Category[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [excerpt, setExcerpt] = useState("");
    const [content, setContent] = useState("");
    const [categoryId, setCategoryId] = useState("");
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [articleType, setArticleType] = useState("documentation");
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [metaTitle, setMetaTitle] = useState("");
    const [metaDescription, setMetaDescription] = useState("");
    const [allowComments, setAllowComments] = useState(true);
    const [showNewTagInput, setShowNewTagInput] = useState(false);
    const [newTagName, setNewTagName] = useState("");
    const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [newCategoryIcon, setNewCategoryIcon] = useState("");

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push(getLoginUrl(`/edit/${articleId}`));
        }
    }, [isLoading, isAuthenticated, router, getLoginUrl, articleId]);

    useEffect(() => {
        if (!isAuthenticated) return;

        async function fetchData() {
            try {
                const [articleRes, categoriesRes, tagsRes] = await Promise.all([
                    fetch(`${API_BASE}/api/wiki/articles/${articleId}`, {
                        credentials: "include",
                    }),
                    fetch(`${API_BASE}/api/wiki/categories`),
                    fetch(`${API_BASE}/api/wiki/tags`),
                ]);

                const [articleData, categoriesData, tagsData]: [
                    ArticleResponse,
                    CategoriesResponse,
                    TagsResponse,
                ] = await Promise.all([
                    articleRes.json(),
                    categoriesRes.json(),
                    tagsRes.json(),
                ]);

                if (!articleData.success || !articleData.article) {
                    setError("Article not found");
                    return;
                }

                const a = articleData.article;

                // Check permissions
                if (!canEditArticle(user, a.author?.id || null)) {
                    setError("You don't have permission to edit this article");
                    return;
                }

                setArticle(a);
                setTitle(a.title);
                setSlug(a.slug);
                setExcerpt(a.excerpt || "");
                setContent(a.content);
                setCategoryId(a.category?.id || "");
                setSelectedCategories(a.categories?.map((c) => c.id) || []);
                setArticleType(a.article_type);
                setSelectedTags(a.tags?.map((t) => t.id) || []);
                setMetaTitle(a.meta_title || "");
                setMetaDescription(a.meta_description || "");
                setAllowComments(a.allow_comments);

                if (categoriesData.success) {
                    setCategories(categoriesData.categories);
                }
                if (tagsData.success) {
                    setTags(tagsData.tags);
                }
            } catch (err) {
                console.error("Failed to fetch article:", err);
                setError("Failed to load article");
            } finally {
                setLoading(false);
            }
        }

        fetchData();
    }, [isAuthenticated, articleId, user]);

    const handleSave = async (status?: string) => {
        setSaving(true);
        setError(null);

        try {
            const res = await fetch(
                `${API_BASE}/api/wiki/articles/${articleId}`,
                {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({
                        title,
                        slug,
                        excerpt,
                        content,
                        category_id: categoryId || null,
                        category_ids: selectedCategories,
                        article_type: articleType,
                        tag_ids: selectedTags,
                        meta_title: metaTitle,
                        meta_description: metaDescription,
                        allow_comments: allowComments,
                        status: status || article?.status,
                    }),
                },
            );

            const data = await res.json();

            if (!data.success) {
                setError(data.message || "Failed to save article");
                return;
            }

            // Redirect based on status
            if (status === "published" || article?.status === "published") {
                const url = categoryId
                    ? `/${categories.find((c) => c.id === categoryId)?.slug}/${slug}`
                    : `/articles/${slug}`;
                router.push(url);
            } else {
                router.push("/dashboard/articles");
            }
        } catch (err) {
            console.error("Failed to save article:", err);
            setError("Failed to save article");
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (
            !confirm(
                "Are you sure you want to delete this article? This cannot be undone.",
            )
        ) {
            return;
        }

        try {
            const res = await fetch(
                `${API_BASE}/api/wiki/articles/${articleId}`,
                {
                    method: "DELETE",
                    credentials: "include",
                },
            );

            const data = await res.json();

            if (data.success) {
                router.push("/dashboard/articles");
            } else {
                setError(data.message || "Failed to delete article");
            }
        } catch (err) {
            console.error("Failed to delete article:", err);
            setError("Failed to delete article");
        }
    };

    const handleSubmitForReview = async () => {
        await handleSave("pending_review");
    };

    const handlePublish = async () => {
        await handleSave("published");
    };

    const toggleCategory = (categoryId: string) => {
        setSelectedCategories((prev) =>
            prev.includes(categoryId)
                ? prev.filter((id) => id !== categoryId)
                : [...prev, categoryId],
        );
    };

    const toggleTag = (tagId: string) => {
        setSelectedTags((prev) =>
            prev.includes(tagId)
                ? prev.filter((id) => id !== tagId)
                : [...prev, tagId],
        );
    };

    const handleCreateTag = async () => {
        if (!newTagName.trim()) return;
        try {
            const response = await fetch(`${API_BASE}/api/wiki/tags`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify({ name: newTagName.trim() }),
            });
            const data = await response.json();
            if (data.success && data.tag) {
                setTags((prev) => [...prev, data.tag]);
                setSelectedTags((prev) => [...prev, data.tag.id]);
                setNewTagName("");
                setShowNewTagInput(false);
            } else {
                setError(data.message || "Failed to create tag");
            }
        } catch (err) {
            console.error("Failed to create tag:", err);
            setError("Failed to create tag");
        }
    };

    const handleCreateCategory = async () => {
        if (!newCategoryName.trim()) return;
        try {
            const formData = new FormData();
            formData.append("name", newCategoryName.trim());
            formData.append("icon", newCategoryIcon.trim() || "📁");

            const response = await fetch(
                `${API_BASE}/api/wiki/admin/categories`,
                {
                    method: "POST",
                    credentials: "include",
                    body: formData,
                },
            );
            const data = await response.json();
            if (data.success && data.category) {
                setCategories((prev) => [...prev, data.category]);
                setSelectedCategories((prev) => [...prev, data.category.id]);
                setNewCategoryName("");
                setNewCategoryIcon("");
                setShowNewCategoryInput(false);
            } else {
                setError(data.message || "Failed to create category");
            }
        } catch (err) {
            console.error("Failed to create category:", err);
            setError("Failed to create category");
        }
    };

    if (isLoading || loading) {
        return (
            <div className="flex min-h-[400px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
        );
    }

    if (error && !article) {
        return (
            <div className="mx-auto max-w-3xl py-8">
                <div className="rounded-lg border border-red-700/50 bg-red-900/20 p-6 text-center">
                    <p className="mb-4 text-red-300">{error}</p>
                    <Link
                        href="/dashboard"
                        className="text-blue-400 hover:text-blue-300"
                    >
                        Back to Dashboard
                    </Link>
                </div>
            </div>
        );
    }

    const canDelete = canDeleteArticle(user, article?.author?.id || null);
    const canPublishDirectly =
        user?.canPublishDirectly || user?.isStaff || user?.isSuperuser;

    const articleTypes = [
        { value: "documentation", label: "Documentation" },
        { value: "tutorial", label: "Tutorial" },
        { value: "blog", label: "Blog Post" },
        { value: "guide", label: "Guide" },
        { value: "reference", label: "Reference" },
    ];

    return (
        <div className="mx-auto max-w-5xl space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white">
                        Edit Article
                    </h1>
                    {article && (
                        <p className="mt-1 text-sm text-gray-400">
                            Last updated:{" "}
                            {new Date(article.updated_at).toLocaleString()}
                        </p>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        href="/dashboard/articles"
                        className="px-4 py-2 text-gray-400 hover:text-white"
                    >
                        Cancel
                    </Link>
                    {canDelete && (
                        <button
                            onClick={handleDelete}
                            className="rounded-lg bg-red-600/20 px-4 py-2 text-red-400 hover:bg-red-600/30"
                        >
                            Delete
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="rounded-lg border border-red-700/50 bg-red-900/20 p-4">
                    <p className="text-red-300">{error}</p>
                </div>
            )}

            {/* Status Banner */}
            {article &&
                article.status !== "published" &&
                article.status !== "draft" && (
                    <div className="rounded-lg border border-yellow-700/50 bg-yellow-900/20 p-4">
                        <p className="text-yellow-300">
                            Status:{" "}
                            <span className="font-medium capitalize">
                                {article.status.replace("_", " ")}
                            </span>
                            {article.moderation_notes && (
                                <span className="mt-2 block text-yellow-200/70">
                                    Feedback: {article.moderation_notes}
                                </span>
                            )}
                        </p>
                    </div>
                )}

            {/* Form */}
            <div className="space-y-6 rounded-lg bg-gray-800/50 p-6">
                {/* Title */}
                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-300">
                        Title *
                    </label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                        placeholder="Article title"
                    />
                </div>

                {/* Slug */}
                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-300">
                        URL Slug *
                    </label>
                    <input
                        type="text"
                        value={slug}
                        onChange={(e) =>
                            setSlug(
                                e.target.value
                                    .toLowerCase()
                                    .replace(/[^a-z0-9-]/g, "-"),
                            )
                        }
                        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                        placeholder="article-url-slug"
                    />
                </div>

                {/* Category and Type */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-gray-300">
                            Article Type
                        </label>
                        <select
                            value={articleType}
                            onChange={(e) => setArticleType(e.target.value)}
                            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                        >
                            {articleTypes.map((type) => (
                                <option key={type.value} value={type.value}>
                                    {type.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="mb-2 block text-sm font-medium text-gray-300">
                            Primary Category (for URL)
                        </label>
                        <select
                            value={categoryId}
                            onChange={(e) => {
                                setCategoryId(e.target.value);
                                // Auto-select in categories too
                                if (
                                    e.target.value &&
                                    !selectedCategories.includes(e.target.value)
                                ) {
                                    setSelectedCategories((prev) => [
                                        ...prev,
                                        e.target.value,
                                    ]);
                                }
                            }}
                            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                        >
                            <option value="">No category</option>
                            {categories.map((cat) => (
                                <option key={cat.id} value={cat.id}>
                                    {cat.icon} {cat.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* All Categories */}
                <div>
                    <div className="mb-2 flex items-center justify-between">
                        <label className="block text-sm font-medium text-gray-300">
                            All Categories
                            <span className="ml-2 text-xs text-gray-500">
                                (Select all that apply)
                            </span>
                        </label>
                        {(user?.isStaff || user?.isModerator) && (
                            <button
                                type="button"
                                onClick={() =>
                                    setShowNewCategoryInput(
                                        !showNewCategoryInput,
                                    )
                                }
                                className="text-sm text-blue-400 hover:text-blue-300"
                            >
                                {showNewCategoryInput
                                    ? "Cancel"
                                    : "+ Create New Category"}
                            </button>
                        )}
                    </div>

                    {showNewCategoryInput && (
                        <div className="mb-3 flex gap-2">
                            <input
                                type="text"
                                value={newCategoryName}
                                onChange={(e) =>
                                    setNewCategoryName(e.target.value)
                                }
                                placeholder="Category name"
                                className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                            />
                            <input
                                type="text"
                                value={newCategoryIcon}
                                onChange={(e) =>
                                    setNewCategoryIcon(e.target.value)
                                }
                                placeholder="Icon (emoji)"
                                maxLength={2}
                                className="w-20 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-center text-sm text-white focus:border-blue-500 focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={handleCreateCategory}
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                            >
                                Create
                            </button>
                        </div>
                    )}

                    {categories.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                            {categories.map((category) => (
                                <button
                                    key={category.id}
                                    type="button"
                                    onClick={() => toggleCategory(category.id)}
                                    className={`rounded-lg border-2 px-3 py-1.5 text-sm font-medium transition-all ${
                                        selectedCategories.includes(category.id)
                                            ? "border-blue-500 bg-blue-600 text-white shadow-lg ring-2 shadow-blue-500/50 ring-blue-400/50"
                                            : "border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600 hover:bg-gray-700/50 hover:text-gray-300"
                                    }`}
                                >
                                    {category.icon} {category.name}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Excerpt */}
                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-300">
                        Excerpt
                    </label>
                    <textarea
                        value={excerpt}
                        onChange={(e) => setExcerpt(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                        placeholder="Brief summary for article previews"
                    />
                </div>

                {/* Content */}
                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-300">
                        Content *
                    </label>
                    <MarkdownEditor
                        value={content}
                        onChange={setContent}
                        placeholder="Write your article content in Markdown..."
                    />
                </div>

                {/* Tags */}
                <div>
                    <div className="mb-2 flex items-center justify-between">
                        <label className="block text-sm font-medium text-gray-300">
                            Tags
                        </label>
                        {(user?.isStaff || user?.isModerator) && (
                            <button
                                type="button"
                                onClick={() =>
                                    setShowNewTagInput(!showNewTagInput)
                                }
                                className="text-sm text-blue-400 hover:text-blue-300"
                            >
                                {showNewTagInput
                                    ? "Cancel"
                                    : "+ Create New Tag"}
                            </button>
                        )}
                    </div>

                    {showNewTagInput && (
                        <div className="mb-3 flex gap-2">
                            <input
                                type="text"
                                value={newTagName}
                                onChange={(e) => setNewTagName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        handleCreateTag();
                                    }
                                }}
                                placeholder="New tag name"
                                className="flex-1 rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-sm text-white focus:border-blue-500 focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={handleCreateTag}
                                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
                            >
                                Create
                            </button>
                        </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                        {tags.map((tag) => (
                            <button
                                key={tag.id}
                                type="button"
                                onClick={() => toggleTag(tag.id)}
                                className={`rounded-lg px-3 py-1 text-sm transition-colors ${
                                    selectedTags.includes(tag.id)
                                        ? "bg-blue-600 text-white"
                                        : "bg-gray-700 text-gray-300 hover:bg-gray-600"
                                }`}
                            >
                                {tag.name}
                            </button>
                        ))}
                        {tags.length === 0 && !showNewTagInput && (
                            <p className="text-sm text-gray-500">
                                No tags available
                            </p>
                        )}
                    </div>
                </div>

                {/* SEO */}
                <details className="rounded-lg bg-gray-900/50 p-4">
                    <summary className="cursor-pointer text-gray-300">
                        SEO Settings
                    </summary>
                    <div className="mt-4 space-y-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-400">
                                Meta Title
                            </label>
                            <input
                                type="text"
                                value={metaTitle}
                                onChange={(e) => setMetaTitle(e.target.value)}
                                maxLength={60}
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                                placeholder="Custom title for search engines (max 60 chars)"
                            />
                        </div>
                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-400">
                                Meta Description
                            </label>
                            <textarea
                                value={metaDescription}
                                onChange={(e) =>
                                    setMetaDescription(e.target.value)
                                }
                                maxLength={160}
                                rows={2}
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                                placeholder="Description for search engines (max 160 chars)"
                            />
                        </div>
                    </div>
                </details>

                {/* Options */}
                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-gray-300">
                        <input
                            type="checkbox"
                            checked={allowComments}
                            onChange={(e) => setAllowComments(e.target.checked)}
                            className="rounded border-gray-600 bg-gray-700"
                        />
                        Allow comments
                    </label>
                </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3">
                <button
                    onClick={() => handleSave()}
                    disabled={saving}
                    className="rounded-lg bg-gray-700 px-6 py-2 text-white hover:bg-gray-600 disabled:opacity-50"
                >
                    {saving ? "Saving..." : "Save Draft"}
                </button>
                {!canPublishDirectly &&
                    article?.status !== "pending_review" && (
                        <button
                            onClick={handleSubmitForReview}
                            disabled={saving}
                            className="rounded-lg bg-yellow-600 px-6 py-2 text-white hover:bg-yellow-500 disabled:opacity-50"
                        >
                            Submit for Review
                        </button>
                    )}
                {canPublishDirectly && (
                    <button
                        onClick={handlePublish}
                        disabled={saving}
                        className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-500 disabled:opacity-50"
                    >
                        {article?.status === "published"
                            ? "Update & Publish"
                            : "Publish"}
                    </button>
                )}
            </div>
        </div>
    );
}
