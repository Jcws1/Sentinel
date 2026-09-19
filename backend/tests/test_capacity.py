"""40 moving entities retain durable revisions, bounded control and recordings."""
import asyncio
import json
from copy import deepcopy

import pytest
from pydantic import ValidationError

from app.scenarios.contracts import ScenarioContent, ScenarioRevision, ScenarioReceipt, ScenarioList
from app.scenarios.service import ScenarioService
from app.world.serialization import canonical, read_frame
from test_interactive import Harness, CREDENTIAL
from test_scenarios import content, write, run_request
from test_d4 import arrangement, policy, fleet
from test_movement import ticks


def forty():
    unit = content()["units"][0]
    units, actions = [], []
    for i in range(40):
        current = deepcopy(unit)
        current.update(id=f"u-{i}", label=f"Unit {i}", profileId="hornet-10-v1",
                       category="friendly" if i < 20 else "hostile",
                       commandRole="sentinel" if i < 20 else "observation")
        current["position"]["latitudeDeg"] += i * .0001
        units.append(current)
        actions.append({"id": f"a-{i}", "unitId": current["id"], "kind": "move",
                        "offsetMs": 0, "ordinal": i,
                        "destination": {"longitudeDeg": 103.88, "latitudeDeg": current["position"]["latitudeDeg"]}})
    return {"name": "Capacity 20v20", "units": units, "actions": actions,
            "scheduleRuleVersion": "local-schedule-v2"}


def test_bounded_capacity_and_strict_old_revision():
    data = forty()
    assert len(ScenarioContent.model_validate(data).units) == 40
    extra = deepcopy(data["units"][0])
    extra["id"] = "over-limit"
    with pytest.raises(ValidationError):
        ScenarioContent.model_validate({**data, "units": [*data["units"], extra]})
    controlled = deepcopy(data)
    for unit in controlled["units"][:33]:
        unit.update(category="friendly", commandRole="sentinel")
    with pytest.raises(ValidationError, match="32 Sentinel-controlled"):
        ScenarioContent.model_validate(controlled)


def test_20v20_moves_pauses_and_survives_recording_reopen(tmp_path):
    h = Harness(tmp_path / "capacity.sqlite3")
    async def run():
        scenarios = ScenarioService(h.authority, True)
        saved = await scenarios.write(write(forty()))
        revision = saved.result
        assert revision.schema_version == "1.5"
        raw = json.loads(canonical(revision))
        envelope = json.loads(canonical(saved))
        assert ScenarioReceipt.model_validate(envelope).result == revision
        with pytest.raises(ValidationError, match="scenario envelope 1.5"):
            ScenarioReceipt.model_validate({**envelope, "schemaVersion": "1.4"})
        assert ScenarioList(schema_version="1.5", scenarios=[revision]).scenarios == [revision]
        for old in ("1.0", "1.1", "1.2", "1.3", "1.4"):
            with pytest.raises(ValidationError, match="scenario envelope 1.5"):
                ScenarioList(schema_version=old, scenarios=[revision])
        legacy_content = forty()
        legacy_content["units"] = legacy_content["units"][:32]
        legacy_content["actions"] = legacy_content["actions"][:32]
        old_saved = await scenarios.write(write(legacy_content))
        old_envelope = {**json.loads(canonical(old_saved)), "schemaVersion": "1.4"}
        assert ScenarioReceipt.model_validate(old_envelope).result.schema_version == "1.4"
        assert ScenarioList(schema_version="1.0", scenarios=[old_saved.result]).scenarios == [old_saved.result]
        with pytest.raises(ValidationError, match="schema and content version"):
            ScenarioRevision.model_validate({**raw, "schemaVersion": "1.4"})
        request = run_request(revision)
        receipt = await h.service.create(request)
        assert await h.service.create(request) == receipt
        mid = receipt.mission_id
        assert (await h.act(mid, "acquire")).accepted
        assert (await h.act(mid, "start")).accepted
        original = h.authority.read(mid)
        for _ in range(6):
            h.advance(.2)
            await h.service.tick()
        moving = h.authority.read(mid)
        assert len(moving.entities) == 40 and len(moving.interactive.controls) == 20
        assert all(t.latest.position != original.tracks[t.id].latest.position for t in moving.tracks.values())
        assert all(t.latest.velocity.speed_mps > 0 for t in moving.tracks.values())
        assert (await h.act(mid, "pause")).accepted
        paused = h.authority.read(mid)
        h.advance(.4)
        await h.service.tick()
        assert h.authority.read(mid).tracks == paused.tracks
        assert (await h.act(mid, "resume")).accepted
        h.advance(.2)
        await h.service.tick()
        assert (await h.act(mid, "end")).accepted
        ended = h.repo.latest_text(mid)
        assert len(read_frame(ended).entities) == 40
        h.repo.close()
        reopened = Harness(tmp_path / "capacity.sqlite3")
        try:
            assert reopened.repo.latest_text(mid) == ended
            assert ScenarioService(reopened.authority, True).get(revision.definition_id) == revision
        finally:
            reopened.repo.close()
    try:
        asyncio.run(run())
    finally:
        h.repo.close()


def test_20v20_existing_intercept_allocation_outcomes_and_idempotency():
    h = Harness()
    async def run():
        data = arrangement(20, 20)
        for unit in data['units']:
            unit['profileId'] = 'hornet-10-v1'
        revision = (await ScenarioService(h.authority, True).write(write(data))).result
        mid = (await h.service.create(run_request(revision))).mission_id
        assert (await h.act(mid, 'acquire')).accepted
        assert (await h.act(mid, 'start')).accepted
        await ticks(h, 1)
        request = await policy(h, mid)
        accepted = await h.service.command(mid, request, CREDENTIAL)
        assert accepted.accepted
        committed = h.repo.latest_text(mid)
        assert await h.service.command(mid, request, CREDENTIAL) == accepted
        assert h.repo.latest_text(mid) == committed
        await ticks(h, 1)
        active = [a for a in fleet(h, mid).assignments if a.state == 'active']
        assert len(active) == 20
        assert len({a.target_id for a in active}) == 20
        await ticks(h, 35)
        result = h.authority.read(mid)
        assert len(result.fleet_behavior.outcomes) == 20
        assert all(e.condition == 'non-operational' for e in result.entities.values())
        assert (await h.act(mid, 'end')).accepted
        assert all(e.condition == 'non-operational' for e in read_frame(h.repo.latest_text(mid)).entities.values())
    try:
        asyncio.run(run())
    finally:
        h.repo.close()
