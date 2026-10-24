"use client";

import { adminApi } from "@/components/admin/api";
import { slugify } from "@/components/admin/ArticleForm";
import {
    AccessDenied,
    buttonClass,
    Card,
    EmptyState,
    inputClass,
    isModeratorUser,
    LoadingState,
    PageHeader,
    useToast,
} from "@/components/admin/ui";
import { SiteLink } from "@/components/wiki/SiteLink";
import { useAuth } from "@/lib/auth";
import { EyeOff, FolderTree, Pencil, Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";

interface AdminCategory {
    id: string;
    name: string;
    slug: string;
    description: string;
    icon: string;
    order: number;
    parent_id: string | null;
    is_active: boolean;
    full_path: string;
    article_count: number;
    total_articles: number;
}

interface CategoryDraft {
    name: string;
    slug: string;
    description: string;
    icon: string;
    order: number;
    parent_id: string;
    is_active: boolean;
}

const EMPTY: CategoryDraft = {
    name: "",
    slug: "",
    description: "",
    icon: "",
    order: 0,
    parent_id: "",
    is_active: true,
};

type Result = { success: boolean; message?: string };

/** Parents before children, each level in display order. */
function ordered(categories: AdminCategory[]) {
    const rows: { category: AdminCategory; depth: number }[] = [];
    const walk = (parent: string | null, depth: number) => {
        for (const category of categories.filter(
            (item) => item.parent_id === parent,
        )) {
            rows.push({ category, depth });
            walk(category.id, depth + 1);
        }
    };
    walk(null, 0);
    return rows;
}

export default function CategoriesPage() {
    const { user } = useAuth();
    const toast = useToast();
    const allowed = isModeratorUser(user);
    const [categories, setCategories] = useState<AdminCategory[] | null>(null);
    const [editing, setEditing] = useState<string | "new" | null>(null);
    const [draft, setDraft] = useState<CategoryDraft>(EMPTY);
    const [slugTouched, setSlugTouched] = useState(false);
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        const data = await adminApi<Result & { categories: AdminCategory[] }>(
            "/api/wiki/admin/categories",
        );
        setCategories(data.success ? data.categories : []);
    }, []);

    useEffect(() => {
        if (allowed) load().catch(() => setCategories([]));
    }, [allowed, load]);

    if (!allowed) return <AccessDenied what="Category management" />;

    const startNew = () => {
        setEditing("new");
        setDraft(EMPTY);
        setSlugTouched(false);
    };

    const startEdit = (category: AdminCategory) => {
        setEditing(category.id);
        setSlugTouched(true);
        setDraft({
            name: category.name,
            slug: category.slug,
            description: category.description,
            icon: category.icon,
            order: category.order,
            parent_id: category.parent_id ?? "",
            is_active: category.is_active,
        });
    };

    const save = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        try {
            const result = await adminApi<Result>(
                editing === "new"
                    ? "/api/wiki/admin/categories"
                    : `/api/wiki/admin/categories/${editing}`,
                {
                    method: editing === "new" ? "POST" : "PUT",
                    body: { ...draft, parent_id: draft.parent_id || null },
                },
            );
            if (result.success) {
                toast(result.message || "Category saved");
                setEditing(null);
                await load();
            } else {
                toast(result.message || "Could not save the category", "error");
            }
        } catch {
            toast("Could not save the category", "error");
        } finally {
            setSaving(false);
        }
    };

    const remove = async (category: AdminCategory) => {
        if (!window.confirm(`Delete “${category.name}”? This can't be undone.`))
            return;
        const result = await adminApi<Result>(
            `/api/wiki/admin/categories/${category.id}`,
            { method: "DELETE" },
        ).catch(() => null);
        if (result?.success) {
            toast("Category deleted");
            if (editing === category.id) setEditing(null);
            await load();
        } else {
            toast(result?.message || "Could not delete the category", "error");
        }
    };

    const set = <K extends keyof CategoryDraft>(
        key: K,
        value: CategoryDraft[K],
    ) => setDraft((current) => ({ ...current, [key]: value }));

    // A category can't move under itself or its descendants.
    const blocked = new Set<string>();
    if (editing && editing !== "new" && categories) {
        const collect = (id: string) => {
            blocked.add(id);
            categories
                .filter((item) => item.parent_id === id)
                .forEach((child) => collect(child.id));
        };
        collect(editing);
    }

    const rows = categories ? ordered(categories) : [];

    return (
        <div>
            <PageHeader
                title="Categories"
                description="Organise articles into sections. Hidden categories keep their articles but disappear from navigation."
                actions={
                    <button
                        type="button"
                        onClick={startNew}
                        className={buttonClass("primary")}
                    >
                        <Plus className="h-4 w-4" />
                        New category
                    </button>
                }
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
                <div className="min-w-0">
                    {!categories ? (
                        <LoadingState />
                    ) : rows.length === 0 ? (
                        <EmptyState
                            icon={<FolderTree className="h-8 w-8" />}
                            title="No categories yet"
                            description="Create one to start organising articles."
                        />
                    ) : (
                        <Card padded={false} className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="text-left text-xs text-gray-500">
                                    <tr className="border-b border-gray-700/60">
                                        <th className="px-5 py-3 font-medium">
                                            Category
                                        </th>
                                        <th className="px-3 py-3 text-right font-medium">
                                            Published
                                        </th>
                                        <th className="px-3 py-3 text-right font-medium">
                                            All articles
                                        </th>
                                        <th className="px-3 py-3 text-right font-medium">
                                            Order
                                        </th>
                                        <th className="px-5 py-3" />
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-800">
                                    {rows.map(({ category, depth }) => (
                                        <tr
                                            key={category.id}
                                            className={
                                                editing === category.id
                                                    ? "bg-blue-600/10"
                                                    : "hover:bg-gray-800/30"
                                            }
                                        >
                                            <td className="px-5 py-3">
                                                <div
                                                    className="flex items-center gap-3"
                                                    style={{
                                                        paddingLeft: depth * 20,
                                                    }}
                                                >
                                                    <span className="w-6 text-center text-lg">
                                                        {category.icon || "📁"}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2 font-medium text-white">
                                                            {category.name}
                                                            {!category.is_active && (
                                                                <span className="inline-flex items-center gap-1 rounded-full bg-gray-700/60 px-2 py-0.5 text-xs font-normal text-gray-300">
                                                                    <EyeOff className="h-3 w-3" />
                                                                    Hidden
                                                                </span>
                                                            )}
                                                        </div>
                                                        <SiteLink
                                                            href={`/${category.full_path}`}
                                                            className="text-xs text-gray-500 hover:text-blue-300"
                                                        >
                                                            /
                                                            {category.full_path}
                                                        </SiteLink>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-right text-gray-200 tabular-nums">
                                                {category.article_count}
                                            </td>
                                            <td className="px-3 py-3 text-right text-gray-400 tabular-nums">
                                                {category.total_articles}
                                            </td>
                                            <td className="px-3 py-3 text-right text-gray-400 tabular-nums">
                                                {category.order}
                                            </td>
                                            <td className="px-5 py-3">
                                                <div className="flex justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            startEdit(category)
                                                        }
                                                        className={buttonClass(
                                                            "ghost",
                                                            "sm",
                                                        )}
                                                        aria-label={`Edit ${category.name}`}
                                                    >
                                                        <Pencil className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            remove(category)
                                                        }
                                                        disabled={
                                                            category.total_articles >
                                                            0
                                                        }
                                                        title={
                                                            category.total_articles >
                                                            0
                                                                ? "Move its articles first, or hide it instead"
                                                                : undefined
                                                        }
                                                        className={buttonClass(
                                                            "ghost",
                                                            "sm",
                                                        )}
                                                        aria-label={`Delete ${category.name}`}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </Card>
                    )}
                </div>

                <div>
                    {editing === null ? (
                        <Card className="text-sm text-gray-400">
                            Select a category to edit it, or create a new one.
                        </Card>
                    ) : (
                        <Card className="xl:sticky xl:top-8">
                            <form onSubmit={save} className="space-y-4">
                                <h2 className="font-semibold text-white">
                                    {editing === "new"
                                        ? "New category"
                                        : `Edit ${draft.name || "category"}`}
                                </h2>
                                <div className="grid grid-cols-[72px_1fr] gap-3">
                                    <label className="block text-sm">
                                        <span className="mb-1 block text-gray-300">
                                            Icon
                                        </span>
                                        <input
                                            value={draft.icon}
                                            onChange={(e) =>
                                                set("icon", e.target.value)
                                            }
                                            className={`${inputClass} text-center`}
                                            placeholder="📁"
                                            maxLength={50}
                                        />
                                    </label>
                                    <label className="block text-sm">
                                        <span className="mb-1 block text-gray-300">
                                            Name
                                        </span>
                                        <input
                                            value={draft.name}
                                            onChange={(e) => {
                                                set("name", e.target.value);
                                                if (!slugTouched)
                                                    set(
                                                        "slug",
                                                        slugify(e.target.value),
                                                    );
                                            }}
                                            className={inputClass}
                                            required
                                            maxLength={100}
                                            autoFocus
                                        />
                                    </label>
                                </div>
                                <label className="block text-sm">
                                    <span className="mb-1 block text-gray-300">
                                        URL slug
                                    </span>
                                    <input
                                        value={draft.slug}
                                        onChange={(e) => {
                                            setSlugTouched(true);
                                            set("slug", e.target.value);
                                        }}
                                        className={inputClass}
                                        maxLength={100}
                                    />
                                    {editing !== "new" && (
                                        <span className="mt-1 block text-xs text-yellow-300/80">
                                            Changing the slug changes the URL of
                                            every article in this category.
                                        </span>
                                    )}
                                </label>
                                <label className="block text-sm">
                                    <span className="mb-1 block text-gray-300">
                                        Description
                                    </span>
                                    <textarea
                                        value={draft.description}
                                        onChange={(e) =>
                                            set("description", e.target.value)
                                        }
                                        className={inputClass}
                                        rows={3}
                                    />
                                </label>
                                <div className="grid grid-cols-[1fr_96px] gap-3">
                                    <label className="block text-sm">
                                        <span className="mb-1 block text-gray-300">
                                            Parent
                                        </span>
                                        <select
                                            value={draft.parent_id}
                                            onChange={(e) =>
                                                set("parent_id", e.target.value)
                                            }
                                            className={inputClass}
                                        >
                                            <option value="">
                                                None (top level)
                                            </option>
                                            {rows
                                                .filter(
                                                    ({ category }) =>
                                                        !blocked.has(
                                                            category.id,
                                                        ),
                                                )
                                                .map(({ category, depth }) => (
                                                    <option
                                                        key={category.id}
                                                        value={category.id}
                                                    >
                                                        {"— ".repeat(depth)}
                                                        {category.name}
                                                    </option>
                                                ))}
                                        </select>
                                    </label>
                                    <label className="block text-sm">
                                        <span className="mb-1 block text-gray-300">
                                            Order
                                        </span>
                                        <input
                                            type="number"
                                            value={draft.order}
                                            onChange={(e) =>
                                                set(
                                                    "order",
                                                    Number(e.target.value) || 0,
                                                )
                                            }
                                            className={inputClass}
                                        />
                                    </label>
                                </div>
                                <label className="flex items-start gap-3 text-sm">
                                    <input
                                        type="checkbox"
                                        checked={draft.is_active}
                                        onChange={(e) =>
                                            set("is_active", e.target.checked)
                                        }
                                        className="mt-0.5 h-4 w-4 rounded border-gray-600 bg-gray-900"
                                    />
                                    <span>
                                        <span className="block text-gray-200">
                                            Visible on the site
                                        </span>
                                        <span className="text-xs text-gray-500">
                                            Hidden categories don&apos;t appear
                                            in navigation or the article form.
                                        </span>
                                    </span>
                                </label>
                                <div className="flex justify-end gap-2 border-t border-gray-700/60 pt-4">
                                    <button
                                        type="button"
                                        onClick={() => setEditing(null)}
                                        className={buttonClass("ghost")}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={saving}
                                        className={buttonClass("primary")}
                                    >
                                        {saving
                                            ? "Saving…"
                                            : editing === "new"
                                              ? "Create category"
                                              : "Save changes"}
                                    </button>
                                </div>
                            </form>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    );
}
