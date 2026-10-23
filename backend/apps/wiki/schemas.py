"""Pydantic schemas for TechWiki API."""

from datetime import datetime

from ninja import Schema

# ============================================================================
# Category Schemas
# ============================================================================


class CategoryBase(Schema):
    name: str
    slug: str
    description: str = ""
    icon: str = ""
    order: int = 0


class CategoryResponse(CategoryBase):
    id: str
    parent_id: str | None = None
    is_active: bool
    article_count: int
    full_path: str


class CategoryListResponse(Schema):
    success: bool
    categories: list[CategoryResponse]


class CategoryTreeItem(CategoryBase):
    id: str
    children: list["CategoryTreeItem"] = []
    article_count: int


# ============================================================================
# Tag Schemas
# ============================================================================


class TagBase(Schema):
    name: str
    slug: str = ""


class TagCreateRequest(Schema):
    name: str
    description: str = ""


class TagResponse(TagBase):
    id: str
    description: str = ""


class TagListResponse(Schema):
    success: bool
    tags: list[TagResponse]


# ============================================================================
# Author Schemas
# ============================================================================


class AuthorResponse(Schema):
    id: str
    first_name: str
    last_name: str
    bio: str = ""
    github: str = ""
    twitter: str = ""


# ============================================================================
# Article Schemas
# ============================================================================


class ArticleBase(Schema):
    title: str
    slug: str = ""
    excerpt: str = ""
    content: str
    article_type: str = "documentation"
    category_id: str | None = None  # Primary category for URL generation
    category_ids: list[str] = []  # All categories
    tag_ids: list[str] = []
    meta_title: str = ""
    meta_description: str = ""
    allow_comments: bool = True


class ArticleCreateRequest(ArticleBase):
    pass


class ArticleUpdateRequest(Schema):
    title: str | None = None
    slug: str | None = None
    excerpt: str | None = None
    content: str | None = None
    article_type: str | None = None
    category_id: str | None = None  # Primary category
    category_ids: list[str] | None = None  # All categories
    tag_ids: list[str] | None = None
    meta_title: str | None = None
    meta_description: str | None = None
    allow_comments: bool | None = None
    change_summary: str = ""


class ArticleSummary(Schema):
    id: str
    title: str
    slug: str
    excerpt: str
    article_type: str
    category: CategoryResponse | None = None
    author: AuthorResponse | None = None
    status: str
    published_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    view_count: int
    reading_time: int
    is_featured: bool
    featured_image_url: str | None = None


class ArticleResponse(ArticleSummary):
    content: str
    rendered_html: str
    tags: list[TagResponse] = []
    meta_title: str
    meta_description: str
    allow_comments: bool
    version: int
    full_url: str


class ArticleListResponse(Schema):
    success: bool
    articles: list[ArticleSummary]
    total: int
    page: int
    per_page: int
    total_pages: int


class ArticleDetailResponse(Schema):
    success: bool
    article: ArticleResponse


# ============================================================================
# Image Schemas
# ============================================================================


class ImageUploadResponse(Schema):
    success: bool
    id: str
    url: str
    alt_text: str = ""
    message: str = ""


class ImageListResponse(Schema):
    success: bool
    images: list[dict[str, str]]


# ============================================================================
# Redirect Schemas
# ============================================================================


class RedirectRequest(Schema):
    path: str


class RedirectResponse(Schema):
    success: bool
    redirect_to: str | None = None
    is_permanent: bool = True
    message: str = ""


class RedirectCreateRequest(Schema):
    old_path: str
    new_path: str
    is_permanent: bool = True
    notes: str = ""


# ============================================================================
# Search Schemas
# ============================================================================


class SearchRequest(Schema):
    query: str
    category: str | None = None
    article_type: str | None = None
    tags: list[str] = []
    page: int = 1
    per_page: int = 20


class SearchResponse(Schema):
    success: bool
    query: str
    results: list[ArticleSummary]
    total: int
    page: int
    per_page: int


# ============================================================================
# Moderation Schemas
# ============================================================================


class ModerationActionRequest(Schema):
    action: str  # approve, reject, request_changes, publish
    notes: str = ""


class ModerationResponse(Schema):
    success: bool
    message: str
    new_status: str


class PendingArticleResponse(Schema):
    success: bool
    articles: list[ArticleSummary]
    total: int


# ============================================================================
# Webhook Schemas
# ============================================================================


class RevalidateRequest(Schema):
    paths: list[str]
    secret: str


class RevalidateResponse(Schema):
    success: bool
    revalidated: list[str]
    message: str = ""


# ============================================================================
# User Profile Schemas
# ============================================================================


class WikiUserProfileResponse(Schema):
    """User profile for wiki permissions."""

    id: str
    email: str
    first_name: str
    last_name: str
    role: str
    bio: str
    website: str
    photo: str | None = None
    github: str
    twitter: str
    bluesky: str = ""
    linkedin: str = ""
    instagram: str = ""
    facebook: str = ""
    devto: str = ""
    stackoverflow: str = ""
    youtube: str = ""
    twitch: str = ""
    is_trusted: bool
    can_publish_directly: bool
    can_moderate: bool
    is_staff: bool
    is_superuser: bool
    articles_count: int


class WikiUserProfileUpdateRequest(Schema):
    """Request to update wiki profile."""

    bio: str = ""
    website: str = ""
    github: str = ""
    twitter: str = ""
    bluesky: str = ""
    linkedin: str = ""
    instagram: str = ""
    facebook: str = ""
    devto: str = ""
    stackoverflow: str = ""
    youtube: str = ""
    twitch: str = ""


class UserProfileResponse(Schema):
    success: bool
    user: WikiUserProfileResponse | None = None
    message: str = ""


class UserArticlesResponse(Schema):
    success: bool
    articles: list[ArticleSummary]
    total: int
