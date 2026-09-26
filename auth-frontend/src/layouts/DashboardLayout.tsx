import LogoComponent from "@/components/logo/LogoComponent";
import {useAuth} from "@/contexts/AuthContext";
import {Navigate, Outlet, useLocation} from "react-router-dom";

export default function DashboardLayout() {
    const {user, loading} = useAuth();
    const location = useLocation();

    if (loading) {
        return (
            <div className="flex min-h-screen items-center justify-center bg-white dark:bg-slate-900">
                <div className="border-brand h-8 w-8 animate-spin rounded-full border-4 border-t-transparent" />
            </div>
        );
    }

    if (!user) {
        // Redirect to login with current path as next
        const next = encodeURIComponent(location.pathname + location.search);
        return <Navigate to={`/login?next=${next}`} replace />;
    }

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
            {/* Header */}
            <header className="border-b border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800">
                <div className="mx-auto flex h-20 max-w-9/12 items-center justify-between px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center gap-2">
                        <LogoComponent className="h-16 w-auto" />
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                            {user.email}
                        </span>
                        <a
                            href="/logout"
                            className="text-brand dark:text-brand text-sm font-medium hover:underline"
                        >
                            Sign out
                        </a>
                    </div>
                </div>
            </header>

            {/* Main content */}
            <main className="mx-auto max-w-9/12 px-4 py-8 sm:px-6 lg:px-8">
                <Outlet />
            </main>
            <footer className="px-4 py-6 text-center text-sm text-slate-600 dark:text-slate-400">
                <a
                    href={`${(import.meta.env.VITE_APP_URL || "https://techwiki.co.uk").replace(/\/$/, "")}/privacy`}
                    className="underline underline-offset-4 hover:text-blue-500"
                >
                    Privacy Policy
                </a>
            </footer>
        </div>
    );
}
