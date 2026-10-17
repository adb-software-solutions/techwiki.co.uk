# apps/village/asgi_middleware/log_graphql_400_requests.py
import asyncio
import logging
from collections.abc import Awaitable, Callable, MutableMapping
from typing import Any

# Define the standard ASGI types that Starlette and other servers expect.
Scope = MutableMapping[str, Any]
Message = MutableMapping[str, Any]
Receive = Callable[[], Awaitable[Message]]
Send = Callable[[Message], Awaitable[None]]
ASGIApp = Callable[[Scope, Receive, Send], Awaitable[None]]

logger = logging.getLogger("django.request")


class GraphQL400LoggerMiddleware:
    """
    ASGI middleware to log the request body for GraphQL requests that
    result in a 400 Bad Request response.
    """

    def __init__(self, app: Callable[..., Awaitable[None]]) -> None:
        """
        Initializes the middleware. We use a general Callable to accept
        the Django ASGI handler without type conflicts.

        Args:
            app: The ASGI application to wrap.
        """
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        """
        The main ASGI application entry point, compliant with Starlette's types.

        Args:
            scope: The ASGI connection scope.
            receive: An awaitable callable to receive events.
            send: An awaitable callable to send events.
        """
        path = scope.get("path", "")
        method = scope.get("method", "")
        logger.debug("[ASGI] Received %s %s", method, path)

        if scope.get("type") != "http" or scope.get("path") != "/graphql/":
            # The wrapped app (self.app) has a signature that mypy infers from
            # Django, which is slightly different from the standard ASGIApp.
            # We ignore the type error because we know they are compatible in practice.
            logger.debug("[ASGI] Passing to Django: %s %s", method, path)

            # Wrap send to log when response is sent
            async def wrapped_send(message: Message) -> None:
                if message["type"] == "http.response.start":
                    logger.debug(
                        "[ASGI] Sending response start for: %s %s - status: %s",
                        method,
                        path,
                        message.get("status"),
                    )
                elif message["type"] == "http.response.body":
                    logger.debug("[ASGI] Sending response body for: %s %s", method, path)
                await send(message)

            logger.debug("[ASGI] About to call Django app for: %s %s", method, path)
            await self.app(scope, receive, wrapped_send)  # type: ignore[arg-type]
            logger.debug("[ASGI] Django returned for: %s %s", method, path)
            return

        logger.debug("[ASGI] Processing GraphQL request")
        body: bytes = b""
        more_body: bool = True
        received_messages: list[Message] = []

        try:
            while more_body:
                message = await receive()
                received_messages.append(message)
                if message["type"] == "http.request":
                    body += message.get("body", b"")
                    more_body = message.get("more_body", False)
        except Exception as e:
            logger.warning("[ASGI Middleware] Error capturing body: %s", e)
            raise

        message_queue: asyncio.Queue[Message] = asyncio.Queue()
        for msg in received_messages:
            await message_queue.put(msg)

        async def replay_receive() -> Message:
            return await message_queue.get()

        status_holder: dict[str, int] = {}

        async def graphql_wrapped_send(message: Message) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = message["status"]
            await send(message)

        # As before, we ignore the type incompatibility when calling the wrapped app.
        await self.app(scope, replay_receive, graphql_wrapped_send)  # type: ignore[arg-type]

        if status_holder.get("status") == 400:
            logger.warning("[GraphQL 400] Body:\n%s", body.decode("utf-8", errors="replace"))
