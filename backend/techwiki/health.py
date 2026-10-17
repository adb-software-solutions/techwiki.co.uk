"""`GET /healthz` for Docker's health check, and `GET /metrics` for Prometheus.

    200 {"status": "ok", ...}        the database and every cache answer
    200 {"status": "degraded", ...}  the database or a cache does not answer;
                                     restarting this container would not fix
                                     it (and a deploy should not wait on it)

A backend that cannot answer at all fails the check, so "unhealthy" (503) is
never reported here. Both paths are answered by health_middleware, first in
MIDDLEWARE, so no host check (Docker calls 127.0.0.1), HTTPS redirect,
session or login applies, and neither request is counted in the HTTP
metrics. nginx returns 404 for both on the public domains.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from functools import partial
from typing import Any, cast

from asgiref.sync import iscoroutinefunction, sync_to_async
from django.conf import settings
from django.core.cache import caches
from django.db import connection
from django.http import HttpRequest, HttpResponse, JsonResponse
from django.utils.decorators import sync_and_async_middleware
from django_prometheus.exports import ExportToDjangoView

HEALTH_PATH = "/healthz"
METRICS_PATH = "/metrics"


def _check(probe: Callable[[], object]) -> dict[str, Any]:
    try:
        probe()
    except Exception as exc:  # Any failure is reported, not raised.
        return {"ok": False, "error": type(exc).__name__}
    return {"ok": True}


def _database() -> None:
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")


def _cache(alias: str) -> None:
    caches[alias].get("healthz")


def report() -> tuple[int, dict[str, Any]]:
    """(HTTP status, JSON body)."""
    checks = {"database": _check(_database)}
    for alias in settings.CACHES:
        checks[f"cache:{alias}"] = _check(partial(_cache, alias))
    status = "ok" if all(check["ok"] for check in checks.values()) else "degraded"
    return 200, {"status": status, "checks": checks}


def _answer(request: HttpRequest) -> HttpResponse:
    if request.path_info == HEALTH_PATH:
        code, body = report()
        response: HttpResponse = JsonResponse(body, status=code)
    else:
        response = ExportToDjangoView(request)
    response["Cache-Control"] = "no-store"
    return response


Handler = Callable[[HttpRequest], HttpResponse]
AsyncHandler = Callable[[HttpRequest], Awaitable[HttpResponse]]


@sync_and_async_middleware
def health_middleware(get_response: Handler | AsyncHandler) -> Handler | AsyncHandler:
    paths = {HEALTH_PATH, METRICS_PATH}

    if iscoroutinefunction(get_response):
        async_get_response = cast(AsyncHandler, get_response)

        async def async_middleware(request: HttpRequest) -> HttpResponse:
            if request.path_info in paths:
                return await sync_to_async(_answer)(request)
            return await async_get_response(request)

        return async_middleware

    sync_get_response = cast(Handler, get_response)

    def middleware(request: HttpRequest) -> HttpResponse:
        if request.path_info in paths:
            return _answer(request)
        return sync_get_response(request)

    return middleware
