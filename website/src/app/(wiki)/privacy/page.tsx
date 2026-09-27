import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Privacy Policy | TechWiki",
    description:
        "How TechWiki handles account information, contributions, cookies, analytics and advertising, and how to exercise your privacy rights.",
    alternates: { canonical: "https://techwiki.co.uk/privacy" },
};

const sections = [
    {
        id: "information",
        title: "Information we collect",
        paragraphs: [
            "When you create an account, we collect your name, email address, password in hashed form, and account verification and security information. If you enable passkeys or two-factor authentication, we store the credentials and security records needed to support those features. Account details are needed to provide sign-in and contribution features; you can read public articles without an account.",
            "We store the articles, edits, images and profile information you submit. Your author name, published contributions, biography, profile photo and any website or social links you choose to add may be public. Avoid including personal information you do not want others to see in public content.",
            "Requests to our services can include an IP address, browser and device information, requested URL, referring page and timestamps. Our site analytics can record page and article views, searches, interactions and a session identifier. Where you are signed in, internal activity records can be associated with your account. Information you send in an enquiry is also processed so we can respond.",
        ],
    },
    {
        id: "purposes",
        title: "How and why we use information",
        paragraphs: [
            "We use information to operate accounts, publish and moderate contributions, send verification and password-reset messages, respond to enquiries, investigate abuse and maintain the service. Our legitimate interests are running a useful knowledge platform, protecting accounts and keeping contributions reliable. We also process information where needed to meet legal obligations.",
            "Analytics help us understand which content is useful and improve navigation and reliability. Advertising supports the cost of providing the site. Where consent is required for optional tracking or personalised advertising, consent is the relevant basis. You can withdraw consent without affecting the lawfulness of processing carried out before withdrawal.",
        ],
    },
    {
        id: "cookies",
        title: "Cookies and browser storage",
        paragraphs: [
            "Sign-in and security cookies support authentication and protect against forged requests. The authentication service also stores your theme preference in local storage. Internal analytics can use a browser session-storage identifier called tw_session_id to group activity within a browsing session.",
            "When enabled, Google Analytics uses cookies and related identifiers to measure visits and interactions. Google advertising services may also use cookies and similar technologies, as described below. The services that operate on a particular visit depend on which features are enabled and the applicable consent settings.",
            "Use the consent controls displayed on the site to review advertising choices. You can also block or delete cookies through your browser and clear local or session storage. Blocking essential cookies may prevent sign-in or other account features from working. Clearing browser storage does not itself delete information already held on our servers. Contact us if you need help with a privacy choice.",
        ],
    },
    {
        id: "sharing",
        title: "Service providers and international processing",
        paragraphs: [
            "Hosting, infrastructure, email delivery and security providers process information needed to run TechWiki. Authorised administrators and moderators can access information needed for their responsibilities. We may disclose information where required by law or to investigate abuse and protect the service or its users.",
            "When enabled, Google receives information through Google Analytics or Google advertising services. Public contributions can be accessed by other visitors, search engines and services that index the site.",
            "Some providers, including Google, operate internationally and may process information outside the United Kingdom, including in the United States. Their privacy notices explain their processing locations and transfer safeguards. You can contact us for further information about the providers used for your data and the safeguards applicable to a transfer.",
        ],
    },
    {
        id: "retention",
        title: "How long information is kept",
        paragraphs: [
            "Retention depends on the purpose of the information: whether your account remains in use, whether a contribution remains published, whether a support or security issue is unresolved, and whether records are needed for legal obligations or disputes. Public contributions and revision history may need to remain available independently of an account. Contact us to discuss deletion or anonymisation of information associated with you.",
            "Browser storage and provider cookies have their own lifetimes. Clearing a cookie does not remove corresponding server records. Third-party analytics and advertising information is subject to the relevant provider's retention settings and policies. We do not promise a single automatic deletion period for all categories of information.",
        ],
    },
    {
        id: "rights",
        title: "Your rights and choices",
        paragraphs: [
            "Depending on your location and the basis for processing, you may ask to access your personal information, correct it, erase it, restrict its use or receive a portable copy. These rights have conditions and exceptions. We may need to verify your identity before responding; please do not email your password, recovery codes or identity documents unless we specifically arrange a secure way to provide necessary evidence.",
            "Right to object: you may object to processing based on legitimate interests, including associated profiling. Where we rely on consent, you can withdraw it using the available consent controls or by contacting us. Advertising choices may include opting out of personalised advertising or sale or sharing where applicable under local law.",
            "For requests or questions, email enquiries@techwiki.co.uk. You may also complain to the UK Information Commissioner's Office (ICO), or your local data protection authority, without contacting us first.",
        ],
    },
];

export default function PrivacyPage() {
    return (
        <article className="mx-auto max-w-3xl space-y-10 text-gray-300 [&_a]:text-blue-400 [&_a]:underline [&_a]:underline-offset-4 [&_a:hover]:text-blue-300">
            <header>
                <h1 className="mb-4 text-4xl font-bold text-white">
                    Privacy Policy
                </h1>
                <p className="mb-6 text-sm text-gray-400">
                    Last updated:{" "}
                    <time dateTime="2026-09-26">26 September 2026</time>
                </p>
                <p className="leading-7">
                    TechWiki is operated by Adam Birds trading as ADB Software
                    Solutions, the controller of personal information used to
                    run this service. This policy covers techwiki.co.uk and its
                    authentication and API services. For privacy enquiries,
                    contact{" "}
                    <a href="mailto:enquiries@techwiki.co.uk">
                        enquiries@techwiki.co.uk
                    </a>
                    .
                </p>
            </header>

            <nav
                aria-label="Privacy policy sections"
                className="rounded-xl border border-gray-700 p-6"
            >
                <ul className="grid gap-3 sm:grid-cols-2">
                    {sections.map(({ id, title }) => (
                        <li key={id}>
                            <a href={`#${id}`}>{title}</a>
                        </li>
                    ))}
                    <li>
                        <a href="#updates">Changes to this policy</a>
                    </li>
                </ul>
            </nav>

            {sections.map(({ id, title, paragraphs }) => (
                <section key={id} id={id} className="scroll-mt-24">
                    <h2 className="mb-4 text-2xl font-semibold text-white">
                        {title}
                    </h2>
                    <div className="space-y-4 leading-7">
                        {paragraphs.map((paragraph) => (
                            <p key={paragraph}>{paragraph}</p>
                        ))}
                        {id === "sharing" && (
                            <p>
                                Read{" "}
                                <a href="https://policies.google.com/privacy">
                                    Google&apos;s privacy policy
                                </a>{" "}
                                and{" "}
                                <a href="https://policies.google.com/technologies/partner-sites">
                                    how Google uses information from partner
                                    sites
                                </a>
                                .
                            </p>
                        )}
                        {id === "rights" && (
                            <p>
                                <a href="mailto:enquiries@techwiki.co.uk">
                                    Send a privacy request
                                </a>{" "}
                                or visit the{" "}
                                <a href="https://ico.org.uk/make-a-complaint/">
                                    ICO complaints service
                                </a>
                                .
                            </p>
                        )}
                    </div>
                </section>
            ))}

            <section id="updates" className="scroll-mt-24">
                <h2 className="mb-4 text-2xl font-semibold text-white">
                    Changes to this policy
                </h2>
                <p className="leading-7">
                    We may update this policy as the service or its providers
                    change. The date above identifies the latest revision.
                    Third-party websites and embedded services have their own
                    privacy notices; review those notices when you use them.
                </p>
            </section>
        </article>
    );
}
