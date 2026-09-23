import pytest
from fastapi import FastAPI, WebSocket
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.deployment_security import PrivateDemoBoundary

TOKEN = "test_only_" + "a" * 32
ORIGIN = "https://private.example.test"


def client():
    app = FastAPI()

    @app.get("/api/test")
    async def read():
        return {"private": True}

    @app.post("/api/wedgetail/observation")
    async def ingest():
        return {"accepted": True}

    @app.post("/api/scenarios")
    async def author():
        return {"saved": True}

    @app.websocket("/api/stream")
    async def stream(ws: WebSocket):
        await ws.accept()
        await ws.send_json({"private": True})
        await ws.close()

    return TestClient(PrivateDemoBoundary(app, TOKEN, [ORIGIN]))


def test_requires_configuration():
    with pytest.raises(ValueError):
        PrivateDemoBoundary(FastAPI(), "", [ORIGIN])
    with pytest.raises(ValueError):
        PrivateDemoBoundary(FastAPI(), TOKEN, ["*"])


def test_anonymous_reads_are_public_but_ingestion_is_denied():
    with client() as c:
        assert c.get("/healthz").json() == {"status": "ok"}
        assert c.get("/api/test").status_code == 200
        assert c.post("/api/wedgetail/observation").status_code == 401
        assert c.post("/api/scenarios", headers={"Origin": ORIGIN}).status_code == 200
        assert c.post("/api/scenarios", headers={"Origin": "https://evil.test"}).status_code == 403
        assert c.get("/api/test?token=" + TOKEN).status_code == 200


def test_authorized_http_and_cors():
    with client() as c:
        headers = {"Authorization": "Bearer " + TOKEN, "Origin": ORIGIN}
        response = c.get("/api/test", headers=headers)
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == ORIGIN
        assert c.post("/api/wedgetail/observation", headers=headers).status_code == 200
        assert c.get("/api/test", headers={**headers, "Origin": "https://evil.test"}).status_code == 403
        assert c.options("/api/test", headers={"Origin": ORIGIN}).status_code == 200
        assert c.options("/api/test", headers={"Origin": "https://evil.test"}).status_code == 403


@pytest.mark.parametrize("origin,protocols", [
    (ORIGIN, []), (ORIGIN, ["sentinel-v1", "auth.wrong"]),
    ("https://evil.test", ["sentinel-v1", "auth." + TOKEN]),
])
def test_unauthorized_websockets_are_denied(origin, protocols):
    with client() as c, pytest.raises(WebSocketDisconnect):
        with c.websocket_connect("/api/stream", headers={"Origin": origin}, subprotocols=protocols):
            pytest.fail("unauthorized connection was accepted")


def test_authorized_websocket_never_echoes_token():
    with client() as c:
        with c.websocket_connect("/api/stream", headers={"Origin": ORIGIN},
                subprotocols=["sentinel-v1", "auth." + TOKEN]) as ws:
            assert ws.accepted_subprotocol == "sentinel-v1"
            assert ws.receive_json() == {"private": True}


def test_public_websocket_uses_only_the_safe_protocol():
    with client() as c:
        with c.websocket_connect("/api/stream", headers={"Origin": ORIGIN},
                subprotocols=["sentinel-v1"]) as ws:
            assert ws.accepted_subprotocol == "sentinel-v1"
            assert ws.receive_json() == {"private": True}


def test_real_backend_starts_behind_boundary(tmp_path):
    from app.main import create_app

    database = tmp_path / "test.sqlite3"
    app = create_app(db_path=str(database), fixtures_enabled=False, demo_enabled=False)
    with TestClient(PrivateDemoBoundary(app, TOKEN, [ORIGIN])) as c:
        assert c.get("/api/missions").status_code == 200
        assert c.get("/api/missions", headers={"Authorization": "Bearer " + TOKEN}).status_code == 200
    assert database.is_file()
    # Reopen the same on-disk schema; this is startup/storage compatibility,
    # not proof of deployed mission persistence or hosted reconnect behavior.
    reopened = create_app(db_path=str(database), fixtures_enabled=False, demo_enabled=False)
    with TestClient(PrivateDemoBoundary(reopened, TOKEN, [ORIGIN])) as c:
        assert c.get("/api/missions", headers={"Authorization": "Bearer " + TOKEN}).status_code == 200
