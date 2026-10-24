import { getCategories } from "@/lib/wiki/api";
import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Categories | TechWiki",
    description: "Browse all documentation and tutorial categories on TechWiki",
};

// Revalidate every 60 seconds
export const revalidate = 60;

export default async function CategoriesPage() {
    const categoriesRes = await getCategories().catch(() => null);
    const categories = categoriesRes?.success ? categoriesRes.categories : [];

    // Build category tree
    const rootCategories = categories.filter((c) => !c.parent_id);
    const childCategories = categories.filter((c) => c.parent_id);

    const getCategoryChildren = (parentId: string) =>
        childCategories.filter((c) => c.parent_id === parentId);

    return (
        <div>
            <div className="mb-8">
                <h1 className="mb-2 text-3xl font-bold text-white">
                    Categories
                </h1>
                <p className="text-gray-400">
                    Browse all documentation and tutorial categories
                </p>
            </div>

            {categories.length > 0 ? (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {rootCategories.map((category) => {
                        const children = getCategoryChildren(category.id);

                        return (
                            <div
                                key={category.id}
                                className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-6"
                            >
                                <Link
                                    href={`/${category.slug}`}
                                    className="group block"
                                >
                                    <div className="mb-3 flex items-center gap-3">
                                        {category.icon && (
                                            <span className="text-3xl">
                                                {category.icon}
                                            </span>
                                        )}
                                        <h2 className="text-xl font-semibold text-white transition-colors group-hover:text-blue-400">
                                            {category.name}
                                        </h2>
                                    </div>
                                    {category.description && (
                                        <p className="mb-3 text-sm text-gray-400">
                                            {category.description}
                                        </p>
                                    )}
                                    <div className="text-sm text-gray-500">
                                        {category.article_count} article
                                        {category.article_count !== 1
                                            ? "s"
                                            : ""}
                                    </div>
                                </Link>

                                {/* Subcategories */}
                                {children.length > 0 && (
                                    <div className="mt-4 border-t border-gray-700 pt-4">
                                        <h3 className="mb-2 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                                            Subcategories
                                        </h3>
                                        <ul className="space-y-1">
                                            {children.map((child) => (
                                                <li key={child.id}>
                                                    <Link
                                                        href={`/${child.slug}`}
                                                        className="flex items-center justify-between py-1 text-sm text-gray-300 hover:text-white"
                                                    >
                                                        <span className="flex items-center gap-2">
                                                            {child.icon && (
                                                                <span>
                                                                    {child.icon}
                                                                </span>
                                                            )}
                                                            {child.name}
                                                        </span>
                                                        <span className="text-gray-500">
                                                            {
                                                                child.article_count
                                                            }
                                                        </span>
                                                    </Link>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            ) : (
                <div className="py-12 text-center">
                    <div className="mb-4 text-4xl">📁</div>
                    <p className="text-gray-400">No categories yet</p>
                </div>
            )}
        </div>
    );
}
