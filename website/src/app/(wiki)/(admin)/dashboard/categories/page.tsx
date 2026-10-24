"use client";

import { useAuth } from "@/lib/auth";
import type { Category } from "@/lib/wiki/types";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface CategoryFormData {
    name: string;
    slug: string;
    description: string;
    icon: string;
    parent_id: string;
}

export default function CategoriesManagementPage() {
    const { user, isAuthenticated, isLoading, getLoginUrl } = useAuth();
    const router = useRouter();
    const [categories, setCategories] = useState<Category[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState<CategoryFormData>({
        name: "",
        slug: "",
        description: "",
        icon: "",
        parent_id: "",
    });

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push(getLoginUrl("/dashboard/categories"));
        }
    }, [isLoading, isAuthenticated, router, getLoginUrl]);

    useEffect(() => {
        if (!isAuthenticated) return;
        fetchCategories();
    }, [isAuthenticated]);

    const fetchCategories = async () => {
        try {
            const res = await fetch(`${API_BASE}/api/wiki/categories`, {
                credentials: "include",
            });
            const data = await res.json();
            if (data.success) {
                setCategories(data.categories);
            }
        } catch (error) {
            console.error("Failed to fetch categories:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        try {
            const url = editingId
                ? `${API_BASE}/api/wiki/admin/categories/${editingId}`
                : `${API_BASE}/api/wiki/admin/categories`;

            const method = editingId ? "PUT" : "POST";

            const res = await fetch(url, {
                method,
                headers: {
                    "Content-Type": "application/json",
                },
                credentials: "include",
                body: JSON.stringify(formData),
            });

            const data = await res.json();

            if (data.success) {
                await fetchCategories();
                resetForm();
            } else {
                alert(data.message || "Failed to save category");
            }
        } catch (error) {
            console.error("Failed to save category:", error);
            alert("Failed to save category");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this category?")) {
            return;
        }

        try {
            const res = await fetch(
                `${API_BASE}/api/wiki/admin/categories/${id}`,
                {
                    method: "DELETE",
                    credentials: "include",
                },
            );

            const data = await res.json();

            if (data.success) {
                await fetchCategories();
            } else {
                alert(data.message || "Failed to delete category");
            }
        } catch (error) {
            console.error("Failed to delete category:", error);
            alert("Failed to delete category");
        }
    };

    const handleEdit = (category: Category) => {
        setEditingId(category.id);
        setFormData({
            name: category.name,
            slug: category.slug,
            description: category.description || "",
            icon: category.icon || "",
            parent_id: category.parent_id || "",
        });
        setShowForm(true);
    };

    const resetForm = () => {
        setFormData({
            name: "",
            slug: "",
            description: "",
            icon: "",
            parent_id: "",
        });
        setEditingId(null);
        setShowForm(false);
    };

    const handleNameChange = (name: string) => {
        setFormData({
            ...formData,
            name,
            slug: name
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, "-")
                .replace(/^-|-$/g, ""),
        });
    };

    if (isLoading || !isAuthenticated) {
        return (
            <div className="flex min-h-[400px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
        );
    }

    // Only allow staff/moderators
    if (!user?.isStaff && !user?.isModerator) {
        return (
            <div className="rounded-lg border border-red-700/50 bg-red-900/20 p-6">
                <h1 className="mb-2 text-xl font-bold text-white">
                    Access Denied
                </h1>
                <p className="text-gray-400">
                    You don't have permission to manage categories.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-white">
                        Manage Categories
                    </h1>
                    <p className="mt-1 text-gray-400">
                        Create and organize article categories
                    </p>
                </div>
                <button
                    onClick={() => setShowForm(!showForm)}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
                >
                    {showForm ? "Cancel" : "+ New Category"}
                </button>
            </div>

            {showForm && (
                <form
                    onSubmit={handleSubmit}
                    className="space-y-4 rounded-lg bg-gray-800/50 p-6"
                >
                    <h2 className="text-xl font-semibold text-white">
                        {editingId ? "Edit Category" : "Create New Category"}
                    </h2>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-300">
                                Name *
                            </label>
                            <input
                                type="text"
                                value={formData.name}
                                onChange={(e) =>
                                    handleNameChange(e.target.value)
                                }
                                required
                                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-300">
                                Slug *
                            </label>
                            <input
                                type="text"
                                value={formData.slug}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        slug: e.target.value,
                                    })
                                }
                                required
                                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="mb-1 block text-sm font-medium text-gray-300">
                            Description
                        </label>
                        <textarea
                            value={formData.description}
                            onChange={(e) =>
                                setFormData({
                                    ...formData,
                                    description: e.target.value,
                                })
                            }
                            rows={3}
                            className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                        />
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-300">
                                Icon (emoji)
                            </label>
                            <input
                                type="text"
                                value={formData.icon}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        icon: e.target.value,
                                    })
                                }
                                placeholder="📚"
                                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                            />
                        </div>

                        <div>
                            <label className="mb-1 block text-sm font-medium text-gray-300">
                                Parent Category
                            </label>
                            <select
                                value={formData.parent_id}
                                onChange={(e) =>
                                    setFormData({
                                        ...formData,
                                        parent_id: e.target.value,
                                    })
                                }
                                className="w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2 text-white focus:border-blue-500 focus:outline-none"
                            >
                                <option value="">None (Top Level)</option>
                                {categories
                                    .filter(
                                        (c) =>
                                            !c.parent_id && c.id !== editingId,
                                    )
                                    .map((cat) => (
                                        <option key={cat.id} value={cat.id}>
                                            {cat.name}
                                        </option>
                                    ))}
                            </select>
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="submit"
                            className="rounded-lg bg-blue-600 px-6 py-2 text-white transition-colors hover:bg-blue-700"
                        >
                            {editingId ? "Update" : "Create"}
                        </button>
                        <button
                            type="button"
                            onClick={resetForm}
                            className="rounded-lg bg-gray-700 px-6 py-2 text-white transition-colors hover:bg-gray-600"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}

            {loading ? (
                <div className="flex justify-center py-12">
                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
                </div>
            ) : (
                <div className="space-y-4">
                    {categories
                        .filter((c) => !c.parent_id)
                        .map((category) => {
                            const children = categories.filter(
                                (c) => c.parent_id === category.id,
                            );

                            return (
                                <div
                                    key={category.id}
                                    className="rounded-lg bg-gray-800/50 p-6"
                                >
                                    <div className="mb-4 flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            {category.icon && (
                                                <span className="text-2xl">
                                                    {category.icon}
                                                </span>
                                            )}
                                            <div>
                                                <h3 className="text-lg font-semibold text-white">
                                                    {category.name}
                                                </h3>
                                                <p className="text-sm text-gray-500">
                                                    {category.slug}
                                                </p>
                                                {category.description && (
                                                    <p className="mt-1 text-sm text-gray-400">
                                                        {category.description}
                                                    </p>
                                                )}
                                                <p className="mt-1 text-xs text-gray-500">
                                                    {category.article_count}{" "}
                                                    article
                                                    {category.article_count !==
                                                    1
                                                        ? "s"
                                                        : ""}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() =>
                                                    handleEdit(category)
                                                }
                                                className="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() =>
                                                    handleDelete(category.id)
                                                }
                                                className="rounded bg-red-600 px-3 py-1 text-sm text-white hover:bg-red-700"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </div>

                                    {children.length > 0 && (
                                        <div className="mt-4 border-t border-gray-700 pt-4">
                                            <h4 className="mb-2 text-sm font-medium text-gray-400">
                                                Subcategories:
                                            </h4>
                                            <div className="space-y-2">
                                                {children.map((child) => (
                                                    <div
                                                        key={child.id}
                                                        className="flex items-center justify-between rounded bg-gray-900/50 p-3"
                                                    >
                                                        <div className="flex items-center gap-2">
                                                            {child.icon && (
                                                                <span>
                                                                    {child.icon}
                                                                </span>
                                                            )}
                                                            <span className="text-white">
                                                                {child.name}
                                                            </span>
                                                            <span className="text-sm text-gray-500">
                                                                (
                                                                {
                                                                    child.article_count
                                                                }
                                                                )
                                                            </span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() =>
                                                                    handleEdit(
                                                                        child,
                                                                    )
                                                                }
                                                                className="rounded bg-blue-600 px-2 py-1 text-xs text-white hover:bg-blue-700"
                                                            >
                                                                Edit
                                                            </button>
                                                            <button
                                                                onClick={() =>
                                                                    handleDelete(
                                                                        child.id,
                                                                    )
                                                                }
                                                                className="rounded bg-red-600 px-2 py-1 text-xs text-white hover:bg-red-700"
                                                            >
                                                                Delete
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                </div>
            )}
        </div>
    );
}
