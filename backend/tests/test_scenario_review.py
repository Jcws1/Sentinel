"""D1b review is an advisory read, never an alternate run admission path."""
import asyncio
import json
import pytest
from fastapi.testclient import TestClient
from app.main import create_app
from app.commands.errors import CommandError
from app.commands.kinematics import cruise_speed
from app.scenarios.contracts import ScenarioRef
from app.scenarios.service import ScenarioService
from app.world.serialization import canonical
from test_interactive import Harness
from test_scenarios import content, write, run_request


def reference(revision):
    return ScenarioRef(definition_id=revision.definition_id, revision=revision.revision, content_hash=revision.content_hash)


def test_review_is_exact_read_only_and_describes_existing_preset():
    h = Harness()
    async def run():
        service = ScenarioService(h.authority, True)
        revision = (await service.write(write())).result
        before = list(h.repo.db.iterdump())
        review = service.review(reference(revision))
        assert review.can_run and not review.issues
        assert review.counts.model_dump() == dict(total=4, friendly=2, hostile=1, unknown=1, controlled=1, observation_only=3)
        assert review.motion_preset.template_id == "singapore-local-v2"
        assert review.motion_preset.model_id == "local-horizontal-v1"
        assert review.motion_preset.speed_mps == cruise_speed("singapore-local-v2")
        assert review.reference == reference(revision)
        assert list(h.repo.db.iterdump()) == before
        await service.write(write({**content(), "name": "New head"}, 1), revision.definition_id)
        assert service.review(reference(revision)).name == revision.content.name
    asyncio.run(run())


def test_successful_review_cannot_bypass_later_run_admission():
    h = Harness()
    async def run():
        service = ScenarioService(h.authority, True)
        revision = (await service.write(write())).result
        assert service.review(reference(revision)).can_run
        first = await h.service.create(run_request(revision))
        next_request = run_request(revision)
        rejected = await h.service.create(next_request)
        assert not rejected.accepted and rejected.code == "ACTIVE_RUN_EXISTS"
        assert await h.service.create(next_request) == rejected
        blocked = service.review(reference(revision))
        assert not blocked.can_run and blocked.active_mission_id == first.mission_id
        assert [i.code for i in blocked.issues] == ["ACTIVE_RUN_EXISTS"]
        assert h.repo.db.execute("SELECT count(*) FROM recordings").fetchone()[0] == 1
    asyncio.run(run())


def test_empty_and_disabled_review_has_actionable_blockers_without_writes():
    h = Harness()
    async def run():
        service = ScenarioService(h.authority, True)
        revision = (await service.write(write({"name": "Empty", "units": []}))).result
        before = list(h.repo.db.iterdump())
        review = ScenarioService(h.authority, False).review(reference(revision))
        assert not review.can_run
        assert [i.code for i in review.issues] == ["EMPTY_ARRANGEMENT", "DEMO_DISABLED"]
        assert all(i.message for i in review.issues)
        assert list(h.repo.db.iterdump()) == before
        rejected = await h.service.create(run_request(revision))
        assert not rejected.accepted and rejected.code == "INVALID_REQUEST"
    asyncio.run(run())


def test_review_http_rejects_missing_or_mismatched_reference_and_exposes_no_authority(tmp_path):
    with TestClient(create_app(str(tmp_path / "review.sqlite3"), fixtures_enabled=False, demo_enabled=True)) as client:
        saved = client.post('/api/scenarios', json=json.loads(canonical(write()))).json()['result']
        ref = {key: saved[key] for key in ('definitionId', 'revision', 'contentHash')}
        review = client.post('/api/scenarios/validate', json=ref)
        assert review.status_code == 200 and review.json()['canRun']
        assert 'credential' not in review.text.lower() and 'grantId' not in review.text
        assert client.get('/api/missions').json()['missions'] == []
        assert client.post('/api/scenarios/validate', json={**ref, 'contentHash': '0' * 64}).status_code == 409
        assert client.post('/api/scenarios/validate', json={**ref, 'revision': 500}).status_code == 404
        assert client.post('/api/scenarios/validate', json={**ref, 'credential': 'forged'}).status_code == 422
        assert client.get('/api/missions').json()['missions'] == []
