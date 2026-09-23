"""Fail-closed authentication boundary for the private cloud demo.

HTTP clients send a bearer token. Browser WebSockets offer sentinel-v1 and
auth.<token> subprotocols; only sentinel-v1 is echoed. Never put keys in URLs.
This module does not change simulation or observation behavior.
"""
import hmac
import re

from starlette.responses import JSONResponse


class PrivateDemoBoundary:
    def __init__(self, app, token: str, origins: list[str]):
        if not re.fullmatch(r"[A-Za-z0-9_-]{32,}", token):
            raise ValueError("A private demo token of at least 32 URL-safe characters is required")
        if not origins or any(not x.startswith("https://") or x.endswith("/") for x in origins):
            raise ValueError("Explicit HTTPS frontend origins without trailing slashes are required")
        self.app, self.token, self.origins = app, token, frozenset(origins)

    async def __call__(self, scope, receive, send):
        if scope["type"] not in {"http", "websocket"}:
            return await self.app(scope, receive, send)
        headers = dict(scope.get("headers", []))
        origin = headers.get(b"origin", b"").decode("latin1")
        websocket = scope["type"] == "websocket"
        allowed = origin in self.origins
        if websocket:
            protocols = scope.get("subprotocols", [])
            tokens = [x[5:] for x in protocols if x.startswith("auth.")]
            authorized = allowed and "sentinel-v1" in protocols and len(tokens) == 1 and hmac.compare_digest(tokens[0].encode(), self.token.encode())
            if not authorized:
                return await send({"type": "websocket.close", "code": 1008})
            clean = dict(scope)
            clean["subprotocols"] = ["sentinel-v1"]
            clean["headers"] = [(k, v) for k, v in scope.get("headers", []) if k != b"sec-websocket-protocol"]

            async def socket_send(message):
                if message["type"] == "websocket.accept":
                    message = {**message, "subprotocol": "sentinel-v1"}
                await send(message)

            return await self.app(clean, receive, socket_send)

        if scope["path"] == "/healthz" and scope["method"] == "GET":
            return await JSONResponse({"status": "ok"}, headers={"Cache-Control": "no-store"})(scope, receive, send)
        if origin and not allowed:
            return await JSONResponse({"detail": "Origin not allowed"}, status_code=403)(scope, receive, send)
        cors = {"Access-Control-Allow-Origin": origin, "Vary": "Origin"} if allowed else {}
        if scope["method"] == "OPTIONS":
            return await JSONResponse({}, status_code=200 if allowed else 403, headers={
                **cors, "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
                "Access-Control-Allow-Headers": "Authorization, Content-Type",
                "Cache-Control": "no-store",
            })(scope, receive, send)
        authorization = headers.get(b"authorization", b"")
        if not hmac.compare_digest(authorization, ("Bearer " + self.token).encode()):
            return await JSONResponse({"detail": "Authentication required"}, status_code=401,
                headers={**cors, "Cache-Control": "no-store", "WWW-Authenticate": "Bearer"})(scope, receive, send)

        async def http_send(message):
            if message["type"] == "http.response.start":
                message = {**message, "headers": [*message.get("headers", []),
                    *[(k.encode(), v.encode()) for k, v in cors.items()]]}
            await send(message)

        return await self.app(scope, receive, http_send)
