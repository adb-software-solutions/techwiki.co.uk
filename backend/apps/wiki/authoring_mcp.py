"""Private MCP server exposing owner-only TechWiki authoring tools."""

from __future__ import annotations

import json
import os
import uuid
from typing import Any

from django.http import HttpRequest, HttpResponse, JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from ninja.errors import HttpError

from apps.wiki.authoring_api import (
    ArticleDraftCreatePayload,
    ArticleDraftUpdatePayload,
    CategoryCreatePayload,
    CompatibilityPayload,
    TagCreatePayload,
    authoring_create_article,
    authoring_create_category,
    authoring_create_tag,
    authoring_get_article,
    authoring_list_articles,
    authoring_list_categories,
    authoring_list_tags,
    authoring_set_compatibility,
    authoring_update_article,
    authoring_validate_article,
)
from apps.wiki.authoring_models import AuthoringApiToken

PROTOCOL_VERSION = "2026-07-28"
LEGACY_PROTOCOL_VERSION = "2025-11-25"

TOOLS: list[dict[str, Any]] = [
    {
        "name": "search_articles",
        "description": "Search TechWiki articles and drafts before creating or updating content.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string"},
                "status": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 100},
            },
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True},
    },
    {
        "name": "get_article",
        "description": "Retrieve a TechWiki article or draft, including Markdown content and metadata.",
        "inputSchema": {
            "type": "object",
            "properties": {"article_id": {"type": "string", "format": "uuid"}},
            "required": ["article_id"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True},
    },
    {
        "name": "create_article_draft",
        "description": "Create a new TechWiki draft. This tool cannot publish an article.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "title": {"type": "string"},
                "content": {"type": "string", "description": "Article body in Markdown."},
                "slug": {"type": "string"},
                "excerpt": {"type": "string"},
                "article_type": {"type": "string"},
                "category_id": {"type": "string", "format": "uuid"},
                "category_ids": {"type": "array", "items": {"type": "string", "format": "uuid"}},
                "tag_ids": {"type": "array", "items": {"type": "string", "format": "uuid"}},
                "meta_title": {"type": "string"},
                "meta_description": {"type": "string"},
                "allow_comments": {"type": "boolean"},
                "change_summary": {"type": "string"},
            },
            "required": ["title", "content"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": False},
    },
    {
        "name": "update_article_draft",
        "description": "Update an existing non-published TechWiki article draft and create a revision.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "article_id": {"type": "string", "format": "uuid"},
                "title": {"type": "string"},
                "content": {"type": "string"},
                "slug": {"type": "string"},
                "excerpt": {"type": "string"},
                "article_type": {"type": "string"},
                "category_id": {"type": "string", "format": "uuid"},
                "category_ids": {"type": "array", "items": {"type": "string", "format": "uuid"}},
                "tag_ids": {"type": "array", "items": {"type": "string", "format": "uuid"}},
                "meta_title": {"type": "string"},
                "meta_description": {"type": "string"},
                "allow_comments": {"type": "boolean"},
                "change_summary": {"type": "string"},
            },
            "required": ["article_id"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": False},
    },
    {
        "name": "validate_article",
        "description": "Validate a draft for missing metadata, weak content signals, and possible duplicates.",
        "inputSchema": {
            "type": "object",
            "properties": {"article_id": {"type": "string", "format": "uuid"}},
            "required": ["article_id"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True},
    },
    {
        "name": "list_categories",
        "description": "List TechWiki categories, including nested paths and IDs.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
        "annotations": {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True},
    },
    {
        "name": "create_category",
        "description": "Create a TechWiki category or nested subcategory.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "slug": {"type": "string"},
                "description": {"type": "string"},
                "icon": {"type": "string"},
                "parent_id": {"type": "string", "format": "uuid"},
                "order": {"type": "integer"},
            },
            "required": ["name"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": False},
    },
    {
        "name": "list_tags",
        "description": "List existing TechWiki tags and IDs.",
        "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
        "annotations": {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": True},
    },
    {
        "name": "create_tag",
        "description": "Create a TechWiki tag for classifying articles.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "name": {"type": "string"},
                "slug": {"type": "string"},
                "description": {"type": "string"},
            },
            "required": ["name"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": False},
    },
    {
        "name": "set_article_compatibility",
        "description": "Add or update tested-with/version compatibility metadata on a draft.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "article_id": {"type": "string", "format": "uuid"},
                "technology": {"type": "string"},
                "version": {"type": "string"},
                "environment": {"type": "string"},
                "status": {"type": "string", "enum": ["verified", "partial", "known_issue"]},
                "notes": {"type": "string"},
            },
            "required": ["article_id", "technology"],
            "additionalProperties": False,
        },
        "annotations": {"readOnlyHint": False, "destructiveHint": False, "idempotentHint": True},
    },
]


def _json_rpc_result(request_id: Any, result: Any) -> JsonResponse:
    return JsonResponse({"jsonrpc": "2.0", "id": request_id, "result": result})


def _json_rpc_error(request_id: Any, code: int, message: str, status: int = 200) -> JsonResponse:
    return JsonResponse(
        {"jsonrpc": "2.0", "id": request_id, "error": {"code": code, "message": message}},
        status=status,
    )


def _authenticate(request: HttpRequest) -> AuthoringApiToken | None:
    authorization = request.headers.get("Authorization", "")
    if not authorization.startswith("Bearer "):
        return None
    credential = AuthoringApiToken.authenticate(authorization[7:].strip())
    owner_id = os.environ.get("TECHWIKI_AUTHORING_USER_ID", "").strip()
    if not credential or not owner_id or str(credential.user_id) != owner_id:
        return None
    if not credential.user.is_active:
        return None
    request.auth = credential  # type: ignore[attr-defined]
    return credential


