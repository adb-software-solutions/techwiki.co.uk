import { SearchBox, SearchResults } from "@/components/wiki/SearchBox";
import { getCategories } from "@/lib/wiki/api";
import { Metadata } from "next";
import { Suspense } from "react";

interface SearchPageProps {
    searchParams: Promise<{ q?: string }>;
}

export async function generateMetadata({
    searchParams,
}: SearchPageProps): Promise<Metadata> {
    const { q } = await searchParams;

    return {
        title: q ? `Search: ${q} | TechWiki` : "Search | TechWiki",
        description: "Search TechWiki for documentation, tutorials, and guides",
        robots: {
            index: false,
            follow: true,
            googleBot: {
                index: false,
                follow: true,
            },
        },
    };
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
    const { q } = await searchParams;
    const categoriesRes = await getCategories().catch(() => null);
    const categories = categoriesRes?.success ? categoriesRes.categories : [];

    return (
        <div>
            <div className="mb-8">
                <h1 className="mb-4 text-3xl font-bold text-white">Search</h1>
                <SearchBox className="max-w-2xl" />
            </div>

            {q && (
                <Suspense
                    fallback={
                        <div className="py-12 text-center text-gray-400">
                            Searching...
                        </div>
                    }
                >
                    <SearchResults categories={categories} />
                </Suspense>
            )}

            {!q && (
                <div className="py-12 text-center">
                    <div className="mb-4 text-4xl">🔍</div>
                    <p className="text-gray-400">
                        Enter a search term to find articles
                    </p>
                </div>
            )}
        </div>
    );
}
