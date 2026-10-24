"use client";

import {
    AccessDenied,
    buttonClass,
    Card,
    EmptyState,
    inputClass,
    isAdminUser,
    LoadingState,
    PageHeader,
    timeAgo,
    useToast,
} from "@/components/admin/ui";
import { useAuth } from "@/lib/auth";
import { Search, Users } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface AdminOverview {
    users: {
        total: number;
        active: number;
        banned: number;
        moderators: number;
        admins: number;
        new_last_30_days: number;
    };
    content: {
        total_articles: number;
        published_articles: number;
        pending_articles: number;
    };
    traffic: {
        page_views_today: number;
        page_views_last_30_days: number;
    };
}

interface AdminUser {
    id: string;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    is_active: boolean;
    is_staff: boolean;
    is_superuser: boolean;
    email_verified: boolean;
    date_joined: string;
    last_login: string | null;
    articles_count: number;
}

interface UsersResponse {
    users: AdminUser[];
    total: number;
    page: number;
    total_pages: number;
}

const ROLES = [
    { value: "reader", label: "Reader" },
    { value: "contributor", label: "Contributor" },
    { value: "trusted_contributor", label: "Trusted contributor" },
    { value: "moderator", label: "Moderator" },
    { value: "admin", label: "Admin" },
];

const number = new Intl.NumberFormat("en-GB");

/** Admin user endpoints are CSRF-protected; fetch a token per change. */
async function adminRequest<T>(
    path: string,
    method: "PATCH" | "DELETE",
    body?: unknown,
): Promise<T> {
    const tokenResponse = await fetch(`${API_BASE}/api/csrf`, {
        credentials: "include",
    });
    const { csrf_token: token } = (await tokenResponse.json()) as {
        csrf_token: string;
    };
    const response = await fetch(`${API_BASE}${path}`, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json", "X-CSRFToken": token },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || "Request failed");
    return data as T;
}

async function getJson<T>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
        credentials: "include",
    });
    if (!response.ok) throw new Error("Request failed");
    return response.json() as Promise<T>;
}

function Tile({
    label,
    value,
    detail,
    href,
}: {
    label: string;
    value: number;
    detail: string;
    href?: string;
}) {
    const body = (
        <Card
            className={
                href
                    ? "h-full transition-colors hover:border-gray-600"
                    : "h-full"
            }
        >
            <div className="text-sm text-gray-400">{label}</div>
            <div className="mt-1 text-3xl font-semibold text-white tabular-nums">
                {number.format(value)}
            </div>
            <div className="mt-1 text-xs text-gray-500">{detail}</div>
        </Card>
    );
    return href ? <Link href={href}>{body}</Link> : body;
}

