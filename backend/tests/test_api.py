import time
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect
import pytest
import json
from urllib.parse import quote

from app.main import create_app
from app.domain.models import WorldFrame
from app.world.serialization import canonical


def next_kind(websocket, kind):
    while True:
        message = websocket.receive_json()
        if message["type"] == kind:
            return message


def test_rest_ws_snapshot_atomic_delta_heartbeat_and_reconnect(tmp_path):
    application = create_app(str(tmp_path / "world.sqlite"), True, heartbeat_seconds=.02)
    with TestClient(application) as client:
        catalog = client.get("/api/missions")
        assert catalog.headers["cache-control"] == "no-store"
        assert catalog.json()["fixtureAdvanceEnabled"] is True
        assert len(catalog.json()["missions"]) == 5
        before = client.get("/api/missions/fixture-alpha/world").json()
        with client.websocket_connect("/api/missions/fixture-alpha/stream") as websocket:
            snapshot = websocket.receive_json()
            assert snapshot["frame"] == before
            heartbeat = next_kind(websocket, "heartbeat")
            assert heartbeat["sequence"] == 0
            response = client.post("/api/fixtures/fixture-alpha/advance", json={"expectedSequence": 0})
            assert response.status_code == 200
            frame = response.json()
            delta = next_kind(websocket, "delta")
            assert (delta["previousSequence"], delta["sequence"], delta["frameId"]) == (0, 1, frame["frameId"])
            assert len(delta["changes"]["entities"]["upserts"]) == 4
            assert delta["recordedAt"] == frame["recordedAt"]
            assert client.post("/api/fixtures/fixture-alpha/advance", json={"expectedSequence": 0}).status_code == 409
        assert application.state.service.subscriber_count("fixture-alpha") == 0
        with client.websocket_connect("/api/missions/fixture-alpha/stream") as websocket:
            assert websocket.receive_json()["frame"] == frame
        events = client.get("/api/missions/fixture-alpha/events?after=0&limit=1").json()
        assert [event["sequence"] for event in events["events"]] == [1]
        assert events["nextAfter"] == 1
        metadata = client.get("/api/recordings/" + frame["recordingId"]).json()
        assert metadata["frameCount"] == metadata["eventCount"] == 2
        assert metadata["establishedAt"] <= frame["recordedAt"]


def test_disabled_fixtures_read_recovered_state_without_advertising_mutation(tmp_path):
    path = str(tmp_path / "world.sqlite")
    with TestClient(create_app(path, True)) as client:
        saved = client.get("/api/missions/fixture-alpha/world").json()
    with TestClient(create_app(path, False)) as client:
        assert client.get("/api/missions/fixture-alpha/world").json() == saved
        assert client.get("/api/missions").json()["fixtureAdvanceEnabled"] is False
        assert client.post("/api/fixtures/fixture-alpha/advance", json={"expectedSequence": 0}).status_code == 404


def test_api_boundary_and_recording_failure_visibility():
    application = create_app(":memory:", True)
    with TestClient(application) as client:
        for payload in ({"expectedSequence": True}, {"expectedSequence": "0"}, {"expectedSequence": 0, "extra": 1}):
            assert client.post("/api/fixtures/fixture-alpha/advance", json=payload).status_code == 422
        assert client.get("/api/missions/absent/world").status_code == 404
        assert client.get("/api/missions/absent/events").status_code == 404
        assert client.get("/api/missions/fixture-alpha/events?limit=501").status_code == 422
        assert client.get("/api/recordings/absent").status_code == 404
        application.state.service.repository.db.execute("CREATE TRIGGER fail_frame BEFORE INSERT ON frames BEGIN SELECT RAISE(ABORT, 'disk failure'); END")
        response = client.post("/api/fixtures/fixture-alpha/advance", json={"expectedSequence": 0})
        assert response.status_code == 503
        assert "no change was committed" in response.json()["detail"]
        assert client.get("/api/missions/fixture-alpha/world").json()["sequence"] == 0


def test_server_stream_rejects_client_commands_and_cleans_up():
    application = create_app(":memory:", True)
    with TestClient(application) as client:
        with client.websocket_connect("/api/missions/fixture-alpha/stream") as websocket:
            websocket.receive_json()
            websocket.send_json({"type": "mutate", "sequence": 12})
            with pytest.raises(WebSocketDisconnect) as failure:
                websocket.receive_json()
            assert failure.value.code == 1008
        assert application.state.service.subscriber_count("fixture-alpha") == 0


def test_empty_deployment_has_no_synthetic_missions():
    with TestClient(create_app(":memory:", False)) as client:
        assert client.get("/api/missions").json() == {"schemaVersion": "1.0", "missions": [], "fixtureAdvanceEnabled": False}


@pytest.mark.parametrize("mission_id", ["source/mission A", "source/events/world", "source/stream", "source?part#fragment"])
def test_generic_identifier_round_trip_through_read_routes(world, mission_id):
    world["mission"]["id"] = mission_id
    world["recordingId"] = "recording/source A"
    world["recentEvents"] = []
    for table in ("entities", "tracks", "assets", "sensors", "zones", "tasks"):
        world[table] = {}
    frame = WorldFrame.model_validate_json(json.dumps(world))
    application = create_app(":memory:", False)
    with TestClient(application) as client:
        repository = application.state.service.repository
        repository.establish(frame.mission, frame.recording_id, frame.stream_epoch, frame.recorded_at)
        repository.commit(canonical(frame), [])
        encoded = quote(mission_id, safe="")
        response = client.get(f"/api/missions/{encoded}/world")
        assert response.status_code == 200
        assert response.json()["mission"]["id"] == mission_id
        assert client.get(f"/api/missions/{encoded}/events").json()["missionId"] == mission_id
        assert client.get("/api/recordings/" + quote(frame.recording_id, safe="")).json()["id"] == frame.recording_id
        with client.websocket_connect(f"/api/missions/{encoded}/stream") as websocket:
            snapshot = websocket.receive_json()
            assert snapshot["missionId"] == snapshot["frame"]["mission"]["id"] == mission_id
