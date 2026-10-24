import { getAuthorProfile } from "@/lib/wiki/api";
import type { Metadata } from "next";

const BASE_URL = "https://techwiki.co.uk";
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface AuthorLayoutProps {
    children: React.ReactNode;
    params: Promise<{ id: string }>;
}

interface AuthorMetadataLinks {
    photo?: string;
    bluesky?: string;
    linkedin?: string;
    instagram?: string;
    facebook?: string;
    devto?: string;
    stackoverflow?: string;
    youtube?: string;
    twitch?: string;
}

function absolutePhotoUrl(photo: string | undefined): string | undefined {
    if (!photo) return undefined;
    if (photo.startsWith("http://") || photo.startsWith("https://")) {
        return photo;
    }
    return `${API_BASE}${photo}`;
}

export async function generateMetadata({
    params,
}: AuthorLayoutProps): Promise<Metadata> {
    const { id } = await params;
    const response = await getAuthorProfile(id).catch(() => null);
    if (!response?.success || !response.user) return {};

    const author = response.user as typeof response.user & AuthorMetadataLinks;
    const name = `${author.first_name} ${author.last_name}`.trim();
    const canonical = `${BASE_URL}/authors/${id}`;

    return {
        title: name,
        description:
            author.bio ||
            `Technical articles and guides written by ${name} on TechWiki.`,
        alternates: { canonical },
        openGraph: {
            type: "profile",
            url: canonical,
            title: `${name} | TechWiki`,
            description:
                author.bio ||
                `Technical articles and guides written by ${name} on TechWiki.`,
            images: author.photo
                ? [{ url: absolutePhotoUrl(author.photo) || author.photo }]
                : undefined,
        },
    };
}

export default async function AuthorLayout({
    children,
    params,
}: AuthorLayoutProps) {
    const { id } = await params;
    const response = await getAuthorProfile(id).catch(() => null);
    if (!response?.success || !response.user) return children;

    const author = response.user as typeof response.user & AuthorMetadataLinks;
    const name = `${author.first_name} ${author.last_name}`.trim();
    const canonical = `${BASE_URL}/authors/${id}`;
    const sameAs = [
        author.website,
        author.github,
        author.twitter,
        author.bluesky,
        author.linkedin,
        author.instagram,
        author.facebook,
        author.devto,
        author.stackoverflow,
        author.youtube,
        author.twitch,
    ].filter(Boolean);

    const profileStructuredData = {
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        "@id": `${canonical}#profile`,
        url: canonical,
        mainEntity: {
            "@type": "Person",
            "@id": `${canonical}#person`,
            name,
            description: author.bio || undefined,
            url: author.website || canonical,
            image: absolutePhotoUrl(author.photo) || undefined,
            sameAs,
        },
    };

    return (
        <>
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{
                    __html: JSON.stringify(profileStructuredData),
                }}
            />
            {children}
        </>
    );
}
