"use client";

import { adminApi } from "@/components/admin/api";
import {
    Card,
    inputClass,
    isModeratorUser,
    useToast,
} from "@/components/admin/ui";
import { MarkdownEditor } from "@/components/wiki/MarkdownEditor";
import { useAuth } from "@/lib/auth";
import { getCategories, getTags } from "@/lib/wiki/api";
import type { Article, ArticleType, Category, Tag } from "@/lib/wiki/types";
import { Plus } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

export interface ArticleFormValues {
    title: string;
    slug: string;
    excerpt: string;
    content: string;
    articleType: ArticleType;
    categoryId: string;
    categoryIds: string[];
    tagIds: string[];
    metaTitle: string;
    metaDescription: string;
    allowComments: boolean;
}

export const EMPTY_ARTICLE: ArticleFormValues = {
    title: "",
    slug: "",
    excerpt: "",
    content: "",
    articleType: "documentation",
    categoryId: "",
    categoryIds: [],
    tagIds: [],
    metaTitle: "",
    metaDescription: "",
    allowComments: true,
};

const ARTICLE_TYPES: { value: ArticleType; label: string }[] = [
    { value: "documentation", label: "Documentation" },
    { value: "tutorial", label: "Tutorial" },
    { value: "guide", label: "Guide" },
    { value: "reference", label: "Reference" },
    { value: "blog", label: "Blog post" },
];

export function valuesFromArticle(article: Article): ArticleFormValues {
    return {
        title: article.title,
        slug: article.slug,
        excerpt: article.excerpt || "",
        content: article.content,
        articleType: article.article_type,
        categoryId: article.category?.id || "",
        categoryIds: article.categories?.map((c) => c.id) || [],
        tagIds: article.tags?.map((t) => t.id) || [],
        metaTitle: article.meta_title || "",
        metaDescription: article.meta_description || "",
        allowComments: article.allow_comments,
    };
}

export function toPayload(values: ArticleFormValues) {
    const categoryIds = values.categoryIds.length
        ? values.categoryIds
        : values.categoryId
          ? [values.categoryId]
          : [];
    return {
        title: values.title.trim(),
        slug: values.slug.trim(),
        excerpt: values.excerpt.trim(),
        content: values.content,
        article_type: values.articleType,
        category_id: values.categoryId || null,
        category_ids: categoryIds,
        tag_ids: values.tagIds,
        meta_title: values.metaTitle.trim(),
        meta_description: values.metaDescription.trim(),
        allow_comments: values.allowComments,
    };
}

export function validate(values: ArticleFormValues): string | null {
    if (!values.title.trim()) return "Add a title before saving.";
    if (!values.content.trim()) return "Add some content before saving.";
    return null;
}

export function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

/** Warn before closing or reloading the tab with unsaved edits. */
export function useUnsavedChangesWarning(dirty: boolean) {
    useEffect(() => {
        if (!dirty) return;
        const warn = (event: BeforeUnloadEvent) => {
            event.preventDefault();
        };
        window.addEventListener("beforeunload", warn);
        return () => window.removeEventListener("beforeunload", warn);
    }, [dirty]);
}

function Field({
    label,
    hint,
    htmlFor,
    children,
    action,
}: {
    label: string;
    hint?: ReactNode;
    htmlFor?: string;
    children: ReactNode;
    action?: ReactNode;
}) {
    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
                <label
                    htmlFor={htmlFor}
                    className="text-sm font-medium text-gray-300"
                >
                    {label}
                </label>
                {action}
            </div>
            {children}
            {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
        </div>
    );
}

