"use client";

import {
    isAdminUser,
    isModeratorUser,
    LoadingState,
    ToastProvider,
} from "@/components/admin/ui";
import { SiteLink } from "@/components/wiki/SiteLink";
import { useAuth } from "@/lib/auth";
import {
    ChartColumn,
    CircleUser,
    ExternalLink,
    FileText,
    FolderTree,
    Inbox,
    LayoutDashboard,
    LogOut,
    Menu,
    Shield,
    SquarePen,
    X,
    type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface NavItem {
    href: string;
    label: string;
    icon: LucideIcon;
    exact?: boolean;
    badge?: number;
}

function useQueueCount(enabled: boolean, pathname: string): number {
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (!enabled) return;
        fetch(`${API_BASE}/api/wiki/moderation/queue?tab=pending&per_page=1`, {
            credentials: "include",
        })
            .then((res) => res.json())
            .then((data) => {
                if (data.success) {
                    setCount(data.counts.pending + data.counts.automation);
                }
            })
            .catch(() => {});
        // Refresh after navigating, e.g. back from a review decision.
    }, [enabled, pathname]);
    return count;
}

function NavLink({
    item,
    active,
    onNavigate,
}: {
    item: NavItem;
    active: boolean;
    onNavigate: () => void;
}) {
    const Icon = item.icon;
    return (
        <Link
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                active
                    ? "bg-blue-600/15 font-medium text-white"
                    : "text-gray-400 hover:bg-gray-800 hover:text-white"
            }`}
        >
            <Icon
                className={`h-4 w-4 ${active ? "text-blue-400" : ""}`}
                aria-hidden
            />
            <span className="flex-1">{item.label}</span>
            {item.badge ? (
                <span className="rounded-full bg-yellow-500/20 px-2 py-0.5 text-xs font-semibold text-yellow-300">
                    {item.badge}
                </span>
            ) : null}
        </Link>
    );
}

export function AdminShell({ children }: { children: ReactNode }) {
    const { user, isAuthenticated, isLoading, getLoginUrl, getLogoutUrl } =
        useAuth();
    const pathname = usePathname();
    const [drawerOpen, setDrawerOpen] = useState(false);
    const moderator = isModeratorUser(user);
    const queueCount = useQueueCount(moderator, pathname);

    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            window.location.assign(getLoginUrl(window.location.href));
        }
    }, [isLoading, isAuthenticated, getLoginUrl]);

    if (isLoading || !isAuthenticated || !user) {
        return (
            <div className="min-h-screen bg-[#16283b]">
                <LoadingState label="Checking your session…" />
            </div>
        );
    }

    const sections: { title: string; items: NavItem[] }[] = [
        {
            title: "Content",
            items: [
                {
                    href: "/dashboard",
                    label: "Overview",
                    icon: LayoutDashboard,
                    exact: true,
                },
                {
                    href: "/dashboard/articles",
                    label: "My articles",
                    icon: FileText,
                },
                { href: "/new", label: "New article", icon: SquarePen },
            ],
        },
    ];
    if (moderator) {
        sections.push({
            title: "Review",
            items: [
                {
                    href: "/dashboard/moderation",
                    label: "Moderation queue",
                    icon: Inbox,
                    badge: queueCount,
                },
                {
                    href: "/dashboard/categories",
                    label: "Categories",
                    icon: FolderTree,
                },
            ],
        });
    }
    if (isAdminUser(user)) {
        sections.push({
            title: "Site",
            items: [
                {
                    href: "/dashboard/analytics",
                    label: "Analytics",
                    icon: ChartColumn,
                },
                {
                    href: "/dashboard/admin",
                    label: "Administration",
                    icon: Shield,
                },
            ],
        });
    }
    sections.push({
        title: "Account",
        items: [
            { href: "/dashboard/profile", label: "Profile", icon: CircleUser },
        ],
    });

    const isActive = (item: NavItem) =>
        item.exact
            ? pathname === item.href
            : pathname === item.href || pathname.startsWith(`${item.href}/`);
    const displayName =
        `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim() || user.email;

    const sidebar = (
        <div className="flex h-full flex-col">
            <div className="flex h-16 items-center justify-between border-b border-gray-700/60 px-5">
                <Link
                    href="/dashboard"
                    className="flex items-center gap-2 font-semibold text-white"
                    onClick={() => setDrawerOpen(false)}
                >
                    <span className="text-xl">📚</span>
                    TechWiki
                    <span className="rounded bg-gray-700/70 px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-gray-300 uppercase">
                        Admin
                    </span>
                </Link>
                <button
                    type="button"
                    className="rounded p-1 text-gray-400 hover:text-white lg:hidden"
                    onClick={() => setDrawerOpen(false)}
                    aria-label="Close navigation"
                >
                    <X className="h-5 w-5" />
                </button>
            </div>
            <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-5">
                {sections.map((section) => (
                    <div key={section.title}>
                        <div className="mb-2 px-3 text-xs font-semibold tracking-wider text-gray-500 uppercase">
                            {section.title}
                        </div>
                        <div className="space-y-1">
                            {section.items.map((item) => (
                                <NavLink
                                    key={item.href}
                                    item={item}
                                    active={isActive(item)}
                                    onNavigate={() => setDrawerOpen(false)}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </nav>
            <div className="space-y-1 border-t border-gray-700/60 p-3">
                <SiteLink
                    href="/"
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white"
                >
                    <ExternalLink className="h-4 w-4" aria-hidden />
                    View site
                </SiteLink>
                <a
                    href={getLogoutUrl()}
                    className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-gray-800 hover:text-white"
                >
                    <LogOut className="h-4 w-4" aria-hidden />
                    Log out
                </a>
                <div className="mt-2 truncate px-3 text-xs text-gray-500">
                    Signed in as {displayName}
                </div>
            </div>
        </div>
    );

    return (
        <ToastProvider>
            <div className="min-h-screen bg-[#16283b] text-gray-200">
                <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-gray-700/60 bg-[#12212f] lg:block">
                    {sidebar}
                </aside>

                {drawerOpen && (
                    <div className="fixed inset-0 z-50 lg:hidden">
                        <div
                            className="absolute inset-0 bg-black/60"
                            onClick={() => setDrawerOpen(false)}
                        />
                        <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] border-r border-gray-700/60 bg-[#12212f]">
                            {sidebar}
                        </aside>
                    </div>
                )}

                <div className="lg:pl-64">
                    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-gray-700/60 bg-[#16283b]/95 px-4 backdrop-blur lg:hidden">
                        <button
                            type="button"
                            className="rounded-lg p-2 text-gray-300 hover:bg-gray-800"
                            onClick={() => setDrawerOpen(true)}
                            aria-label="Open navigation"
                        >
                            <Menu className="h-5 w-5" />
                        </button>
                        <span className="font-semibold text-white">
                            TechWiki Admin
                        </span>
                    </header>
                    <main className="px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
                        {children}
                    </main>
                </div>
            </div>
        </ToastProvider>
    );
}
