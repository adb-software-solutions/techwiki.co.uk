import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "About | TechWiki",
    description:
        "Learn about TechWiki - a community-driven documentation and tutorial platform for developers.",
};

export default function AboutPage() {
    return (
        <div className="mx-auto max-w-3xl">
            <h1 className="mb-6 text-4xl font-bold text-white">
                About TechWiki
            </h1>

            <div className="prose prose-invert max-w-none">
                <p className="mb-8 text-xl text-gray-300">
                    TechWiki is a community-driven platform providing
                    documentation, tutorials, and guides for developers, system
                    administrators, and technology enthusiasts.
                </p>

                <section className="mb-12">
                    <h2 className="mb-4 text-2xl font-bold text-white">
                        Our Mission
                    </h2>
                    <p className="text-gray-300">
                        We believe that knowledge should be accessible to
                        everyone. Our mission is to create a comprehensive,
                        well-organized repository of technical documentation
                        that helps people solve problems and learn new skills.
                    </p>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 text-2xl font-bold text-white">
                        What We Cover
                    </h2>
                    <div className="grid gap-4 md:grid-cols-2">
                        <div className="rounded-lg border border-gray-700/50 bg-gray-800/50 p-4">
                            <div className="mb-2 text-2xl">🐧</div>
                            <h3 className="mb-1 font-semibold text-white">
                                Linux
                            </h3>
                            <p className="text-sm text-gray-400">
                                Server administration, shell scripting, and
                                system configuration
                            </p>
                        </div>
                        <div className="rounded-lg border border-gray-700/50 bg-gray-800/50 p-4">
                            <div className="mb-2 text-2xl">☁️</div>
                            <h3 className="mb-1 font-semibold text-white">
                                Cloud & DevOps
                            </h3>
                            <p className="text-sm text-gray-400">
                                AWS, Azure, Kubernetes, and infrastructure as
                                code
                            </p>
                        </div>
                        <div className="rounded-lg border border-gray-700/50 bg-gray-800/50 p-4">
                            <div className="mb-2 text-2xl">🪟</div>
                            <h3 className="mb-1 font-semibold text-white">
                                Windows
                            </h3>
                            <p className="text-sm text-gray-400">
                                Server management, PowerShell, and enterprise
                                configuration
                            </p>
                        </div>
                        <div className="rounded-lg border border-gray-700/50 bg-gray-800/50 p-4">
                            <div className="mb-2 text-2xl">🗄️</div>
                            <h3 className="mb-1 font-semibold text-white">
                                Databases
                            </h3>
                            <p className="text-sm text-gray-400">
                                MySQL, PostgreSQL, MongoDB, and database
                                optimization
                            </p>
                        </div>
                    </div>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 text-2xl font-bold text-white">
                        Community Driven
                    </h2>
                    <p className="mb-4 text-gray-300">
                        TechWiki is built by the community, for the community.
                        We welcome contributions from developers and experts
                        worldwide. Whether you want to fix a typo or write a
                        comprehensive guide, your contributions help make
                        TechWiki better for everyone.
                    </p>
                    <Link
                        href="/contribute"
                        className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-white transition-colors hover:bg-blue-700"
                    >
                        Learn how to contribute
                    </Link>
                </section>

                <section className="mb-12">
                    <h2 className="mb-4 text-2xl font-bold text-white">
                        History
                    </h2>
                    <p className="text-gray-300">
                        TechWiki started as a personal knowledge base and has
                        grown into a comprehensive documentation platform.
                        Originally powered by MediaWiki, we&apos;ve modernized
                        the platform with a custom-built solution using Next.js
                        and Django to provide a better experience for both
                        readers and contributors.
                    </p>
                </section>

                <section>
                    <h2 className="mb-4 text-2xl font-bold text-white">
                        Contact
                    </h2>
                    <p className="text-gray-300">
                        Have questions, suggestions, or feedback? We&apos;d love
                        to hear from you. Reach out through our{" "}
                        <a
                            href="https://github.com/adb-software-solutions"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-400 hover:text-blue-300"
                        >
                            GitHub
                        </a>{" "}
                        or contribute directly to the wiki.
                    </p>
                </section>
            </div>
        </div>
    );
}
