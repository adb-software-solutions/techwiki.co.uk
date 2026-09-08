"""
URL configuration for techwiki.co.uk project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/4.2/topics/settings/
"""

import logging

from django.conf import settings
from django.conf.urls.static import static
from django.contrib import admin
from django.urls import include, path

from apps.wiki.authoring_mcp import authoring_mcp
from apps.wiki.authoring_metadata import authoring_protected_resource_metadata
from apps.wiki.authoring_oauth import (
    oauth_authorization_server_metadata,
    oauth_authorize,
    oauth_revoke,
    oauth_token,
)
from techwiki.ninja.routers import api

logger = logging.getLogger(__name__)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("accounts/", include("django.contrib.auth.urls")),
    path(".well-known/oauth-authorization-server", oauth_authorization_server_metadata),
    path(".well-known/oauth-protected-resource", authoring_protected_resource_metadata),
    path("oauth/authorize", oauth_authorize),
    path("oauth/token", oauth_token),
    path("oauth/revoke", oauth_revoke),
    path("admin-mcp", authoring_mcp),
    path("api/", api.urls),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)  # type: ignore[arg-type]
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)  # type: ignore[arg-type]
