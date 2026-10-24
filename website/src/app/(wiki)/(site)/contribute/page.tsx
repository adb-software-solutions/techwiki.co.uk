import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Contribute | TechWiki",
    description:
        "Learn how to contribute to TechWiki - write articles, suggest edits, and help improve our documentation.",
};

export default function ContributePage() {
    return (
        <div className="mx-auto max-w-3xl">
            <h1 className="mb-6 text-4xl font-bold text-white">
                Contribute to TechWiki
            </h1>

            <p className="mb-8 text-xl text-gray-300">
                TechWiki is a community-driven project and we welcome
                contributions from everyone. Here&apos;s how you can help make
                TechWiki better.
            </p>

            {/* Ways to contribute */}
            <section className="mb-12">
                <h2 className="mb-6 text-2xl font-bold text-white">
                    Ways to Contribute
                </h2>

                <div className="space-y-6">
                    <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-6">
                        <div className="flex items-start gap-4">
                            <div className="text-3xl">✍️</div>
                            <div>
                                <h3 className="mb-2 text-lg font-semibold text-white">
                                    Write New Articles
                                </h3>
                                <p className="mb-4 text-gray-400">
                                    Share your knowledge by writing
                                    documentation, tutorials, or guides. Whether
                                    it&apos;s a quick how-to or an in-depth
                                    technical guide, your contribution helps
                                    others learn.
                                </p>
                                <Link
                                    href="/new"
                                    className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm text-white transition-colors hover:bg-blue-700"
                                >
                                    Write an article
                                </Link>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-6">
                        <div className="flex items-start gap-4">
                            <div className="text-3xl">📝</div>
                            <div>
                                <h3 className="mb-2 text-lg font-semibold text-white">
                                    Suggest Edits
                                </h3>
                                <p className="mb-4 text-gray-400">
                                    Found a typo, outdated information, or
                                    something that could be explained better?
                                    Use the &quot;Suggest edit&quot; button on
                                    any article to propose changes.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-xl border border-gray-700/50 bg-gray-800/50 p-6">
                        <div className="flex items-start gap-4">
                            <div className="text-3xl">🐛</div>
                            <div>
                                <h3 className="mb-2 text-lg font-semibold text-white">
                                    Report Issues
                                </h3>
                                <p className="mb-4 text-gray-400">
                                    Found a bug or have a feature request? Let
                                    us know by opening an issue on our GitHub
                                    repository.
                                </p>
                                <a
                                    href="https://github.com/adb-software-solutions/techwiki.co.uk/issues"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-block rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
                                >
                                    Report an issue
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Contribution guidelines */}
            <section className="mb-12">
                <h2 className="mb-6 text-2xl font-bold text-white">
                    Contribution Guidelines
                </h2>

                <div className="prose prose-invert max-w-none">
                    <h3 className="mb-3 text-lg font-semibold text-white">
                        Writing Style
                    </h3>
                    <ul className="mb-6 list-disc space-y-2 pl-5 text-gray-400">
                        <li>Write in clear, concise language</li>
                        <li>Use headings to organize content</li>
                        <li>Include code examples where appropriate</li>
                        <li>Add screenshots for visual guides</li>
                        <li>Link to related articles and external resources</li>
                    </ul>

                    <h3 className="mb-3 text-lg font-semibold text-white">
                        Content Requirements
                    </h3>
                    <ul className="mb-6 list-disc space-y-2 pl-5 text-gray-400">
                        <li>
                            Articles must be original or properly attributed
                        </li>
                        <li>
                            Technical information should be accurate and
                            up-to-date
                        </li>
                        <li>
                            Include version numbers for software-specific
                            content
                        </li>
                        <li>Test all code examples before publishing</li>
                    </ul>

                    <h3 className="mb-3 text-lg font-semibold text-white">
                        Review Process
                    </h3>
                    <p className="mb-4 text-gray-400">
                        All new contributions are reviewed by our moderation
                        team before being published. This helps ensure quality
                        and consistency across the wiki. Reviews typically take
                        1-2 business days.
                    </p>
                </div>
            </section>

            {/* User roles */}
            <section className="mb-12">
                <h2 className="mb-6 text-2xl font-bold text-white">
                    User Roles
                </h2>

                <div className="space-y-4">
                    <div className="rounded-lg border border-gray-700/50 bg-gray-800/30 p-4">
                        <h3 className="mb-1 font-semibold text-white">
                            Contributor
                        </h3>
                        <p className="text-sm text-gray-400">
                            Default role for new users. Can write articles that
                            go through moderation before publishing.
                        </p>
                    </div>
                    <div className="rounded-lg border border-gray-700/50 bg-gray-800/30 p-4">
                        <h3 className="mb-1 font-semibold text-white">
                            Trusted Contributor
                        </h3>
                        <p className="text-sm text-gray-400">
                            Earned through quality contributions. Can publish
                            articles directly without moderation.
                        </p>
                    </div>
                    <div className="rounded-lg border border-gray-700/50 bg-gray-800/30 p-4">
                        <h3 className="mb-1 font-semibold text-white">
                            Moderator
                        </h3>
                        <p className="text-sm text-gray-400">
                            Reviews and approves articles from contributors. Can
                            edit any article and manage content.
                        </p>
                    </div>
                </div>
            </section>

            {/* Get started */}
            <section className="rounded-xl border border-blue-500/30 bg-gradient-to-br from-blue-600/20 to-purple-600/20 p-8">
                <h2 className="mb-4 text-2xl font-bold text-white">
                    Ready to Get Started?
                </h2>
                <p className="mb-6 text-gray-300">
                    Create an account to start contributing to TechWiki. It only
                    takes a minute!
                </p>
                <div className="flex flex-wrap gap-4">
                    <Link
                        href="/new"
                        className="rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700"
                    >
                        Write Your First Article
                    </Link>
                    <Link
                        href="/"
                        className="rounded-lg border border-gray-600 px-6 py-3 text-gray-300 transition-colors hover:border-gray-500 hover:text-white"
                    >
                        Browse Articles
                    </Link>
                </div>
            </section>
        </div>
    );
}
