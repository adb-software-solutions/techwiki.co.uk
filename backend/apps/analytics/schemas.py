"""Pydantic schemas for Analytics API."""

from pydantic import BaseModel, Field


class PageViewRequest(BaseModel):
    path: str = Field(max_length=500)
    full_url: str | None = Field(default=None, max_length=1000)
    referrer: str | None = Field(default=None, max_length=1000)
    session_id: str = Field(max_length=64)
    article_id: str | None = None


class EngagementRequest(BaseModel):
    page_view_id: str
    session_id: str = Field(max_length=64)
    seconds: int = Field(ge=0)
    scroll_depth: int | None = Field(default=None, ge=0, le=100)


class ArticleViewRequest(BaseModel):
    article_id: str
    session_id: str = Field(max_length=64)
    time_on_article: int | None = None
    scroll_depth: int | None = None


class SearchQueryRequest(BaseModel):
    query: str = Field(max_length=500)
    results_count: int
    session_id: str = Field(max_length=64)
    category_filter: str | None = None
    type_filter: str | None = None


class SearchClickRequest(BaseModel):
    search_id: str
    article_id: str
    position: int


class EventRequest(BaseModel):
    event_type: str
    event_action: str
    event_category: str | None = None
    event_label: str | None = None
    event_value: float | None = None
    page_path: str | None = None
    article_id: str | None = None
    session_id: str
    metadata: dict[str, str | int | float | bool | None] | None = None
