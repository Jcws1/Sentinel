"""Exact pre-optimization dry-run results and candidate-refusal isolation."""
import asyncio
import hashlib
import json
from copy import deepcopy
from pathlib import Path

import pytest

from app.commands import scheduler
from app.commands.kinematics import geographic
from app.commands.zone_rules import blocked
from app.scenarios.contracts import ScenarioContent
from app.world.serialization import canonical
from test_conductor import ready
from test_d3a import chain
from test_interactive import Harness

ROOT = Path(__file__).resolve().parents[2]
CASES = json.loads((Path(__file__).parent / 'fixtures/scheduler-equivalence.json').read_text())


@pytest.mark.parametrize('case', CASES, ids=lambda case: case['name'])
def test_nominal_plan_matches_exact_pre_optimization_content(case):
    # Goldens were captured from the preserved current working-tree baseline,
    # not an older commit. Hash every field, including completion samples.
    value = json.loads((ROOT / case['fixture']).read_text()) if 'fixture' in case else case['content']
    content = ScenarioContent.model_validate(value)
    before = canonical(content)
    plan = scheduler.nominal_plan(content)
    assert hashlib.sha256(canonical({'actions': plan}).encode()).hexdigest() == case['planSha256']
    assert canonical(content) == before


def test_refused_candidate_preserves_motion_progress_geometry_and_track(monkeypatch):
    h = Harness()
    async def exercise():
        mid, _, _ = await ready(h, chain())
        assert (await h.act(mid, 'acquire')).accepted
        assert (await h.act(mid, 'start')).accepted
        frame = json.loads(h.repo.latest_text(mid))
        checkpoint = h.repo.checkpoint(mid)
        item = checkpoint['scenarioSchedule']['actions'][0]
        motion = deepcopy(item['motion'])
        position = deepcopy(frame['tracks'][item['trackId']]['latest']['position'])
        frame['interactive']['tick'] = 1
        monkeypatch.setattr(scheduler, 'blocked', lambda frame, origin, destination=None, **kwargs:
                            'New boundary rejects this candidate.' if destination is not None else None)
        scheduler.advance(frame, checkpoint)
        assert item['state'] == 'Failed'
        assert item['motion'] == motion
        assert frame['tracks'][item['trackId']]['latest']['position'] == position
        assert [e['state'] for e in checkpoint['scenarioSchedule']['actions']] == ['Failed', 'Skipped', 'Skipped']
    try:
        asyncio.run(exercise())
    finally:
        h.repo.close()


@pytest.mark.parametrize('geometry', [None, dict(modelId='local-horizontal-v2', halfExtentMetres=5000,
    origin=dict(longitudeDeg=151.1772, latitudeDeg=-33.9461))])
def test_unrestricted_fast_path_observes_boundary_changes_and_edge_contact(geometry):
    frame = dict(interactive={'localGeometry': geometry}, boundaryRules={'zones': {}}, zones={})
    origin, destination = geographic(0, 0, geometry), geographic(30, 0, geometry)
    assert blocked(frame, origin, destination) is None
    ring = [list(geographic(x, y, geometry).values()) for x, y in [(20, -20), (30, -20), (30, 20), (20, 20)]]
    frame['zones']['wall'] = dict(label='Wall', geometry=dict(coordinates=[ring + ring[:1]]))
    frame['boundaryRules']['zones']['wall'] = 'restricted'
    assert 'Wall' in blocked(frame, origin, destination)
    assert 'Wall' in blocked(frame, geographic(20, 0, geometry))
    frame['boundaryRules']['zones']['wall'] = 'annotation'
    assert blocked(frame, origin, destination) is None
