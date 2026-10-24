import { SiteLink as Link } from "@/components/wiki/SiteLink";

export default function NotFound() {
    return (
        <main className="flex min-h-screen items-center justify-center bg-[#1c324a] px-4 text-gray-200">
            <div className="text-center">
                <p className="text-sm font-semibold tracking-widest text-blue-300 uppercase">
                    404
                </p>
                <h1 className="mt-3 text-4xl font-bold text-white">
                    Page not found
                </h1>
                <p className="mt-4 text-gray-400">
                    The page you requested does not exist.
                </p>
                <Link
                    href="/"
                    className="mt-8 inline-flex rounded-lg bg-blue-600 px-5 py-3 font-medium text-white transition-colors hover:bg-blue-500"
                >
                    Return home
                </Link>
            </div>
        </main>
    );
}
