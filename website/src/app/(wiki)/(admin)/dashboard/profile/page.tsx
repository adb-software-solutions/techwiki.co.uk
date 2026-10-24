"use client";

import { useAuth } from "@/lib/auth";
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
import { Globe } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FaLinkedin } from "react-icons/fa";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface ProfileFormData {
    bio: string;
    website: string;
    github: string;
    twitter: string;
    bluesky: string;
    linkedin: string;
    instagram: string;
    facebook: string;
    devto: string;
    stackoverflow: string;
    youtube: string;
    twitch: string;
}

type ProfileFormDataWithPhoto = ProfileFormData & {
    photo?: File;
};

type IconComponent = React.ComponentType<{ className?: string }>;

interface SocialPlatform {
    key: string;
    label: string;
    icon: IconComponent;
}

const SOCIAL_PLATFORMS: SocialPlatform[] = [
    {
        key: "website",
        label: "Website",
        icon: Globe,
    },
    {
        key: "github",
        label: "GitHub",
        icon: SiGithub,
    },
    {
        key: "twitter",
        label: "X (Twitter)",
        icon: SiX,
    },
    {
        key: "bluesky",
        label: "Bluesky",
        icon: SiBluesky,
    },
    {
        key: "linkedin",
        label: "LinkedIn",
        icon: FaLinkedin,
    },
    {
        key: "instagram",
        label: "Instagram",
        icon: SiInstagram,
    },
    {
        key: "facebook",
        label: "Facebook",
        icon: SiFacebook,
    },
    {
        key: "devto",
        label: "Dev.to",
        icon: SiDevdotto,
    },
    {
        key: "stackoverflow",
        label: "Stack Overflow",
        icon: SiStackoverflow,
    },
    {
        key: "youtube",
        label: "YouTube",
        icon: SiYoutube,
    },
    {
        key: "twitch",
        label: "Twitch",
        icon: SiTwitch,
    },
];

const getPhotoUrl = (photo: string | null | undefined): string | null => {
    if (!photo) return null;
    if (photo.startsWith("http")) return photo;
    return `${API_BASE}${photo}`;
};

