"""Exercise authored map cases through the same durable authority as all sources."""
from fastapi.testclient import TestClient

from app.main import create_app
from app.missions.fixtures import fixture_source, instant

MID = "fixture-tactical"
AREA = MID + "-area"


def entity(suffix):
    return MID + "-" + suffix


def track(suffix):
    return entity(suffix) + "-track"


def next_delta(websocket):
    while True:
        message = websocket.receive_json()
        if message["type"] == "delta":
            return message


def test_tactical_initial_frame_has_authored_affiliations_zone_and_missing_data():
    with TestClient(create_app(":memory:", True)) as client:
        mission = next(item for item in client.get("/api/missions").json()["missions"] if item["id"] == MID)
        assert mission["name"] == "Synthetic Tactical"
        assert mission["extensions"]["sentinel.fixture"] == {"version": 1}
        world = client.get(f"/api/missions/{MID}/world").json()
        assert (len(world["entities"]), len(world["tracks"])) == (6, 5)
        current = [item for item in world["tracks"].values() if item["state"] == "tracking"]
        assert {world["entities"][item["entityId"]]["affiliation"] for item in current} == {
            "friendly", "hostile", "neutral", "unknown",
        }
        assert track("unlocated-01") not in world["tracks"]
        assert world["entities"][entity("unlocated-01")]["presence"] == "present"
        stale = world["tracks"][track("stale-01")]
        assert stale["state"] == "stale"
        assert stale["latest"]["timestamp"] < world["effectiveAt"]
        assert world["entities"][entity("stale-01")]["presence"] == "unobserved"
        assert world["mission"]["zoneIds"] == [AREA]
        assert world["zones"][AREA]["purpose"] == "test-area"
        assert "altitudeBand" not in world["zones"][AREA]
        assert world["assets"] == world["sensors"] == world["tasks"] == {}
        for item in world["entities"].values():
            assert "classification" not in item
            assert item["condition"] == "unknown"
        for item in world["tracks"].values():
            assert "confidence" not in item["latest"]
            assert "velocity" not in item["latest"]
            assert item["latest"]["position"]["altitude"]["reference"] == "MSL"


def test_tactical_commits_move_add_remove_and_lose_position_atomically():
    with TestClient(create_app(":memory:", True)) as client:
        before = client.get(f"/api/missions/{MID}/world").json()
        alpha_before = client.get("/api/missions/fixture-alpha/world").json()
        with client.websocket_connect(f"/api/missions/{MID}/stream") as websocket:
            assert websocket.receive_json()["frame"] == before
            first = client.post(f"/api/fixtures/{MID}/advance", json={"expectedSequence": 0}).json()
            first_delta = next_delta(websocket)
            assert first_delta["frameId"] == first["frameId"]
            assert (len(first["entities"]), len(first["tracks"])) == (7, 6)
            assert first["tracks"][track("friendly-01")]["latest"]["position"] != before["tracks"][track("friendly-01")]["latest"]["position"]
            assert entity("friendly-02") in first_delta["changes"]["entities"]["upserts"]
            assert first["zones"][AREA]["geometry"] != before["zones"][AREA]["geometry"]
            assert first_delta["changes"]["zones"]["upserts"][AREA] == first["zones"][AREA]
            assert client.post(f"/api/fixtures/{MID}/advance", json={"expectedSequence": 0}).status_code == 409

            second = client.post(f"/api/fixtures/{MID}/advance", json={"expectedSequence": 1}).json()
            second_delta = next_delta(websocket)
            assert second_delta["frameId"] == second["frameId"]
            assert (second_delta["previousSequence"], second_delta["sequence"]) == (1, 2)
            assert (len(second["entities"]), len(second["tracks"])) == (6, 4)
            assert entity("unknown-01") not in second["entities"]
            assert entity("friendly-01") in second["entities"]
            assert track("friendly-01") not in second["tracks"]
            assert second_delta["changes"]["entities"]["removes"] == [entity("unknown-01")]
            assert set(second_delta["changes"]["tracks"]["removes"]) == {track("friendly-01"), track("unknown-01")}
            assert client.get(f"/api/missions/{MID}/world").json() == second
        assert client.get("/api/missions/fixture-alpha/world").json() == alpha_before


def test_tactical_restart_preserves_committed_stage_and_opt_in_guard(tmp_path):
    path = str(tmp_path / "tactical.sqlite3")
    with TestClient(create_app(path, True)) as client:
        client.post(f"/api/fixtures/{MID}/advance", json={"expectedSequence": 0})
        saved = client.post(f"/api/fixtures/{MID}/advance", json={"expectedSequence": 1}).json()
    with TestClient(create_app(path, True)) as client:
        assert client.get(f"/api/missions/{MID}/world").json() == saved
        third = client.post(f"/api/fixtures/{MID}/advance", json={"expectedSequence": 2}).json()
        assert third["sequence"] == 3
        assert (len(third["entities"]), len(third["tracks"])) == (6, 5)
        assert track("friendly-01") in third["tracks"]
        assert entity("unknown-01") in third["entities"]
    with TestClient(create_app(path, False)) as client:
        assert client.get(f"/api/missions/{MID}/world").json() == third
        assert client.post(f"/api/fixtures/{MID}/advance", json={"expectedSequence": 3}).status_code == 404


def test_tactical_source_is_deterministic_and_returns_independent_snapshots():
    for sequence in range(6):
        first = fixture_source(MID, sequence, instant(100))
        second = fixture_source(MID, sequence, instant(100))
        assert first == second
        first[0]["tracks"].clear()
        first[0]["zones"][AREA]["geometry"]["coordinates"][0][0][0] = 0.0
        assert fixture_source(MID, sequence, instant(100)) == second