function Chip({
    selected,
    onClick,
    children,
}: {
    selected: boolean;
    onClick: () => void;
    children: ReactNode;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={selected}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                selected
                    ? "border-blue-500 bg-blue-600/20 text-blue-200"
                    : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
            }`}
        >
            {children}
        </button>
    );
}

function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

export function ArticleFormFields({
    values,
    onChange,
    autoSlug = false,
    sidebarTop,
}: {
    values: ArticleFormValues;
    onChange: (next: ArticleFormValues) => void;
    autoSlug?: boolean;
    sidebarTop?: ReactNode;
}) {
    const { user } = useAuth();
    const toast = useToast();
    const [categories, setCategories] = useState<Category[]>([]);
    const [tags, setTags] = useState<Tag[]>([]);
    const [newTag, setNewTag] = useState<string | null>(null);
    const [newCategory, setNewCategory] = useState<{
        name: string;
        icon: string;
    } | null>(null);
    const canCreateTaxonomy = isModeratorUser(user);

    useEffect(() => {
        Promise.all([getCategories(), getTags()])
            .then(([categoryRes, tagRes]) => {
                if (categoryRes.success) setCategories(categoryRes.categories);
                if (tagRes.success) setTags(tagRes.tags);
            })
            .catch(() => toast("Could not load categories and tags", "error"));
    }, [toast]);

    const set = <K extends keyof ArticleFormValues>(
        key: K,
        value: ArticleFormValues[K],
    ) => onChange({ ...values, [key]: value });

    const setTitle = (title: string) => {
        const followSlug =
            autoSlug && (!values.slug || values.slug === slugify(values.title));
        onChange({
            ...values,
            title,
            slug: followSlug ? slugify(title) : values.slug,
        });
    };

    const createTag = async () => {
        if (!newTag?.trim()) return;
        const data = await adminApi<{
            success: boolean;
            tag?: Tag;
            message?: string;
        }>("/api/wiki/tags", { method: "POST", body: { name: newTag.trim() } });
        if (data.success && data.tag) {
            setTags((prev) => [...prev, data.tag as Tag]);
            set("tagIds", [...values.tagIds, data.tag.id]);
            setNewTag(null);
        } else {
            toast(data.message || "Could not create the tag", "error");
        }
    };

    const createCategory = async () => {
        if (!newCategory?.name.trim()) return;
        const data = await adminApi<{
            success: boolean;
            message?: string;
            category?: Category;
        }>("/api/wiki/admin/categories", {
            method: "POST",
            body: {
                name: newCategory.name.trim(),
                icon: newCategory.icon.trim() || "📁",
            },
        });
        const created = data.category;
        if (data.success && created) {
            setCategories((prev) => [...prev, created]);
            set("categoryIds", [...values.categoryIds, created.id]);
            setNewCategory(null);
        } else {
            toast(data.message || "Could not create the category", "error");
        }
    };

    const metaTitleLength = values.metaTitle.length;
    const metaDescriptionLength = values.metaDescription.length;

    return (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-5">
                <Card className="space-y-5">
                    <Field label="Title" htmlFor="article-title">
                        <input
                            id="article-title"
                            type="text"
                            value={values.title}
                            onChange={(e) => setTitle(e.target.value)}
                            className={`${inputClass} text-lg font-medium`}
                            placeholder="What someone would search for"
                        />
                    </Field>
                    <Field
                        label="URL slug"
                        htmlFor="article-slug"
                        hint="Lowercase letters, numbers and hyphens."
                    >
                        <input
                            id="article-slug"
                            type="text"
                            value={values.slug}
                            onChange={(e) =>
                                set(
                                    "slug",
                                    e.target.value
                                        .toLowerCase()
                                        .replace(/[^a-z0-9-]/g, "-"),
                                )
                            }
                            className={`${inputClass} font-mono text-sm`}
                            placeholder="article-url-slug"
                        />
                    </Field>
                    <Field
                        label="Excerpt"
                        htmlFor="article-excerpt"
                        hint="Shown in article lists and search results."
                    >
                        <textarea
                            id="article-excerpt"
                            rows={2}
                            value={values.excerpt}
                            onChange={(e) => set("excerpt", e.target.value)}
                            className={inputClass}
                            placeholder="One or two sentences summarising the article"
                        />
                    </Field>
                </Card>
                <Card>
                    <Field label="Content">
                        <MarkdownEditor
                            value={values.content}
                            onChange={(content) => set("content", content)}
                            placeholder="Write the article in Markdown…"
                        />
                    </Field>
                </Card>
            </div>

            <div className="space-y-5">
                {sidebarTop}
                <Card className="space-y-4">
                    <h2 className="font-medium text-white">Details</h2>
                    <Field label="Type" htmlFor="article-type">
                        <select
                            id="article-type"
                            value={values.articleType}
                            onChange={(e) =>
                                set(
                                    "articleType",
                                    e.target.value as ArticleType,
                                )
                            }
                            className={inputClass}
                        >
                            {ARTICLE_TYPES.map((type) => (
                                <option key={type.value} value={type.value}>
                                    {type.label}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field
                        label="Primary category"
                        htmlFor="article-category"
                        hint="Used in the article's URL."
                    >
                        <select
                            id="article-category"
                            value={values.categoryId}
                            onChange={(e) => {
                                const id = e.target.value;
                                onChange({
                                    ...values,
                                    categoryId: id,
                                    categoryIds:
                                        id && !values.categoryIds.includes(id)
                                            ? [...values.categoryIds, id]
                                            : values.categoryIds,
                                });
                            }}
                            className={inputClass}
                        >
                            <option value="">No category</option>
                            {categories.map((category) => (
                                <option key={category.id} value={category.id}>
                                    {category.icon} {category.name}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <label className="flex items-center gap-2 text-sm text-gray-300">
                        <input
                            type="checkbox"
                            checked={values.allowComments}
                            onChange={(e) =>
                                set("allowComments", e.target.checked)
                            }
                            className="rounded border-gray-600 bg-gray-800 text-blue-600"
                        />
                        Allow comments
                    </label>
                </Card>

                <Card className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-medium text-white">Categories</h2>
                        {canCreateTaxonomy && newCategory === null && (
                            <button
                                type="button"
                                onClick={() =>
                                    setNewCategory({ name: "", icon: "" })
                                }
                                className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
                            >
                                <Plus className="h-3.5 w-3.5" /> New
                            </button>
                        )}
                    </div>
                    {newCategory && (
                        <div className="flex gap-2">
                            <input
                                value={newCategory.icon}
                                onChange={(e) =>
                                    setNewCategory({
                                        ...newCategory,
                                        icon: e.target.value,
                                    })
                                }
                                maxLength={2}
                                placeholder="📁"
                                aria-label="Category icon"
                                className={`${inputClass} w-14 text-center`}
                            />
                            <input
                                value={newCategory.name}
                                onChange={(e) =>
                                    setNewCategory({
                                        ...newCategory,
                                        name: e.target.value,
                                    })
                                }
                                onKeyDown={(e) =>
                                    e.key === "Enter" &&
                                    (e.preventDefault(), createCategory())
                                }
                                placeholder="Category name"
                                aria-label="Category name"
                                className={inputClass}
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={createCategory}
                                className="text-sm text-blue-400 hover:text-blue-300"
                            >
                                Add
                            </button>
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {categories.map((category) => (
                            <Chip
                                key={category.id}
                                selected={values.categoryIds.includes(
                                    category.id,
                                )}
                                onClick={() =>
                                    set(
                                        "categoryIds",
                                        toggle(values.categoryIds, category.id),
                                    )
                                }
                            >
                                {category.icon} {category.name}
                            </Chip>
                        ))}
                    </div>
                </Card>

                <Card className="space-y-3">
                    <div className="flex items-center justify-between">
                        <h2 className="font-medium text-white">Tags</h2>
                        {canCreateTaxonomy && newTag === null && (
                            <button
                                type="button"
                                onClick={() => setNewTag("")}
                                className="inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
                            >
                                <Plus className="h-3.5 w-3.5" /> New
                            </button>
                        )}
                    </div>
                    {newTag !== null && (
                        <div className="flex gap-2">
                            <input
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={(e) =>
                                    e.key === "Enter" &&
                                    (e.preventDefault(), createTag())
                                }
                                placeholder="Tag name"
                                aria-label="Tag name"
                                className={inputClass}
                                autoFocus
                            />
                            <button
                                type="button"
                                onClick={createTag}
                                className="text-sm text-blue-400 hover:text-blue-300"
                            >
                                Add
                            </button>
                        </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                        {tags.map((tag) => (
                            <Chip
                                key={tag.id}
                                selected={values.tagIds.includes(tag.id)}
                                onClick={() =>
                                    set("tagIds", toggle(values.tagIds, tag.id))
                                }
                            >
                                {tag.name}
                            </Chip>
                        ))}
                        {tags.length === 0 && (
                            <p className="text-sm text-gray-500">
                                No tags yet.
                            </p>
                        )}
                    </div>
                </Card>

                <Card className="space-y-4">
                    <h2 className="font-medium text-white">Search engines</h2>
                    <Field
                        label="Meta title"
                        htmlFor="meta-title"
                        hint={`${metaTitleLength}/60 · defaults to the title`}
                    >
                        <input
                            id="meta-title"
                            value={values.metaTitle}
                            onChange={(e) => set("metaTitle", e.target.value)}
                            maxLength={60}
                            className={inputClass}
                        />
                    </Field>
                    <Field
                        label="Meta description"
                        htmlFor="meta-description"
                        hint={`${metaDescriptionLength}/160 · defaults to the excerpt`}
                    >
                        <textarea
                            id="meta-description"
                            rows={3}
                            value={values.metaDescription}
                            onChange={(e) =>
                                set("metaDescription", e.target.value)
                            }
                            maxLength={160}
                            className={inputClass}
                        />
                    </Field>
                </Card>
            </div>
        </div>
    );
}