export default function ProfilePage() {
    const { user, isAuthenticated, isLoading, getLoginUrl, refreshUser } =
        useAuth();
    const router = useRouter();
    const [formData, setFormData] = useState<ProfileFormDataWithPhoto>({
        bio: "",
        website: "",
        github: "",
        twitter: "",
        bluesky: "",
        linkedin: "",
        instagram: "",
        facebook: "",
        devto: "",
        stackoverflow: "",
        youtube: "",
        twitch: "",
    });
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);

    const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setFormData((prev) => ({ ...prev, photo: file }));
            const reader = new FileReader();
            reader.onloadend = () => {
                setPhotoPreview(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    // Redirect to login if not authenticated
    useEffect(() => {
        if (!isLoading && !isAuthenticated) {
            router.push(getLoginUrl("/dashboard/profile"));
        }
    }, [isLoading, isAuthenticated, router, getLoginUrl]);

    // Load user profile data
    useEffect(() => {
        if (!isAuthenticated || !user) return;

        setLoading(true);
        setFormData({
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
        });

        // Set photo preview if user has a photo
        if (user.photo) {
            setPhotoPreview(getPhotoUrl(user.photo));
        }

        setLoading(false);
    }, [isAuthenticated, user]);

    const handleChange = (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => {
        const { name, value } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: value,
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError(null);
        setSuccess(false);

        try {
            const formDataToSend = new FormData();

            // Add text fields
            formDataToSend.append("bio", formData.bio);
            formDataToSend.append("website", formData.website);
            formDataToSend.append("github", formData.github);
            formDataToSend.append("twitter", formData.twitter);
            formDataToSend.append("bluesky", formData.bluesky);
            formDataToSend.append("linkedin", formData.linkedin);
            formDataToSend.append("instagram", formData.instagram);
            formDataToSend.append("facebook", formData.facebook);
            formDataToSend.append("devto", formData.devto);
            formDataToSend.append("stackoverflow", formData.stackoverflow);
            formDataToSend.append("youtube", formData.youtube);
            formDataToSend.append("twitch", formData.twitch);

            // Add photo if selected
            if (formData.photo instanceof File) {
                formDataToSend.append("photo", formData.photo);
            }

            const response = await fetch(`${API_BASE}/api/wiki/me`, {
                method: "PUT",
                credentials: "include",
                body: formDataToSend,
            });

            const data = await response.json();

            if (data.success) {
                setSuccess(true);
                // Refresh user data from the server
                await refreshUser();
                setTimeout(() => setSuccess(false), 5000);
            } else {
                setError(data.message || "Failed to update profile");
            }
        } catch (err) {
            console.error("Profile update error:", err);
            setError("An error occurred while updating your profile");
        } finally {
            setSaving(false);
        }
    };

    if (isLoading || !isAuthenticated) {
        return (
            <div className="flex min-h-[400px] items-center justify-center">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
        );
    }

    return (
        <div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white">Edit Profile</h1>
                <p className="mt-1 text-gray-400">
                    Update your public profile information
                </p>
            </div>

            {/* Success Message */}
            {success && (
                <div className="rounded-lg border border-green-800 bg-green-900/20 px-4 py-3 text-green-300">
                    <p className="font-medium">
                        ✓ Profile updated successfully
                    </p>
                </div>
            )}

            {/* Error Message */}
            {error && (
                <div className="rounded-lg border border-red-800 bg-red-900/20 px-4 py-3 text-red-300">
                    <p className="font-medium">✗ {error}</p>
                </div>
            )}

            {/* Profile Card */}
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
                {/* User Info Header */}
                <div className="mb-8 border-b border-gray-700 pb-6">
                    <div className="flex items-center gap-4">
                        <div className="relative">
                            {photoPreview || user?.photo ? (
                                <Image
                                    src={
                                        photoPreview ||
                                        getPhotoUrl(user?.photo) ||
                                        ""
                                    }
                                    alt="Profile"
                                    width={64}
                                    height={64}
                                    className="h-16 w-16 rounded-lg object-cover"
                                />
                            ) : (
                                <div className="flex h-16 w-16 items-center justify-center rounded-lg bg-blue-600">
                                    <span className="text-2xl font-bold text-white">
                                        {user?.firstName?.charAt(0) || "U"}
                                    </span>
                                </div>
                            )}
                        </div>
                        <div>
                            <h2 className="text-xl font-semibold text-white">
                                {user?.firstName} {user?.lastName}
                            </h2>
                            <p className="text-gray-400">{user?.email}</p>
                            {user?.articlesCount !== undefined && (
                                <p className="mt-1 text-sm text-gray-500">
                                    {user.articlesCount} article
                                    {user.articlesCount !== 1 ? "s" : ""}{" "}
                                    published
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* Profile Photo */}
                    <div>
                        <label
                            htmlFor="photo"
                            className="block text-sm font-medium text-white"
                        >
                            Profile Photo
                        </label>
                        <p className="mt-1 text-sm text-gray-400">
                            Upload a profile photo (JPEG, PNG, or WebP, max 2MB)
                        </p>
                        <input
                            id="photo"
                            name="photo"
                            type="file"
                            accept="image/jpeg,image/png,image/webp"
                            onChange={handlePhotoChange}
                            className="mt-3 w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2 text-white file:mr-4 file:rounded file:border-0 file:bg-blue-600 file:px-4 file:py-2 file:text-white hover:file:bg-blue-700"
                        />
                    </div>

                    {/* Bio */}
                    <div>
                        <label
                            htmlFor="bio"
                            className="block text-sm font-medium text-white"
                        >
                            Bio
                        </label>
                        <p className="mt-1 text-sm text-gray-400">
                            Tell others about yourself
                        </p>
                        <textarea
                            id="bio"
                            name="bio"
                            value={formData.bio}
                            onChange={handleChange}
                            rows={4}
                            placeholder="Enter your bio..."
                            className="mt-3 w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                            maxLength={500}
                        />
                        <p className="mt-1 text-xs text-gray-500">
                            {formData.bio.length}/500 characters
                        </p>
                    </div>

                    {/* Website */}
                    <div>
                        <label
                            htmlFor="website"
                            className="block text-sm font-medium text-white"
                        >
                            Website or Blog
                        </label>
                        <input
                            type="url"
                            id="website"
                            name="website"
                            value={formData.website}
                            onChange={handleChange}
                            placeholder="https://example.com"
                            className="mt-2 w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                        />
                    </div>

                    {/* Social Media Fields */}
                    <div className="border-t border-gray-700 pt-6">
                        <h3 className="mb-4 text-lg font-semibold text-white">
                            Social Media & Professional Links
                        </h3>
                        <div className="grid gap-4 md:grid-cols-2">
                            {SOCIAL_PLATFORMS.map((platform) => (
                                <div key={platform.key}>
                                    <label
                                        htmlFor={platform.key}
                                        className="flex items-center gap-2 text-sm font-medium text-white"
                                    >
                                        <span className="h-5 w-5 flex-shrink-0 text-blue-400">
                                            <platform.icon className="h-5 w-5" />
                                        </span>
                                        {platform.label}
                                    </label>
                                    <input
                                        type="text"
                                        id={platform.key}
                                        name={platform.key}
                                        value={
                                            (formData[
                                                platform.key as keyof ProfileFormData
                                            ] as string) || ""
                                        }
                                        onChange={handleChange}
                                        placeholder={`https://${platform.label.toLowerCase()}.com/...`}
                                        className="mt-1 w-full rounded-lg border border-gray-600 bg-gray-900 px-4 py-2 text-white placeholder-gray-500 focus:border-blue-500 focus:outline-none"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 border-t border-gray-700 pt-6">
                        <button
                            type="submit"
                            disabled={saving}
                            className="flex-1 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
                        >
                            {saving ? "Saving..." : "Save Changes"}
                        </button>
                        <Link
                            href="/dashboard"
                            className="flex-1 rounded-lg border border-gray-600 px-4 py-2 text-center font-medium text-white transition-colors hover:bg-gray-700"
                        >
                            Cancel
                        </Link>
                    </div>
                </form>
            </div>

            {/* Social Links Preview */}
            <div className="rounded-lg border border-gray-700 bg-gray-800 p-6">
                <h3 className="mb-4 text-lg font-semibold text-white">
                    Profile Preview
                </h3>
                <div className="space-y-2 text-sm text-gray-400">
                    {SOCIAL_PLATFORMS.map((platform) => {
                        const value =
                            formData[platform.key as keyof ProfileFormData];
                        if (!value) return null;
                        return (
                            <div
                                key={platform.key}
                                className="flex items-center gap-2"
                            >
                                <span className="h-4 w-4 flex-shrink-0 text-blue-400">
                                    <platform.icon className="h-4 w-4" />
                                </span>
                                <a
                                    href={value as string}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:underline"
                                >
                                    {platform.label}
                                </a>
                            </div>
                        );
                    })}
                    {!formData.github &&
                        !formData.twitter &&
                        !formData.linkedin &&
                        !formData.website &&
                        !formData.bluesky &&
                        !formData.instagram &&
                        !formData.facebook &&
                        !formData.devto &&
                        !formData.stackoverflow &&
                        !formData.youtube &&
                        !formData.twitch && (
                            <p className="text-gray-500">
                                No social links added yet
                            </p>
                        )}
                </div>
            </div>
        </div>
    );
}
