"use client";

import {
    buttonClass,
    Card,
    inputClass,
    PageHeader,
    useToast,
} from "@/components/admin/ui";
import { SiteLink } from "@/components/wiki/SiteLink";
import { useAuth } from "@/lib/auth";
import type { WikiUser } from "@/lib/auth/types";
import {
    SiBluesky,
    SiDevdotto,
    SiFacebook,
    SiGithub,
    SiInstagram,
    SiStackoverflow,
    SiTwitch,
    SiX,
    SiYoutube,
} from "@icons-pack/react-simple-icons";
import { ExternalLink, Globe, ShieldCheck, Upload } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { FaLinkedin } from "react-icons/fa";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;

const LINKS = [
    { key: "website", label: "Website", icon: Globe },
    { key: "github", label: "GitHub", icon: SiGithub },
    { key: "twitter", label: "X (Twitter)", icon: SiX },
    { key: "bluesky", label: "Bluesky", icon: SiBluesky },
    { key: "linkedin", label: "LinkedIn", icon: FaLinkedin },
    { key: "instagram", label: "Instagram", icon: SiInstagram },
    { key: "facebook", label: "Facebook", icon: SiFacebook },
    { key: "devto", label: "Dev.to", icon: SiDevdotto },
    { key: "stackoverflow", label: "Stack Overflow", icon: SiStackoverflow },
    { key: "youtube", label: "YouTube", icon: SiYoutube },
    { key: "twitch", label: "Twitch", icon: SiTwitch },
] as const;

type LinkKey = (typeof LINKS)[number]["key"];
type ProfileFields = Record<LinkKey | "bio", string>;

const ROLE_LABELS: Record<string, string> = {
    reader: "Reader",
    contributor: "Contributor",
    trusted_contributor: "Trusted contributor",
    moderator: "Moderator",
    admin: "Admin",
};

function fieldsFrom(user: WikiUser): ProfileFields {
    return {
        bio: user.bio || "",
        website: user.website || "",
        github: user.github || "",
        twitter: user.twitter || "",
        bluesky: user.bluesky || "",
        linkedin: user.linkedin || "",
        instagram: user.instagram || "",
        facebook: user.facebook || "",
        devto: user.devto || "",
        stackoverflow: user.stackoverflow || "",
        youtube: user.youtube || "",
        twitch: user.twitch || "",
    };
}

function photoUrl(photo: string | null | undefined): string | null {
    if (!photo) return null;
    return photo.startsWith("http") ? photo : `${API_BASE}${photo}`;
}

