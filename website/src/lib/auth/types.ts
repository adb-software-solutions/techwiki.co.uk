/**
 * Authentication types for TechWiki.
 */

export interface WikiUser {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    role: WikiUserRole;
    bio: string;
    website: string;
    photo?: string;
    github: string;
    twitter: string;
    bluesky?: string;
    linkedin?: string;
    instagram?: string;
    facebook?: string;
    devto?: string;
    stackoverflow?: string;
    youtube?: string;
    twitch?: string;
    isTrusted: boolean;
    canPublishDirectly: boolean;
    canModerate: boolean;
    isModerator: boolean;
    isStaff: boolean;
    isSuperuser: boolean;
    articlesCount: number;
}

export type WikiUserRole =
    "reader" | "contributor" | "trusted_contributor" | "moderator" | "admin";

export interface AuthState {
    user: WikiUser | null;
    isAuthenticated: boolean;
    isLoading: boolean;
}

export interface WikiUserProfileResponse {
    success: boolean;
    user: {
        id: string;
        email: string;
        first_name: string;
        last_name: string;
        role: WikiUserRole;
        bio: string;
        website: string;
        photo?: string;
        github: string;
        twitter: string;
        bluesky?: string;
        linkedin?: string;
        instagram?: string;
        facebook?: string;
        devto?: string;
        stackoverflow?: string;
        youtube?: string;
        twitch?: string;
        is_trusted: boolean;
        can_publish_directly: boolean;
        can_moderate: boolean;
        is_moderator: boolean;
        is_staff: boolean;
        is_superuser: boolean;
        articles_count: number;
    } | null;
    message: string;
}

/**
 * Permission helpers
 */
export function canEditArticle(
    user: WikiUser | null,
    authorId: string | null,
): boolean {
    if (!user) return false;

    // Author can always edit their own articles
    if (authorId && user.id === authorId) return true;

    // Staff and superusers can edit any article
    if (user.isStaff || user.isSuperuser) return true;

    // Moderators and admins can edit
    if (user.role === "moderator" || user.role === "admin") return true;

    return false;
}

export function canDeleteArticle(
    user: WikiUser | null,
    authorId: string | null,
): boolean {
    if (!user) return false;

    // Only staff/superusers can delete any article
    if (user.isStaff || user.isSuperuser) return true;

    // Admins can delete
    if (user.role === "admin") return true;

    // Authors can delete their own drafts
    if (authorId && user.id === authorId) return true;

    return false;
}

export function canModerate(user: WikiUser | null): boolean {
    if (!user) return false;
    return user.canModerate || user.isStaff || user.isSuperuser;
}

export function canPublishDirectly(user: WikiUser | null): boolean {
    if (!user) return false;
    return user.canPublishDirectly || user.isStaff || user.isSuperuser;
}

export function canCreateArticle(user: WikiUser | null): boolean {
    if (!user) return false;
    // Anyone authenticated can create articles (subject to moderation)
    return true;
}
