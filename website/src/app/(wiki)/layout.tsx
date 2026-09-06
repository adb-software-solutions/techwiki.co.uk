import { SearchBox } from "@/components/wiki/SearchBox";
import { UserMenu } from "@/components/wiki/UserMenu";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { getCategories } from "@/lib/wiki/api";
import Link from "next/link";

interface WikiLayoutProps {
    children: React.ReactNode;
}

export default async function WikiLayout({ children }: WikiLayoutProps) {
    const categoriesResponse = await getCategories().catch(() => ({
        success: false,
        categories: [],
    }));
    const categories = categoriesResponse.success
        ? categoriesResponse.categories
        : [];

    return (
        <AuthProvider>
            <div className="min-h-screen bg-[#1c324a]">
                {/* Navigation */}
                <nav className="sticky top-0 z-50 border-b border-gray-700/50 bg-[#1c324a]/95 backdrop-blur">
                    <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                        <div className="flex h-16 items-center justify-between">
                            {/* Logo */}
                            <Link
                                href="/"
                                className="flex items-center gap-2 text-xl font-bold text-white"
                            >
                                <span className="text-2xl">📚</span>
                                TechWiki
                            </Link>

                            {/* Search */}
                            <div className="mx-8 hidden max-w-lg flex-1 md:block">
                                <SearchBox />
                            </div>

                            {/* Navigation links */}
                            <div className="flex items-center gap-6">
                                <Link
                                    href="/categories"
                                    className="hidden text-gray-300 transition-colors hover:text-white sm:block"
                                >
                                    Categories
                                </Link>
                                <Link
                                    href="/blog"
                                    className="hidden text-gray-300 transition-colors hover:text-white sm:block"
                                >
                                    Blog
                                </Link>
                                <UserMenu />
                            </div>
                        </div>

                        {/* Mobile search */}
                        <div className="pb-4 md:hidden">
                            <SearchBox />
                        </div>
                    </div>
                </nav>

                {/* Sidebar + Content */}
                <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                    <div className="flex gap-8">
                        {/* Sidebar */}
                        <aside className="hidden w-64 shrink-0 lg:block">
                            <div className="sticky top-24">
                                <h2 className="mb-4 text-sm font-semibold tracking-wider text-gray-400 uppercase">
                                    Categories
                                </h2>
                                <nav className="space-y-1">
                                    {categories.map((category) => (
                                        <Link
                                            key={category.id}
                                            href={`/${category.slug}`}
                                            className="flex items-center gap-2 rounded-lg px-3 py-2 text-gray-300 transition-colors hover:bg-gray-800/50 hover:text-white"
                                        >
                                            {category.icon && (
                                                <span className="text-lg">
                                                    {category.icon}
                                                </span>
                                            )}
                                            <span>{category.name}</span>
                                            <span className="ml-auto text-xs text-gray-500">
                                                {category.article_count}
                                            </span>
                                        </Link>
                                    ))}
                                </nav>
                            </div>
                        </aside>

                        {/* Main content */}
                        <main className="min-w-0 flex-1">{children}</main>
                    </div>
                </div>

                {/* Footer */}
                <footer className="mt-16 border-t border-gray-700/50">
                    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
                        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
                            <div className="flex items-center gap-2 text-gray-400">
                                <span className="text-lg">📚</span>
                                <span>TechWiki</span>
                                <span className="text-gray-600">•</span>
                                <span className="text-sm">
                                    Documentation and tutorials for developers
                                </span>
                            </div>
                            <div className="flex items-center gap-6 text-sm text-gray-400">
                                <Link
                                    href="/about"
                                    className="hover:text-white"
                                >
                                    About
                                </Link>
                                <Link
                                    href="/contribute"
                                    className="hover:text-white"
                                >
                                    Contribute
                                </Link>
                                <a
                                    href="https://github.com/adb-software-solutions"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-white"
                                >
                                    Built by ADB Software Solutions
                                </a>
                            </div>
                        </div>
                    </div>
                </footer>
            </div>
        </AuthProvider>
    );
}