def _unauthorized(request: HttpRequest) -> HttpResponse:
    metadata_url = request.build_absolute_uri("/.well-known/oauth-protected-resource")
    response = JsonResponse({"error": "authorization_required"}, status=401)
    response["WWW-Authenticate"] = f'Bearer resource_metadata="{metadata_url}"'
    return response


def _tool_result(data: Any, *, is_error: bool = False) -> dict[str, Any]:
    return {
        "content": [{"type": "text", "text": json.dumps(data, default=str, indent=2)}],
        "structuredContent": data,
        "isError": is_error,
    }


def _uuid(value: Any, name: str) -> uuid.UUID:
    try:
        return uuid.UUID(str(value))
    except (TypeError, ValueError) as exc:
        raise HttpError(422, f"{name} must be a valid UUID") from exc


def _payload_without(args: dict[str, Any], *keys: str) -> dict[str, Any]:
    return {key: value for key, value in args.items() if key not in keys}


def _call_tool(request: HttpRequest, name: str, args: dict[str, Any]) -> Any:
    if name == "search_articles":
        return authoring_list_articles(
            request,
            q=str(args.get("query", "")),
            status=str(args.get("status", "")),
            limit=int(args.get("limit", 20)),
        )
    if name == "get_article":
        return authoring_get_article(request, _uuid(args.get("article_id"), "article_id"))
    if name == "create_article_draft":
        return authoring_create_article(request, ArticleDraftCreatePayload(**args))
    if name == "update_article_draft":
        article_id = _uuid(args.get("article_id"), "article_id")
        return authoring_update_article(
            request,
            article_id,
            ArticleDraftUpdatePayload(**_payload_without(args, "article_id")),
        )
    if name == "validate_article":
        return authoring_validate_article(request, _uuid(args.get("article_id"), "article_id"))
    if name == "list_categories":
        return authoring_list_categories(request)
    if name == "create_category":
        return authoring_create_category(request, CategoryCreatePayload(**args))
    if name == "list_tags":
        return authoring_list_tags(request)
    if name == "create_tag":
        return authoring_create_tag(request, TagCreatePayload(**args))
    if name == "set_article_compatibility":
        article_id = _uuid(args.get("article_id"), "article_id")
        return authoring_set_compatibility(
            request,
            article_id,
            CompatibilityPayload(**_payload_without(args, "article_id")),
        )
    raise HttpError(404, f"Unknown tool: {name}")


@csrf_exempt
@require_http_methods(["GET", "POST"])
def authoring_mcp(request: HttpRequest) -> HttpResponse:
    if not _authenticate(request):
        return _unauthorized(request)

    if request.method == "GET":
        return JsonResponse(
            {
                "name": "TechWiki Authoring",
                "description": "Owner-only draft authoring tools for TechWiki.",
                "protocolVersion": PROTOCOL_VERSION,
                "publishingEnabled": False,
            }
        )

    try:
        body = json.loads(request.body)
    except (json.JSONDecodeError, UnicodeDecodeError):
        return _json_rpc_error(None, -32700, "Parse error", 400)

    request_id = body.get("id") if isinstance(body, dict) else None
    if not isinstance(body, dict) or body.get("jsonrpc") != "2.0" or not body.get("method"):
        return _json_rpc_error(request_id, -32600, "Invalid Request", 400)

    method = str(body["method"])
    requested_version = request.headers.get("MCP-Protocol-Version", LEGACY_PROTOCOL_VERSION)
    if requested_version == PROTOCOL_VERSION:
        if request.headers.get("Mcp-Method") != method:
            return _json_rpc_error(
                request_id,
                -32020,
                "Mcp-Method header must match the JSON-RPC method",
                400,
            )
        if method == "tools/call":
            tool_name = str((body.get("params") or {}).get("name", ""))
            if request.headers.get("Mcp-Name") != tool_name:
                return _json_rpc_error(
                    request_id,
                    -32020,
                    "Mcp-Name header must match params.name",
                    400,
                )

    if method == "server/discover":
        return _json_rpc_result(
            request_id,
            {
                "protocolVersion": PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "_meta": {
                    "io.modelcontextprotocol/serverInfo": {
                        "name": "techwiki-authoring",
                        "version": "1.0.0",
                    }
                },
            },
        )
    if method == "initialize":
        return _json_rpc_result(
            request_id,
            {
                "protocolVersion": LEGACY_PROTOCOL_VERSION,
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "techwiki-authoring", "version": "1.0.0"},
            },
        )
    if method == "tools/list":
        return _json_rpc_result(
            request_id,
            {"tools": TOOLS, "ttlMs": 300_000, "cacheScope": "private"},
        )
    if method == "tools/call":
        params = body.get("params") or {}
        name = params.get("name")
        args = params.get("arguments") or {}
        if not isinstance(name, str) or not isinstance(args, dict):
            return _json_rpc_error(request_id, -32602, "Invalid tool arguments")
        try:
            return _json_rpc_result(request_id, _tool_result(_call_tool(request, name, args)))
        except (HttpError, ValueError, TypeError) as exc:
            message = str(getattr(exc, "message", exc))
            return _json_rpc_result(request_id, _tool_result({"error": message}, is_error=True))

    return _json_rpc_error(request_id, -32601, "Method not found")
