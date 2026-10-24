"use client";

import { MarkdownEditor } from "@/components/wiki/MarkdownEditor";
import { useAuth } from "@/lib/auth";
import { createArticle, getCategories, getTags } from "@/lib/wiki/api";
import type { ArticleType, Category, Tag } from "@/lib/wiki/types";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

const ARTICLE_TYPES: { value: ArticleType; label: string }[] = [
    { value: "documentation", label: "Documentation" },
    { value: "tutorial", label: "Tutorial" },
    { value: "blog", label: "Blog Post" },
    { value: "guide", label: "Guide" },
    { value: "reference", label: "Reference" },
];

export default function NewArticlePage() {
    const router = useRouter();
    const { user, isAuthenticated, isLoading, getLoginUrl } = useAuth();
    const [isPending, startTransition] = useTransition();

    // Form state
    const [title, setTitle] = useState("");
    const [slug, setSlug] = useState("");
    const [excerpt, setExcerpt] = useState("");
    const [content, setContent] = useState("");
    const [articleType, setArticleType] =
        useState<ArticleType>("documentation");
    const [categoryId, setCategoryId] = useState<string>("");
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
    const [selectedTags, setSelectedTags] = useState<string[]>([]);
    const [metaTitle, setMetaTitle] = useState("");
    const [metaDescription, setMetaDescription] = useState("");
    const [allowComments, setAllowComments] = useState(true);
    const [showNewTagInput, setShowNewTagInput] = useState(false);
    const [newTagName, setNewTagName] = useState("");
    const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
    const [newCategoryName, setNewCategoryName] = useState("");
    const [newCategoryIcon, setNewCategoryIcon] = useState("");

    // Data for dropdowns
    const [categories, setCategories] = useState<Category[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Redirect to login if not authenticated
    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            window.location.href = getLoginUrl("/new");
        }
    }, [isLoading, isAuthenticated, getLoginUrl]);

    // Load categories and tags
    useEffect(() => {
        if (!isAuthenticated) return;

        async function loadData() {
            try {
                const [categoriesRes, tagsRes] = await Promise.all([
                    getCategories(),
                    getTags(),
                ]);

                if (categoriesRes.success) {
                    setCategories(categoriesRes.categories);
                }
                if (tagsRes.success) {
                    setTags(tagsRes.tags);
                }
            } catch (err) {
                console.error("Failed to load data:", err);
            }
        }

        loadData();
    }, [isAuthenticated]);

    // Show loading while checking auth
    if (isLoading || !isAuthenticated) {
        return (
            <div className="flex min-h-[400px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
        );
    }

    // Auto-generate slug from title
    const handleTitleChange = (value: string) => {
        setTitle(value);
        if (!slug || slug === generateSlug(title)) {
            setSlug(generateSlug(value));
        }
    };

    const generateSlug = (text: string) => {
        return text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!title.trim()) {
            setError("Title is required");
            return;
        }

        if (!content.trim()) {
            setError("Content is required");
            return;
        }

        startTransition(async () => {
            try {
                const response = await createArticle({
                    title: title.trim(),
                    slug: slug.trim() || undefined,
                    excerpt: excerpt.trim() || undefined,
                    content: content.trim(),
                    article_type: articleType,
                    category_id: categoryId || undefined,
                    category_ids:
                        selectedCategories.length > 0
                            ? selectedCategories
                            : categoryId
                              ? [categoryId]
                              : [],
                    tag_ids: selectedTags,
                    meta_title: metaTitle.trim() || undefined,
                    meta_description: metaDescription.trim() || undefined,
                    allow_comments: allowComments,
                });

                if (response.success && response.article) {
                    router.push(response.article.full_url);
                } else {
                    setError(response.message || "Failed to create article");
                }
            } catch (err) {
                console.error("Submit error:", err);
                setError("Failed to create article");
            }
        });
    };

    const toggleTag = (tagId: string) => {
        setSelectedTags((prev) =>
            prev.includes(tagId)
                ? prev.filter((id) => id !== tagId)
                : [...prev, tagId],
        );
    };

    const toggleCategory = (categoryId: string) => {
        setSelectedCategories((prev) =>
            prev.includes(categoryId)
                ? prev.filter((id) => id !== categoryId)
                : [...prev, categoryId],
        );
    };

    const handleCreateTag = async () => {
        if (!newTagName.trim()) return;

        try {
            const response = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/wiki/tags`,
                {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ name: newTagName.trim() }),
                },
            );

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
                `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/wiki/admin/categories`,
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

    return (
        <div className="mx-auto max-w-4xl">
            <h1 className="mb-8 text-3xl font-bold text-white">
                Write a New Article
            </h1>

            {error && (
                <div className="mb-6 rounded-lg border border-red-500/20 bg-red-500/10 p-4 text-red-400">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Title */}
                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-300">
                        Title <span className="text-red-400">*</span>
                    </label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => handleTitleChange(e.target.value)}
                        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder="Enter article title"
                        required
                    />
                </div>

                {/* Slug */}
                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-300">
                        URL Slug
                    </label>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-500">/</span>
                        <input
                            type="text"
                            value={slug}
                            onChange={(e) => setSlug(e.target.value)}
                            className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            placeholder="url-friendly-slug"
                        />
                    </div>
                </div>

                {/* Type and Primary Category */}
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="mb-2 block text-sm font-medium text-gray-300">
                            Article Type
                        </label>
                        <select
                            value={articleType}
                            onChange={(e) =>
                                setArticleType(e.target.value as ArticleType)
                            }
                            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                            {ARTICLE_TYPES.map((type) => (
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
                            className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                            />
                            <input
                                type="text"
                                value={newCategoryIcon}
                                onChange={(e) =>
                                    setNewCategoryIcon(e.target.value)
                                }
                                placeholder="Icon (emoji)"
                                maxLength={2}
                                className="w-20 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-center text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                        className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        placeholder="Brief summary of the article"
                    />
                </div>

                {/* Content */}
                <div>
                    <label className="mb-2 block text-sm font-medium text-gray-300">
                        Content <span className="text-red-400">*</span>
                    </label>
                    <MarkdownEditor
                        value={content}
                        onChange={setContent}
                        placeholder="Write your article in Markdown..."
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
                                className="flex-1 rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-sm text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
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
                                        : "bg-gray-800 text-gray-300 hover:bg-gray-700"
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
                <details className="group">
                    <summary className="cursor-pointer text-sm font-medium text-gray-300 hover:text-white">
                        SEO Settings
                    </summary>
                    <div className="mt-4 space-y-4 border-l border-gray-700 pl-4">
                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-400">
                                Meta Title (max 60 characters)
                            </label>
                            <input
                                type="text"
                                value={metaTitle}
                                onChange={(e) =>
                                    setMetaTitle(e.target.value.slice(0, 60))
                                }
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                placeholder="Custom page title for search engines"
                            />
                            <div className="mt-1 text-xs text-gray-500">
                                {metaTitle.length}/60
                            </div>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm font-medium text-gray-400">
                                Meta Description (max 160 characters)
                            </label>
                            <textarea
                                value={metaDescription}
                                onChange={(e) =>
                                    setMetaDescription(
                                        e.target.value.slice(0, 160),
                                    )
                                }
                                rows={2}
                                className="w-full rounded-lg border border-gray-700 bg-gray-800 px-4 py-2 text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
                                placeholder="Description for search results"
                            />
                            <div className="mt-1 text-xs text-gray-500">
                                {metaDescription.length}/160
                            </div>
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="allowComments"
                                checked={allowComments}
                                onChange={(e) =>
                                    setAllowComments(e.target.checked)
                                }
                                className="h-4 w-4 rounded border-gray-600 bg-gray-800 text-blue-600 focus:ring-blue-500"
                            />
                            <label
                                htmlFor="allowComments"
                                className="text-sm text-gray-400"
                            >
                                Allow comments
                            </label>
                        </div>
                    </div>
                </details>

                {/* Submit */}
                <div className="flex items-center justify-end gap-4 border-t border-gray-700 pt-4">
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="px-6 py-2 text-gray-400 hover:text-white"
                    >
                        Cancel
                    </button>
                    {user?.canPublishDirectly ||
                    user?.isStaff ||
                    user?.isSuperuser ? (
                        <button
                            type="submit"
                            disabled={isPending}
                            className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isPending ? "Publishing..." : "Publish Article"}
                        </button>
                    ) : (
                        <button
                            type="submit"
                            disabled={isPending}
                            className="rounded-lg bg-yellow-600 px-6 py-2 text-white hover:bg-yellow-700 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isPending ? "Submitting..." : "Submit for Review"}
                        </button>
                    )}
                </div>
            </form>
        </div>
    );
}