export default function ProfilePage() {
    const { user, refreshUser, getAccountUrl } = useAuth();
    const toast = useToast();
    const fileInput = useRef<HTMLInputElement>(null);
    const [fields, setFields] = useState<ProfileFields | null>(null);
    const [photo, setPhoto] = useState<File | null>(null);
    const [removePhoto, setRemovePhoto] = useState(false);
    const [preview, setPreview] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (user && fields === null) setFields(fieldsFrom(user));
    }, [user, fields]);

    useEffect(() => {
        if (!photo) return;
        const url = URL.createObjectURL(photo);
        setPreview(url);
        return () => URL.revokeObjectURL(url);
    }, [photo]);

    if (!user || !fields) return null;

    const saved = fieldsFrom(user);
    const dirty =
        photo !== null ||
        removePhoto ||
        JSON.stringify(fields) !== JSON.stringify(saved);
    const shownPhoto = removePhoto ? null : preview || photoUrl(user.photo);
    const name = `${user.firstName} ${user.lastName}`.trim() || user.email;
    const initials =
        (user.firstName?.[0] ?? "") + (user.lastName?.[0] ?? "") ||
        user.email[0].toUpperCase();

    const choosePhoto = (file: File | undefined) => {
        if (!file) return;
        if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
            toast("Use a JPEG, PNG or WebP image", "error");
            return;
        }
        if (file.size > MAX_PHOTO_BYTES) {
            toast("Photos must be 2 MB or smaller", "error");
            return;
        }
        setPhoto(file);
        setRemovePhoto(false);
    };

    const save = async (event: FormEvent) => {
        event.preventDefault();
        setSaving(true);
        const body = new FormData();
        Object.entries(fields).forEach(([key, value]) =>
            body.append(key, value.trim()),
        );
        if (photo) body.append("photo", photo);
        if (removePhoto) body.append("remove_photo", "true");
        try {
            const response = await fetch(`${API_BASE}/api/wiki/me`, {
                method: "POST",
                credentials: "include",
                body,
            });
            const data: { success: boolean; message?: string } =
                await response.json();
            if (!data.success) {
                toast(data.message || "Could not save your profile", "error");
                return;
            }
            await refreshUser();
            setFields(null);
            setPhoto(null);
            setPreview(null);
            setRemovePhoto(false);
            toast("Profile saved");
        } catch {
            toast("Could not save your profile", "error");
        } finally {
            setSaving(false);
        }
    };

    const set = (key: keyof ProfileFields, value: string) =>
        setFields((current) =>
            current ? { ...current, [key]: value } : current,
        );

    return (
        <form onSubmit={save}>
            <PageHeader
                title="Profile"
                description="How you appear as an author on TechWiki."
                actions={
                    <>
                        <SiteLink
                            href={`/authors/${user.id}`}
                            className={buttonClass("secondary")}
                        >
                            <ExternalLink className="h-4 w-4" />
                            View public profile
                        </SiteLink>
                        <button
                            type="submit"
                            disabled={!dirty || saving}
                            className={buttonClass("primary")}
                        >
                            {saving ? "Saving…" : "Save changes"}
                        </button>
                    </>
                }
            />

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div className="min-w-0 space-y-6">
                    <Card className="space-y-5">
                        <h2 className="font-semibold text-white">About you</h2>
                        <div className="flex flex-wrap items-center gap-5">
                            {shownPhoto ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                    src={shownPhoto}
                                    alt=""
                                    className="h-20 w-20 rounded-full object-cover"
                                />
                            ) : (
                                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-blue-600/20 text-2xl font-semibold text-blue-200">
                                    {initials}
                                </div>
                            )}
                            <div className="space-y-2">
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            fileInput.current?.click()
                                        }
                                        className={buttonClass(
                                            "secondary",
                                            "sm",
                                        )}
                                    >
                                        <Upload className="h-4 w-4" />
                                        {shownPhoto
                                            ? "Change photo"
                                            : "Upload photo"}
                                    </button>
                                    {shownPhoto && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setPhoto(null);
                                                setPreview(null);
                                                setRemovePhoto(
                                                    Boolean(user.photo),
                                                );
                                            }}
                                            className={buttonClass(
                                                "ghost",
                                                "sm",
                                            )}
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>
                                <p className="text-xs text-gray-500">
                                    JPEG, PNG or WebP, up to 2 MB.
                                </p>
                                <input
                                    ref={fileInput}
                                    type="file"
                                    accept="image/jpeg,image/png,image/webp"
                                    className="hidden"
                                    onChange={(e) => {
                                        choosePhoto(e.target.files?.[0]);
                                        e.target.value = "";
                                    }}
                                />
                            </div>
                        </div>
                        <label className="block text-sm">
                            <span className="mb-1 flex justify-between text-gray-300">
                                Bio
                                <span className="text-xs text-gray-500">
                                    Shown on your author page and under your
                                    articles
                                </span>
                            </span>
                            <textarea
                                value={fields.bio}
                                onChange={(e) => set("bio", e.target.value)}
                                rows={5}
                                className={inputClass}
                                placeholder="What do you work on and write about?"
                            />
                        </label>
                    </Card>

                    <Card>
                        <h2 className="mb-1 font-semibold text-white">Links</h2>
                        <p className="mb-5 text-sm text-gray-400">
                            Full URLs. Empty links are hidden.
                        </p>
                        <div className="grid gap-4 md:grid-cols-2">
                            {LINKS.map(({ key, label, icon: Icon }) => (
                                <label key={key} className="block text-sm">
                                    <span className="mb-1 flex items-center gap-2 text-gray-300">
                                        <Icon className="h-3.5 w-3.5 text-gray-400" />
                                        {label}
                                    </span>
                                    <input
                                        type="url"
                                        value={fields[key]}
                                        onChange={(e) =>
                                            set(key, e.target.value)
                                        }
                                        className={inputClass}
                                        placeholder="https://"
                                    />
                                </label>
                            ))}
                        </div>
                    </Card>
                </div>

                <div className="space-y-6">
                    <Card>
                        <h2 className="mb-4 font-semibold text-white">
                            Account
                        </h2>
                        <dl className="space-y-3 text-sm">
                            <div>
                                <dt className="text-gray-500">Name</dt>
                                <dd className="text-gray-100">{name}</dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Email</dt>
                                <dd className="break-all text-gray-100">
                                    {user.email}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Role</dt>
                                <dd className="text-gray-100">
                                    {user.isSuperuser
                                        ? "Super admin"
                                        : ROLE_LABELS[user.role] || user.role}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-gray-500">Articles</dt>
                                <dd className="text-gray-100 tabular-nums">
                                    {user.articlesCount}
                                </dd>
                            </div>
                        </dl>
                        <a
                            href={getAccountUrl()}
                            className={`${buttonClass("secondary", "sm")} mt-5 w-full`}
                        >
                            <ShieldCheck className="h-4 w-4" />
                            Account and security
                        </a>
                    </Card>
                </div>
            </div>
        </form>
    );
}
