"""OAuth protected-resource metadata for the private authoring MCP server."""

from django.http import HttpRequest, JsonResponse
from django.views.decorators.http import require_GET

from apps.wiki.authoring_api import SAFE_AUTHORING_SCOPES


@require_GET
def authoring_protected_resource_metadata(request: HttpRequest) -> JsonResponse:
    issuer = request.build_absolute_uri("/").rstrip("/")
    return JsonResponse(
        {
            "resource": f"{issuer}/admin-mcp",
            "authorization_servers": [issuer],
            "scopes_supported": sorted(SAFE_AUTHORING_SCOPES),
            "bearer_methods_supported": ["header"],
        }
    )
