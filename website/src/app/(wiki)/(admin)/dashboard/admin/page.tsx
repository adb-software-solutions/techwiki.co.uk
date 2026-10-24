"use client";

import { useAuth } from "@/lib/auth";
import {
    ChartBarIcon,
    DocumentTextIcon,
    MagnifyingGlassIcon,
    ShieldCheckIcon,
    UserGroupIcon,
    UserMinusIcon,
    UsersIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface AdminOverview {
    users: {
        total: number;
        active: number;
        banned: number;
        moderators: number;
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
    per_page: number;
    total_pages: number;
}

async function getCsrfToken(): Promise<string> {
    const response = await fetch(`${API_BASE}/api/csrf`, {
        credentials: "include",
    });
    if (!response.ok)
        throw new Error("Could not initialize a secure admin request");
    const data: { csrf_token: string } = await response.json();
    return data.csrf_token;
}

const roles = [
    { value: "reader", label: "Reader" },
    { value: "contributor", label: "Contributor" },
    { value: "trusted_contributor", label: "Trusted contributor" },
    { value: "moderator", label: "Moderator" },
    { value: "admin", label: "Admin" },
];

export default function AdminDashboardPage() {
    const { user, isLoading: authLoading, refreshUser } = useAuth();
    const isAdmin = Boolean(user?.isStaff || user?.isSuperuser);
    const [overview, setOverview] = useState<AdminOverview | null>(null);
    const [users, setUsers] = useState<AdminUser[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    const [page, setPage] = useState(1);
    const [searchInput, setSearchInput] = useState("");
    const [search, setSearch] = useState("");
    const [status, setStatus] = useState("all");
    const [role, setRole] = useState("all");
    const [loading, setLoading] = useState(true);
    const [actionUserId, setActionUserId] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [notice, setNotice] = useState<string | null>(null);

    const fetchOverview = useCallback(async () => {
        const response = await fetch(`${API_BASE}/api/admin/overview`, {
            credentials: "include",
        });
        if (!response.ok) throw new Error("Could not load admin overview");
        setOverview(await response.json());
    }, []);

    const fetchUsers = useCallback(async () => {
        const params = new URLSearchParams({
            page: String(page),
            per_page: "20",
            status,
            role,
        });
        if (search) params.set("search", search);

        const response = await fetch(
            `${API_BASE}/api/admin/users?${params.toString()}`,
            { credentials: "include" },
        );
        if (!response.ok) throw new Error("Could not load users");
        const data: UsersResponse = await response.json();
        setUsers(data.users);
        setTotal(data.total);
        setTotalPages(data.total_pages);
    }, [page, role, search, status]);

    useEffect(() => {
        if (authLoading || !isAdmin) {
            if (!authLoading) setLoading(false);
            return;
        }

        setLoading(true);
        setError(null);
        Promise.all([fetchOverview(), fetchUsers()])
            .catch((err: unknown) =>
                setError(
                    err instanceof Error ? err.message : "Admin request failed",
                ),
            )
            .finally(() => setLoading(false));
    }, [authLoading, fetchOverview, fetchUsers, isAdmin]);

    async function updateUser(
        target: AdminUser,
        changes: { role?: string; is_active?: boolean },
    ) {
        setActionUserId(target.id);
        setError(null);
        setNotice(null);
        try {
            const csrfToken = await getCsrfToken();
            const response = await fetch(
                `${API_BASE}/api/admin/users/${target.id}`,
                {
                    method: "PATCH",
                    credentials: "include",
                    headers: {
                        "Content-Type": "application/json",
                        "X-CSRFToken": csrfToken,
                    },
                    body: JSON.stringify(changes),
                },
            );
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || "Could not update user");
            }
            setUsers((current) =>
                current.map((item) =>
                    item.id === target.id ? data.user : item,
                ),
            );
            if (target.id === user?.id) {
                await refreshUser();
            } else {
                await fetchOverview();
            }
            setNotice(`${target.email} was updated`);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Could not update user",
            );
        } finally {
            setActionUserId(null);
        }
    }

    async function removeUser(target: AdminUser) {
        const confirmed = window.confirm(
            `Permanently remove ${target.email}? This cannot be undone.`,
        );
        if (!confirmed) return;

        setActionUserId(target.id);
        setError(null);
        setNotice(null);
        try {
            const csrfToken = await getCsrfToken();
            const response = await fetch(
                `${API_BASE}/api/admin/users/${target.id}`,
                {
                    method: "DELETE",
                    credentials: "include",
                    headers: { "X-CSRFToken": csrfToken },
                },
            );
            const data = await response.json();
            if (!response.ok) {
                throw new Error(data.detail || "Could not remove user");
            }
            if (target.id === user?.id) {
                await refreshUser();
                return;
            }
            await Promise.all([fetchOverview(), fetchUsers()]);
            setNotice(data.message);
        } catch (err) {
            setError(
                err instanceof Error ? err.message : "Could not remove user",
            );
        } finally {
            setActionUserId(null);
        }
    }

    function submitSearch(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        setPage(1);
        setSearch(searchInput.trim());
    }

    if (authLoading || loading) {
        return (
            <div className="flex min-h-[420px] items-center justify-center">
                <div className="h-9 w-9 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
            </div>
        );
    }

    if (!isAdmin) {
        return (
            <div className="mx-auto max-w-xl rounded-xl border border-red-700/50 bg-red-950/20 p-8 text-center">
                <ShieldCheckIcon className="mx-auto h-12 w-12 text-red-400" />
                <h1 className="mt-4 text-2xl font-bold text-white">
                    Admin access required
                </h1>
                <p className="mt-2 text-gray-400">
                    This dashboard is restricted to staff administrators.
                </p>
                <Link
                    href="/dashboard"
                    className="mt-6 inline-flex rounded-lg bg-gray-700 px-4 py-2 text-white hover:bg-gray-600"
                >
                    Back to dashboard
                </Link>
            </div>
        );
    }

    const statCards = overview
        ? [
              {
                  label: "Total users",
                  value: overview.users.total,
                  detail: `${overview.users.new_last_30_days} joined in 30 days`,
                  icon: UsersIcon,
              },
              {
                  label: "Active users",
                  value: overview.users.active,
                  detail: `${overview.users.banned} banned`,
                  icon: UserGroupIcon,
              },
              {
                  label: "Moderators",
                  value: overview.users.moderators,
                  detail: "Can review submissions",
                  icon: ShieldCheckIcon,
              },
              {
                  label: "Articles",
                  value: overview.content.total_articles,
                  detail: `${overview.content.pending_articles} pending review`,
                  icon: DocumentTextIcon,
              },
              {
                  label: "Views today",
                  value: overview.traffic.page_views_today,
                  detail: `${overview.traffic.page_views_last_30_days} in 30 days`,
                  icon: ChartBarIcon,
              },
          ]
        : [];

    return (
        <div className="space-y-8">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <p className="text-sm font-medium text-blue-400">
                        Administration
                    </p>
                    <h1 className="mt-1 text-3xl font-bold text-white">
                        Admin dashboard
                    </h1>
                    <p className="mt-2 text-gray-400">
                        Manage access, moderation roles, and site activity.
                    </p>
                </div>
                <Link
                    href="/dashboard/analytics"
                    className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-200 transition-colors hover:bg-gray-800"
                >
                    <ChartBarIcon className="h-5 w-5" />
                    Detailed analytics
                </Link>
            </div>

            {error && (
                <div
                    role="alert"
                    className="rounded-lg border border-red-700/50 bg-red-950/30 p-4 text-red-300"
                >
                    {error}
                </div>
            )}
            {notice && (
                <div
                    role="status"
                    className="rounded-lg border border-green-700/50 bg-green-950/30 p-4 text-green-300"
                >
                    {notice}
                </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {statCards.map(({ label, value, detail, icon: Icon }) => (
                    <div
                        key={label}
                        className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-5"
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-gray-400">{label}</p>
                            <Icon className="h-5 w-5 text-blue-400" />
                        </div>
                        <p className="mt-3 text-3xl font-bold text-white">
                            {value.toLocaleString()}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">{detail}</p>
                    </div>
                ))}
            </div>

            <section className="overflow-hidden rounded-xl border border-gray-700/50 bg-gray-800/40">
                <div className="border-b border-gray-700/60 p-5">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                        <div>
                            <h2 className="text-xl font-semibold text-white">
                                Users
                            </h2>
                            <p className="text-sm text-gray-400">
                                {total.toLocaleString()} matching account
                                {total === 1 ? "" : "s"}
                            </p>
                        </div>
                        <div className="flex flex-col gap-3 sm:flex-row">
                            <form onSubmit={submitSearch} className="relative">
                                <MagnifyingGlassIcon className="pointer-events-none absolute top-2.5 left-3 h-5 w-5 text-gray-500" />
                                <input
                                    value={searchInput}
                                    onChange={(event) =>
                                        setSearchInput(event.target.value)
                                    }
                                    placeholder="Search users"
                                    aria-label="Search users"
                                    className="w-full rounded-lg border border-gray-600 bg-gray-900 py-2 pr-3 pl-10 text-sm text-white outline-none focus:border-blue-500 sm:w-64"
                                />
                            </form>
                            <select
                                value={status}
                                onChange={(event) => {
                                    setPage(1);
                                    setStatus(event.target.value);
                                }}
                                aria-label="Filter by account status"
                                className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
                            >
                                <option value="all">All statuses</option>
                                <option value="active">Active</option>
                                <option value="banned">Banned</option>
                            </select>
                            <select
                                value={role}
                                onChange={(event) => {
                                    setPage(1);
                                    setRole(event.target.value);
                                }}
                                aria-label="Filter by role"
                                className="rounded-lg border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white"
                            >
                                <option value="all">All roles</option>
                                {roles.map((item) => (
                                    <option key={item.value} value={item.value}>
                                        {item.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-sm">
                        <thead className="bg-gray-900/60 text-xs tracking-wide text-gray-500 uppercase">
                            <tr>
                                <th className="px-5 py-3 font-medium">User</th>
                                <th className="px-5 py-3 font-medium">Role</th>
                                <th className="px-5 py-3 font-medium">
                                    Status
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Joined
                                </th>
                                <th className="px-5 py-3 font-medium">
                                    Articles
                                </th>
                                <th className="px-5 py-3 text-right font-medium">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-700/50">
                            {users.map((item) => {
                                const busy = actionUserId === item.id;
                                return (
                                    <tr
                                        key={item.id}
                                        className="hover:bg-gray-800/60"
                                    >
                                        <td className="px-5 py-4">
                                            <p className="font-medium text-white">
                                                {item.first_name}{" "}
                                                {item.last_name}
                                            </p>
                                            <p className="text-gray-400">
                                                {item.email}
                                            </p>
                                            <div className="mt-1 flex gap-1">
                                                {item.is_superuser && (
                                                    <span className="rounded bg-purple-500/15 px-2 py-0.5 text-xs text-purple-300">
                                                        Superuser
                                                    </span>
                                                )}
                                                {item.is_staff &&
                                                    !item.is_superuser && (
                                                        <span className="rounded bg-blue-500/15 px-2 py-0.5 text-xs text-blue-300">
                                                            Staff
                                                        </span>
                                                    )}
                                                {!item.email_verified && (
                                                    <span className="rounded bg-yellow-500/15 px-2 py-0.5 text-xs text-yellow-300">
                                                        Unverified
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <select
                                                value={item.role}
                                                disabled={busy}
                                                onChange={(event) =>
                                                    updateUser(item, {
                                                        role: event.target
                                                            .value,
                                                    })
                                                }
                                                aria-label={`Role for ${item.email}`}
                                                className="rounded-md border border-gray-600 bg-gray-900 px-2 py-1.5 text-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
                                            >
                                                {roles.map((roleOption) => (
                                                    <option
                                                        key={roleOption.value}
                                                        value={roleOption.value}
                                                    >
                                                        {roleOption.label}
                                                    </option>
                                                ))}
                                            </select>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span
                                                className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                                                    item.is_active
                                                        ? "bg-green-500/15 text-green-300"
                                                        : "bg-red-500/15 text-red-300"
                                                }`}
                                            >
                                                {item.is_active
                                                    ? "Active"
                                                    : "Banned"}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4 text-gray-400">
                                            {new Date(
                                                item.date_joined,
                                            ).toLocaleDateString("en-GB")}
                                        </td>
                                        <td className="px-5 py-4 text-gray-300">
                                            {item.articles_count}
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        updateUser(item, {
                                                            is_active:
                                                                !item.is_active,
                                                        })
                                                    }
                                                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                                        item.is_active
                                                            ? "bg-yellow-500/15 text-yellow-300 hover:bg-yellow-500/25"
                                                            : "bg-green-500/15 text-green-300 hover:bg-green-500/25"
                                                    }`}
                                                >
                                                    {item.is_active
                                                        ? "Ban"
                                                        : "Restore"}
                                                </button>
                                                <button
                                                    type="button"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        removeUser(item)
                                                    }
                                                    aria-label={`Remove ${item.email}`}
                                                    className="rounded-md bg-red-500/15 p-1.5 text-red-300 transition-colors hover:bg-red-500/25 disabled:cursor-not-allowed disabled:opacity-40"
                                                >
                                                    <UserMinusIcon className="h-4 w-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {users.length === 0 && (
                        <div className="p-12 text-center text-gray-400">
                            No users match these filters.
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-between border-t border-gray-700/60 px-5 py-4">
                    <p className="text-sm text-gray-500">
                        Page {page} of {totalPages}
                    </p>
                    <div className="flex gap-2">
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => setPage((current) => current - 1)}
                            className="rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-40"
                        >
                            Previous
                        </button>
                        <button
                            type="button"
                            disabled={page >= totalPages}
                            onClick={() => setPage((current) => current + 1)}
                            className="rounded-md border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700 disabled:opacity-40"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </section>
        </div>
    );
}
