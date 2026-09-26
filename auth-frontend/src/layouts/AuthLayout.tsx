import LogoComponent from "@/components/logo/LogoComponent";
import {Outlet} from "react-router-dom";

export default function AuthLayout() {
    return (
        <div className="flex min-h-screen flex-col justify-center bg-white px-6 py-12 lg:px-8 dark:bg-slate-900">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                {/* Logo */}
                <div className="flex justify-center">
                    <LogoComponent className="h-16 w-auto" />
                </div>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white px-6 py-8 shadow-sm ring-1 ring-slate-900/5 sm:rounded-lg sm:px-12 dark:bg-slate-800">
                    <Outlet />
                </div>
            </div>
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
