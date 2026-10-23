/**
 * Wiki API types for TechWiki
 */

// Category types
export interface Category {
    id: string;
    name: string;
    slug: string;
    description: string;
    icon: string;
    order: number;
    parent_id: string | null;
    is_active: boolean;
    article_count: number;
    full_path: string;
}

// Tag types
export interface Tag {
    id: string;
    name: string;
    slug: string;
    description?: string;
}

// Author types
export interface Author {
    id: string;
    first_name: string;
    last_name: string;
    bio: string;
    photo?: string;
    website?: string;
    github?: string;
    twitter?: string;
    bluesky?: string;
    linkedin?: string;
    instagram?: string;
    facebook?: string;
    devto?: string;
    stackoverflow?: string;
    youtube?: string;
    twitch?: string;
}

// Article types
export type ArticleStatus =
    | "draft"
    | "pending_review"
    | "changes_requested"
    | "approved"
    | "published"
    | "archived";

export type ArticleType =
    "documentation" | "tutorial" | "blog" | "guide" | "reference";

export interface ArticleSummary {
    id: string;
    title: string;
    slug: string;
    excerpt: string;
    article_type: ArticleType;
    category: Category | null;
    author: Author | null;
    status: ArticleStatus;
    published_at: string | null;
    created_at: string;
    updated_at: string;
    view_count: number;
    reading_time: number;
    is_featured: boolean;
    featured_image_url: string | null;
}

export interface Article extends ArticleSummary {
    content: string;
    rendered_html: string;
    tags: Tag[];
    categories?: Category[];
    meta_title: string;
    meta_description: string;
    allow_comments: boolean;
    version: number;
    full_url: string;
    moderation_notes?: string;
}

// Request types
export interface ArticleCreateRequest {
    title: string;
    slug?: string;
    excerpt?: string;
    content: string;
    article_type?: ArticleType;
    category_id?: string;
    category_ids?: string[];
    tag_ids?: string[];
    meta_title?: string;
    meta_description?: string;
    allow_comments?: boolean;
}

export interface ArticleUpdateRequest {
    title?: string;
    slug?: string;
    excerpt?: string;
    content?: string;
    article_type?: ArticleType;
    category_id?: string | null;
    category_ids?: string[];
    tag_ids?: string[];
    meta_title?: string;
    meta_description?: string;
    allow_comments?: boolean;
    change_summary?: string;
}

// Response types
export interface ApiResponse<T> {
    success: boolean;
    message?: string;
    data?: T;
}

export interface CategoryListResponse {
    success: boolean;
    categories: Category[];
}

export interface ArticleListResponse {
    success: boolean;
    articles: ArticleSummary[];
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
}

export interface ArticleResponse {
    success: boolean;
    article?: Article;
    message?: string;
}

export interface SearchResponse {
    success: boolean;
    query: string;
    results: ArticleSummary[];
    total: number;
    page: number;
    per_page: number;
}

export interface RedirectResponse {
    success: boolean;
    redirect_to?: string;
    is_permanent?: boolean;
    message?: string;
}

export interface ImageUploadResponse {
    success: boolean;
    id?: string;
    url?: string;
    alt_text?: string;
    message?: string;
}

// Sitemap types
export interface SitemapItem {
    url: string;
    lastModified: string;
    changeFrequency: string;
    priority: number;
}

export interface SitemapResponse {
    success: boolean;
    articles: SitemapItem[];
    categories: SitemapItem[];
}
