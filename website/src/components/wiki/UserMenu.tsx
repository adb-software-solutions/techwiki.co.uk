"use client";

import { useAuth } from "@/lib/auth";
import Image from "next/image";
import { SiteLink as Link } from "@/components/wiki/SiteLink";
import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const getPhotoUrl = (photo: string | null | undefined): string | null => {
    if (!photo) return null;
    if (photo.startsWith("http")) return photo;
    return `${API_BASE}${photo}`;
};

export function UserMenu() {
    const {
        user,
        isAuthenticated,
        isLoading,
        getLoginUrl,
        getSignupUrl,
        getLogoutUrl,
        getAccountUrl,
    } = useAuth();
    const [menuOpen, setMenuOpen] = useState(false);

    if (isLoading) {
        return (
            <div className="h-8 w-8 animate-pulse rounded-full bg-gray-700" />
        );
    }

    if (!isAuthenticated || !user) {
        return (
            <div className="flex items-center gap-3">
                <a
                    href={getLoginUrl()}
                    className="text-gray-300 transition-colors hover:text-white"
                >
                    Log in
                </a>
                <a
                    href={getSignupUrl()}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700"
                >
                    Sign up
                </a>
            </div>
        );
    }

    const initials =
        `${user.firstName?.charAt(0) || ""}${user.lastName?.charAt(0) || ""}`.toUpperCase() ||
        user.email.charAt(0).toUpperCase();
    const displayName = user.firstName
        ? `${user.firstName} ${user.lastName || ""}`
        : user.email;

    return (
        <div className="relative">
            <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 text-gray-300 transition-colors hover:text-white"
            >
                {getPhotoUrl(user.photo) ? (
                    <Image
                        src={getPhotoUrl(user.photo) || ""}
                        alt={displayName}
                        width={32}
                        height={32}
                        className="h-8 w-8 rounded-full object-cover"
                    />
                ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-600 text-sm font-medium text-white">
                        {initials}
                    </div>
                )}
                <span className="hidden max-w-[150px] truncate sm:block">
                    {displayName}
                </span>
                <svg
                    className={`h-4 w-4 transition-transform ${menuOpen ? "rotate-180" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                    />
                </svg>
            </button>

            {menuOpen && (
                <>
                    <div
                        className="fixed inset-0 z-40"
                        onClick={() => setMenuOpen(false)}
                    />
                    <div className="absolute right-0 z-50 mt-2 w-56 rounded-lg border border-gray-700 bg-gray-800 py-2 shadow-lg">
                        <div className="border-b border-gray-700 px-4 py-2">
                            <p className="truncate text-sm font-medium text-white">
                                {displayName}
                            </p>
                            <p className="truncate text-xs text-gray-400">
                                {user.email}
                            </p>
                            {(user.isStaff || user.isSuperuser) && (
                                <span className="mt-1 inline-block rounded bg-blue-600/20 px-2 py-0.5 text-xs text-blue-400">
                                    {user.isSuperuser ? "Admin" : "Staff"}
                                </span>
                            )}
                            {user.canModerate &&
                                !user.isStaff &&
                                !user.isSuperuser && (
                                    <span className="mt-1 inline-block rounded bg-green-600/20 px-2 py-0.5 text-xs text-green-400">
                                        Moderator
                                    </span>
                                )}
                        </div>

                        <div className="py-1">
                            <Link
                                href="/dashboard"
                                className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700/50 hover:text-white"
                                onClick={() => setMenuOpen(false)}
                            >
                                Dashboard
                            </Link>
                            {(user.isStaff || user.isSuperuser) && (
                                <Link
                                    href="/dashboard/admin"
                                    className="block px-4 py-2 text-sm text-blue-300 hover:bg-gray-700/50 hover:text-blue-200"
                                    onClick={() => setMenuOpen(false)}
                                >
                                    Admin Dashboard
                                </Link>
                            )}
                            <Link
                                href="/dashboard/articles"
                                className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700/50 hover:text-white"
                                onClick={() => setMenuOpen(false)}
                            >
                                My Articles
                            </Link>
                            <Link
                                href="/new"
                                className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700/50 hover:text-white"
                                onClick={() => setMenuOpen(false)}
                            >
                                Write New Article
                            </Link>
                            {user.canModerate && (
                                <Link
                                    href="/dashboard/moderation"
                                    className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700/50 hover:text-white"
                                    onClick={() => setMenuOpen(false)}
                                >
                                    Moderation Queue
                                </Link>
                            )}
                            {(user.isStaff || user.isModerator) && (
                                <Link
                                    href="/dashboard/categories"
                                    className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700/50 hover:text-white"
                                    onClick={() => setMenuOpen(false)}
                                >
                                    Manage Categories
                                </Link>
                            )}
                        </div>

                        <div className="border-t border-gray-700 py-1">
                            <a
                                href={getAccountUrl()}
                                className="block px-4 py-2 text-sm text-gray-300 hover:bg-gray-700/50 hover:text-white"
                            >
                                Account Settings
                            </a>
                            <a
                                href={getLogoutUrl()}
                                className="block px-4 py-2 text-sm text-red-400 hover:bg-gray-700/50 hover:text-red-300"
                            >
                                Log out
                            </a>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
