/**
 * Wiki API client for TechWiki
 */

import type {
    ArticleCreateRequest,
    ArticleListResponse,
    ArticleResponse,
    ArticleUpdateRequest,
    CategoryListResponse,
    ImageUploadResponse,
    RedirectResponse,
    SearchResponse,
    SitemapResponse,
    Tag,
} from "./types";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface FetchOptions extends RequestInit {
    skipAuth?: boolean;
}

async function fetchApi<T>(
    endpoint: string,
    options: FetchOptions = {},
): Promise<T> {
    const { skipAuth, ...fetchOptions } = options;

    const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...fetchOptions.headers,
    };

    // Only include credentials on client-side
    const fetchConfig: RequestInit = {
        ...fetchOptions,
        headers,
    };

    // Add credentials only in browser context
    if (typeof window !== "undefined") {
        fetchConfig.credentials = "include";
    }

    const response = await fetch(`${API_BASE}${endpoint}`, fetchConfig);

    if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
}

// Category endpoints
export async function getCategories(): Promise<CategoryListResponse> {
    return fetchApi("/api/wiki/categories");
}

export async function getCategory(slug: string): Promise<CategoryListResponse> {
    return fetchApi(`/api/wiki/categories/${slug}`);
}

// Tag endpoints
export async function getTags(): Promise<{ success: boolean; tags: Tag[] }> {
    return fetchApi("/api/wiki/tags");
}

// Article endpoints
export async function getArticles(params?: {
    page?: number;
    per_page?: number;
    category?: string;
    article_type?: string;
    tag?: string;
    featured?: boolean;
    author_id?: string;
}): Promise<ArticleListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.per_page)
        searchParams.set("per_page", params.per_page.toString());
    if (params?.category) searchParams.set("category", params.category);
    if (params?.article_type)
        searchParams.set("article_type", params.article_type);
    if (params?.tag) searchParams.set("tag", params.tag);
    if (params?.featured !== undefined)
        searchParams.set("featured", params.featured.toString());
    if (params?.author_id) searchParams.set("author_id", params.author_id);

    const query = searchParams.toString();
    return fetchApi(`/api/wiki/articles${query ? `?${query}` : ""}`);
}

export async function getArticleByPath(path: string): Promise<ArticleResponse> {
    return fetchApi(`/api/wiki/articles/by-path/${path}`);
}

export async function getArticleById(id: string): Promise<ArticleResponse> {
    return fetchApi(`/api/wiki/articles/${id}`);
}

export async function createArticle(
    data: ArticleCreateRequest,
): Promise<ArticleResponse> {
    return fetchApi("/api/wiki/articles", {
        method: "POST",
        body: JSON.stringify(data),
    });
}

export async function updateArticle(
    id: string,
    data: ArticleUpdateRequest,
): Promise<ArticleResponse> {
    return fetchApi(`/api/wiki/articles/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
    });
}

export async function deleteArticle(
    id: string,
): Promise<{ success: boolean; message: string }> {
    return fetchApi(`/api/wiki/articles/${id}`, {
        method: "DELETE",
    });
}

// Search endpoint
export async function searchArticles(params: {
    q: string;
    category?: string;
    article_type?: string;
    page?: number;
    per_page?: number;
}): Promise<SearchResponse> {
    const searchParams = new URLSearchParams();
    searchParams.set("q", params.q);
    if (params.category) searchParams.set("category", params.category);
    if (params.article_type)
        searchParams.set("article_type", params.article_type);
    if (params.page) searchParams.set("page", params.page.toString());
    if (params.per_page)
        searchParams.set("per_page", params.per_page.toString());

    return fetchApi(`/api/wiki/search?${searchParams.toString()}`);
}

// Image upload
export async function uploadImage(
    file: File,
    articleId?: string,
    altText?: string,
): Promise<ImageUploadResponse> {
    const formData = new FormData();
    formData.append("file", file);
    if (articleId) formData.append("article_id", articleId);
    if (altText) formData.append("alt_text", altText);

    const response = await fetch(`${API_BASE}/api/wiki/images/upload`, {
        method: "POST",
        body: formData,
        credentials: "include",
    });

    return response.json();
}

// Redirect lookup
export async function resolveRedirect(path: string): Promise<RedirectResponse> {
    const searchParams = new URLSearchParams({ path });
    return fetchApi(`/api/wiki/redirects/resolve?${searchParams.toString()}`);
}

// My articles
export async function getMyArticles(params?: {
    status?: string;
    page?: number;
    per_page?: number;
}): Promise<ArticleListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set("status", params.status);
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.per_page)
        searchParams.set("per_page", params.per_page.toString());

    const query = searchParams.toString();
    return fetchApi(`/api/wiki/me/articles${query ? `?${query}` : ""}`);
}

// Moderation endpoints
export async function moderateArticle(
    articleId: string,
    action: import("./types").WorkflowAction | "approve",
    notes?: string,
): Promise<{
    success: boolean;
    message: string;
    new_status: string;
    next_article_id: string | null;
}> {
    return fetchApi(`/api/wiki/moderation/${articleId}`, {
        method: "POST",
        body: JSON.stringify({ action, notes }),
    });
}

// Sitemap data
export async function getSitemapData(): Promise<SitemapResponse> {
    return fetchApi("/api/wiki/sitemap");
}

// Revalidation (for webhook from backend)
export async function triggerRevalidation(
    paths: string[],
    secret: string,
): Promise<{ success: boolean; revalidated: string[]; message: string }> {
    return fetchApi("/api/wiki/revalidate", {
        method: "POST",
        body: JSON.stringify({ paths, secret }),
    });
}

// Author profile endpoints
export async function getAuthorProfile(userId: string): Promise<{
    success: boolean;
    user?: {
        id: string;
        first_name: string;
        last_name: string;
        bio: string;
        website: string;
        github: string;
        twitter: string;
        articles_count: number;
    };
    message?: string;
}> {
    return fetchApi(`/api/wiki/authors/${userId}`, { skipAuth: true });
}

export async function getAuthorArticles(
    userId: string,
    params?: {
        page?: number;
        per_page?: number;
    },
): Promise<ArticleListResponse> {
    const searchParams = new URLSearchParams();
    if (params?.page) searchParams.set("page", params.page.toString());
    if (params?.per_page)
        searchParams.set("per_page", params.per_page.toString());

    const query = searchParams.toString();
    return fetchApi(
        `/api/wiki/authors/${userId}/articles${query ? `?${query}` : ""}`,
        {
            skipAuth: true,
        },
    );
}