export default function AdministrationPage() {
    const { user, refreshUser } = useAuth();
    const toast = useToast();
    const admin = isAdminUser(user);
    const [overview, setOverview] = useState<AdminOverview | null>(null);
    const [result, setResult] = useState<UsersResponse | null>(null);
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("all");
    const [role, setRole] = useState("all");
    const [page, setPage] = useState(1);
    const [busyId, setBusyId] = useState<string | null>(null);

    const loadOverview = useCallback(() => {
        getJson<AdminOverview>("/api/admin/overview")
            .then(setOverview)
            .catch(() => {});
    }, []);

    const loadUsers = useCallback(() => {
        const params = new URLSearchParams({
            search,
            status,
            role,
            page: String(page),
            per_page: "25",
        });
        getJson<UsersResponse>(`/api/admin/users?${params}`)
            .then(setResult)
            .catch(() =>
                setResult({ users: [], total: 0, page: 1, total_pages: 1 }),
            );
    }, [search, status, role, page]);

    useEffect(() => {
        if (admin) loadOverview();
    }, [admin, loadOverview]);

    useEffect(() => {
        if (admin) loadUsers();
    }, [admin, loadUsers]);

    // Search as you type, without a request per keystroke.
    useEffect(() => {
        const timer = setTimeout(() => {
            setSearch(searchInput.trim());
            setPage(1);
        }, 300);
        return () => clearTimeout(timer);
    }, [searchInput]);

    if (!admin) return <AccessDenied what="Administration" />;

    const update = async (
        target: AdminUser,
        changes: { role?: string; is_active?: boolean },
    ) => {
        setBusyId(target.id);
        try {
            const data = await adminRequest<{ user: AdminUser }>(
                `/api/admin/users/${target.id}`,
                "PATCH",
                changes,
            );
            setResult((current) =>
                current
                    ? {
                          ...current,
                          users: current.users.map((item) =>
                              item.id === target.id ? data.user : item,
                          ),
                      }
                    : current,
            );
            toast(`Updated ${target.email}`);
            loadOverview();
            if (target.id === user?.id) await refreshUser();
        } catch (error) {
            toast(
                error instanceof Error
                    ? error.message
                    : "Could not update user",
                "error",
            );
        } finally {
            setBusyId(null);
        }
    };

    const remove = async (target: AdminUser) => {
        if (
            !window.confirm(
                `Permanently delete ${target.email}? Their articles stay but lose their author. This can't be undone.`,
            )
        )
            return;
        setBusyId(target.id);
        try {
            const data = await adminRequest<{ message: string }>(
                `/api/admin/users/${target.id}`,
                "DELETE",
            );
            toast(data.message);
            loadUsers();
            loadOverview();
        } catch (error) {
            toast(
                error instanceof Error
                    ? error.message
                    : "Could not delete user",
                "error",
            );
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div>
            <PageHeader
                title="Administration"
                description="People, roles and access across TechWiki."
            />

            {overview ? (
                <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3 2xl:grid-cols-5">
                    <Tile
                        label="Users"
                        value={overview.users.total}
                        detail={`${overview.users.new_last_30_days} joined in the last 30 days`}
                    />
                    <Tile
                        label="Banned"
                        value={overview.users.banned}
                        detail={`${overview.users.active} active accounts`}
                    />
                    <Tile
                        label="Moderators and admins"
                        value={
                            overview.users.moderators + overview.users.admins
                        }
                        detail={`${overview.users.admins} admin${overview.users.admins === 1 ? "" : "s"}`}
                    />
                    <Tile
                        label="Articles"
                        value={overview.content.total_articles}
                        detail={`${overview.content.published_articles} published · ${overview.content.pending_articles} pending`}
                        href="/dashboard/moderation"
                    />
                    <Tile
                        label="Page views today"
                        value={overview.traffic.page_views_today}
                        detail={`${number.format(overview.traffic.page_views_last_30_days)} in 30 days`}
                        href="/dashboard/analytics"
                    />
                </div>
            ) : (
                <LoadingState />
            )}

            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center">
                <div className="relative flex-1">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-500" />
                    <input
                        type="search"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="Search by name or email"
                        className={`${inputClass} pl-9`}
                        aria-label="Search users"
                    />
                </div>
                <select
                    value={status}
                    onChange={(e) => {
                        setStatus(e.target.value);
                        setPage(1);
                    }}
                    className={`${inputClass} md:w-44`}
                    aria-label="Filter by status"
                >
                    <option value="all">All statuses</option>
                    <option value="active">Active</option>
                    <option value="banned">Banned</option>
                </select>
                <select
                    value={role}
                    onChange={(e) => {
                        setRole(e.target.value);
                        setPage(1);
                    }}
                    className={`${inputClass} md:w-52`}
                    aria-label="Filter by role"
                >
                    <option value="all">All roles</option>
                    {ROLES.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
            </div>

            {!result ? (
                <LoadingState />
            ) : result.users.length === 0 ? (
                <EmptyState
                    icon={<Users className="h-8 w-8" />}
                    title="No users match"
                    description="Try a different search or filter."
                />
            ) : (
                <Card padded={false} className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-sm">
                        <thead className="text-left text-xs text-gray-500">
                            <tr className="border-b border-gray-700/60">
                                <th className="px-5 py-3 font-medium">User</th>
                                <th className="px-3 py-3 font-medium">Role</th>
                                <th className="px-3 py-3 text-right font-medium">
                                    Articles
                                </th>
                                <th className="px-3 py-3 font-medium">
                                    Joined
                                </th>
                                <th className="px-3 py-3 font-medium">
                                    Last sign-in
                                </th>
                                <th className="px-5 py-3" />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {result.users.map((item) => {
                                const self = item.id === user?.id;
                                const busy = busyId === item.id;
                                const name =
                                    `${item.first_name} ${item.last_name}`.trim();
                                return (
                                    <tr
                                        key={item.id}
                                        className={
                                            item.is_active ? "" : "opacity-60"
                                        }
                                    >
                                        <td className="px-5 py-3">
                                            <div className="flex items-center gap-2 font-medium text-white">
                                                {name || item.email}
                                                {self && (
                                                    <span className="rounded-full bg-blue-500/15 px-2 py-0.5 text-xs font-normal text-blue-300">
                                                        You
                                                    </span>
                                                )}
                                                {!item.is_active && (
                                                    <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-normal text-red-300">
                                                        Banned
                                                    </span>
                                                )}
                                                {!item.email_verified && (
                                                    <span className="rounded-full bg-gray-700/60 px-2 py-0.5 text-xs font-normal text-gray-300">
                                                        Unverified
                                                    </span>
                                                )}
                                            </div>
                                            {name && (
                                                <div className="text-xs text-gray-500">
                                                    {item.email}
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-3 py-3">
                                            <select
                                                value={item.role}
                                                disabled={busy}
                                                onChange={(e) =>
                                                    update(item, {
                                                        role: e.target.value,
                                                    })
                                                }
                                                className="rounded-md border border-gray-700 bg-gray-900/60 px-2 py-1 text-sm text-gray-100"
                                                aria-label={`Role for ${item.email}`}
                                            >
                                                {ROLES.map((option) => (
                                                    <option
                                                        key={option.value}
                                                        value={option.value}
                                                    >
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-3 py-3 text-right text-gray-300 tabular-nums">
                                            {item.articles_count}
                                        </td>
                                        <td className="px-3 py-3 text-gray-400">
                                            {new Date(
                                                item.date_joined,
                                            ).toLocaleDateString("en-GB")}
                                        </td>
                                        <td className="px-3 py-3 text-gray-400">
                                            {item.last_login
                                                ? timeAgo(item.last_login)
                                                : "Never"}
                                        </td>
                                        <td className="px-5 py-3">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    disabled={busy || self}
                                                    onClick={() =>
                                                        update(item, {
                                                            is_active:
                                                                !item.is_active,
                                                        })
                                                    }
                                                    className={buttonClass(
                                                        "secondary",
                                                        "sm",
                                                    )}
                                                >
                                                    {item.is_active
                                                        ? "Ban"
                                                        : "Unban"}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy || self}
                                                    onClick={() => remove(item)}
                                                    className={buttonClass(
                                                        "danger",
                                                        "sm",
                                                    )}
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </Card>
            )}

            {result && result.total_pages > 1 && (
                <div className="mt-4 flex items-center justify-between text-sm text-gray-400">
                    <span>
                        {number.format(result.total)} users · page {result.page}{" "}
                        of {result.total_pages}
                    </span>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => setPage(page - 1)}
                            className={buttonClass("secondary", "sm")}
                        >
                            Previous
                        </button>
                        <button
                            type="button"
                            disabled={page >= result.total_pages}
                            onClick={() => setPage(page + 1)}
                            className={buttonClass("secondary", "sm")}
                        >
                            Next
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
