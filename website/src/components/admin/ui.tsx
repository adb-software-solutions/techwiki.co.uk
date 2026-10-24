"use client";

import type { WikiUser } from "@/lib/auth/types";
import { LoaderCircle } from "lucide-react";
import {
    createContext,
    useCallback,
    useContext,
    useState,
    type ReactNode,
} from "react";

export function isModeratorUser(user: WikiUser | null): boolean {
    return Boolean(
        user && (user.canModerate || user.isStaff || user.isSuperuser),
    );
}

export function isAdminUser(user: WikiUser | null): boolean {
    return Boolean(user && (user.isStaff || user.isSuperuser));
}

export function canPublishUser(user: WikiUser | null): boolean {
    return Boolean(user && (user.canPublishDirectly || isModeratorUser(user)));
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "success";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
    primary: "bg-blue-600 text-white hover:bg-blue-500",
    secondary:
        "border border-gray-600 bg-gray-800 text-gray-100 hover:border-gray-500 hover:bg-gray-700",
    ghost: "text-gray-300 hover:bg-gray-800 hover:text-white",
    danger: "bg-red-600 text-white hover:bg-red-500",
    success: "bg-emerald-600 text-white hover:bg-emerald-500",
};

export function buttonClass(
    variant: ButtonVariant = "primary",
    size: "sm" | "md" = "md",
): string {
    const sizing = size === "sm" ? "px-3 py-1.5 text-sm" : "px-4 py-2 text-sm";
    return `inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-50 ${sizing} ${BUTTON_VARIANTS[variant]}`;
}

export const inputClass =
    "w-full rounded-lg border border-gray-600 bg-gray-900/60 px-3 py-2 text-gray-100 placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none";

export function PageHeader({
    title,
    description,
    actions,
    eyebrow,
}: {
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    eyebrow?: ReactNode;
}) {
    return (
        <div className="mb-6 flex flex-col gap-4 border-b border-gray-700/60 pb-5 md:flex-row md:items-end md:justify-between">
            <div className="min-w-0">
                {eyebrow && (
                    <div className="mb-1 text-sm text-gray-400">{eyebrow}</div>
                )}
                <h1 className="truncate text-2xl font-semibold text-white">
                    {title}
                </h1>
                {description && (
                    <p className="mt-1 text-sm text-gray-400">{description}</p>
                )}
            </div>
            {actions && (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {actions}
                </div>
            )}
        </div>
    );
}

export function Card({
    children,
    className = "",
    padded = true,
}: {
    children: ReactNode;
    className?: string;
    padded?: boolean;
}) {
    return (
        <div
            className={`rounded-xl border border-gray-700/60 bg-gray-900/40 ${padded ? "p-5" : ""} ${className}`}
        >
            {children}
        </div>
    );
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
    draft: { label: "Draft", className: "bg-gray-700/60 text-gray-200" },
    pending_review: {
        label: "Pending review",
        className: "bg-yellow-500/15 text-yellow-300",
    },
    changes_requested: {
        label: "Changes requested",
        className: "bg-orange-500/15 text-orange-300",
    },
    approved: { label: "Approved", className: "bg-cyan-500/15 text-cyan-300" },
    published: {
        label: "Published",
        className: "bg-emerald-500/15 text-emerald-300",
    },
    archived: { label: "Archived", className: "bg-red-500/15 text-red-300" },
};

export function statusLabel(status: string): string {
    return STATUS_STYLES[status]?.label ?? status.replace(/_/g, " ");
}

export function StatusBadge({ status }: { status: string }) {
    const style = STATUS_STYLES[status] ?? STATUS_STYLES.draft;
    return (
        <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${style.className}`}
        >
            {statusLabel(status)}
        </span>
    );
}

export function SourceBadge({ source }: { source?: string }) {
    if (source !== "authoring") return null;
    return (
        <span className="inline-flex items-center rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs font-medium whitespace-nowrap text-indigo-300">
            Automation
        </span>
    );
}

export function LoadingState({ label = "Loading…" }: { label?: string }) {
    return (
        <div className="flex min-h-[240px] items-center justify-center gap-3 text-gray-400">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            <span className="text-sm">{label}</span>
        </div>
    );
}

export function EmptyState({
    icon,
    title,
    description,
    action,
}: {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
}) {
    return (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-700 px-6 py-14 text-center">
            {icon && <div className="mb-3 text-gray-500">{icon}</div>}
            <h3 className="font-medium text-white">{title}</h3>
            {description && (
                <p className="mt-1 max-w-md text-sm text-gray-400">
                    {description}
                </p>
            )}
            {action && <div className="mt-5">{action}</div>}
        </div>
    );
}

export function AccessDenied({ what }: { what: string }) {
    return (
        <EmptyState
            title="You don't have access to this page"
            description={`${what} is only available to moderators and administrators.`}
        />
    );
}

const RELATIVE_UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
    ["year", 31536000],
    ["month", 2592000],
    ["week", 604800],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
];

export function timeAgo(value: string | null | undefined): string {
    if (!value) return "—";
    const seconds = (new Date(value).getTime() - Date.now()) / 1000;
    const format = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
    for (const [unit, size] of RELATIVE_UNITS) {
        if (Math.abs(seconds) >= size) {
            return format.format(Math.round(seconds / size), unit);
        }
    }
    return "just now";
}

type Toast = { id: number; message: string; tone: "success" | "error" };

const ToastContext = createContext<
    (message: string, tone?: Toast["tone"]) => void
>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const show = useCallback(
        (message: string, tone: Toast["tone"] = "success") => {
            const id = Date.now() + Math.random();
            setToasts((current) => [...current, { id, message, tone }]);
            setTimeout(
                () =>
                    setToasts((current) =>
                        current.filter((toast) => toast.id !== id),
                    ),
                4000,
            );
        },
        [],
    );
    return (
        <ToastContext.Provider value={show}>
            {children}
            <div
                className="pointer-events-none fixed right-4 bottom-4 z-[60] flex flex-col gap-2"
                aria-live="polite"
            >
                {toasts.map((toast) => (
                    <div
                        key={toast.id}
                        className={`pointer-events-auto rounded-lg px-4 py-3 text-sm shadow-lg ${toast.tone === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
                    >
                        {toast.message}
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}

export function useToast() {
    return useContext(ToastContext);
}
