"""Exact saved-revision analysis, bounded reuse and publication independence."""
import asyncio
from copy import deepcopy

import pytest

from app.scenarios import analysis
from app.scenarios.service import ScenarioService
from app.world.serialization import canonical
from test_boundaries import boundary
from test_d3a import chain
from test_interactive import Harness
from test_scenarios import write, run_request


def test_reuse_is_immutable_and_admission_clock_are_always_current(monkeypatch):
    h = Harness()
    service = ScenarioService(h.authority, True)
    original, calls = analysis.analyze_text, []
    async def counted(text):
        calls.append(text)
        return await original(text)
    monkeypatch.setattr(analysis, 'analyze_text', counted)
    async def run():
        try:
            revision = (await service.write(write(chain()))).result
            reference = run_request(revision).scenario
            first = await service.review_async(reference)
            assert canonical(first) == canonical(service.review(reference))
            assert first.can_run and len(first.timings) == 3
            first.timings.clear()  # Client-side mutation must not alias cached analysis.
            created = await h.service.create(run_request(revision))
            h.advance(1)
            second = await service.review_async(reference)
            assert len(second.timings) == 3 and len(calls) == 1
            assert second.active_mission_id == created.mission_id
            assert second.checked_at != first.checked_at
            assert not second.can_run
            assert any(i.code == 'ACTIVE_RUN_EXISTS' for i in second.issues)
            assert canonical(second) == canonical(service.review(reference))
            assert (await h.act(created.mission_id, 'acquire')).accepted
            assert (await h.act(created.mission_id, 'end')).accepted
            assert (await service.review_async(reference)).can_run
            assert len(calls) == 1
        finally:
            await service.close()
            h.repo.close()
    asyncio.run(run())


@pytest.mark.parametrize('change', [
    lambda d: d.update(name='Renamed revision'),
    lambda d: d['units'][0]['position'].update(longitudeDeg=103.8501),
    lambda d: d['units'][0].update(profileId='sting-v1'),
    lambda d: d['actions'][0]['destination'].update(latitudeDeg=1.2901),
    lambda d: d['actions'][1].update(delayMs=400),
    lambda d: (d['actions'][1].update(afterActionId='third'), d['actions'][2].update(afterActionId='first')),
    lambda d: d.update(boundaries=[boundary(points=[(5,-10),(10,-10),(10,10),(5,10)])], boundaryRuleVersion='local-boundary-v1'),
    lambda d: d.update(localGeometry=dict(modelId='local-horizontal-v2', halfExtentMetres=5000,
                                         origin=dict(longitudeDeg=103.8501, latitudeDeg=1.29))),
])
def test_saved_input_changes_never_reuse_old_analysis(change, monkeypatch):
    h = Harness()
    service = ScenarioService(h.authority, True)
    original, calls = analysis.analyze_text, []
    async def counted(text):
        calls.append(text)
        return await original(text)
    monkeypatch.setattr(analysis, 'analyze_text', counted)
    async def run():
        try:
            data = chain()
            first = (await service.write(write(data))).result
            first_review = await service.review_async(run_request(first).scenario)
            changed = deepcopy(data)
            change(changed)
            second = (await service.write(write(changed, revision=1), first.definition_id)).result
            second_review = await service.review_async(run_request(second).scenario)
            assert len(calls) == 2
            assert second_review.reference.revision == 2
            assert second_review.reference.content_hash != first_review.reference.content_hash
            assert canonical(second_review) == canonical(service.review(run_request(second).scenario))
            assert canonical(await service.review_async(run_request(first).scenario)) == canonical(first_review)
            assert len(calls) == 2
        finally:
            await service.close()
            h.repo.close()
    asyncio.run(run())


def test_rules_profile_inputs_and_both_cache_bounds(monkeypatch):
    monkeypatch.setattr(analysis, 'MAX_ENTRIES', 2)
    h = Harness()
    service = ScenarioService(h.authority, True)
    original, calls = analysis.analyze_text, []
    async def counted(text):
        calls.append(text)
        return await original(text)
    monkeypatch.setattr(analysis, 'analyze_text', counted)
    async def run():
        try:
            references = []
            for i in range(3):
                data = chain()
                data['name'] += str(i)
                data['units'][0]['profileId'] = 'hornet-10-v1'
                revision = (await service.write(write(data))).result
                references.append(run_request(revision).scenario)
                await service.review_async(references[-1])
            assert len(service._analysis._cache) == 2
            await service.review_async(references[0])
            assert len(calls) == 4
            monkeypatch.setattr(analysis, 'RULE_VERSION', 'test-rule-change')
            await service.review_async(references[0])
            assert len(calls) == 5
            profile = analysis.profile
            monkeypatch.setattr(analysis, 'profile', lambda identity: {**profile(identity), 'reference': 'test-catalog-revision'})
            await service.review_async(references[0])
            assert len(calls) == 6
            await service.close()
            monkeypatch.setattr(analysis, 'MAX_BYTES', 1)
            await service.review_async(references[0])
            await service.review_async(references[0])
            assert len(calls) == 8
            assert service._analysis._bytes == 0 and not service._analysis._cache
        finally:
            await service.close()
            h.repo.close()
    asyncio.run(run())


def test_pending_analysis_allows_ticks_preserves_exact_revision_and_refreshes_admission(monkeypatch):
    h = Harness()
    service = ScenarioService(h.authority, True)
    entered, release = asyncio.Event(), asyncio.Event()
    original = analysis.analyze_text
    async def gated(text):
        entered.set()
        await release.wait()
        return await original(text)
    monkeypatch.setattr(analysis, 'analyze_text', gated)
    async def run():
        try:
            data = chain()
            revision = (await service.write(write(data))).result
            pending = asyncio.create_task(service.review_async(run_request(revision).scenario))
            while not entered.is_set():
                await asyncio.sleep(.001)
            created = await h.service.create(run_request(revision))
            assert (await h.act(created.mission_id, 'acquire')).accepted
            assert (await h.act(created.mission_id, 'start')).accepted
            h.advance(.2)
            await h.service.tick()
            assert h.authority.read(created.mission_id).interactive.tick == 1
            changed = {**data, 'name': 'New saved name'}
            await service.write(write(changed, revision=1), revision.definition_id)
            assert not pending.done()
            release.set()
            review = await pending
            assert review.reference == run_request(revision).scenario
            assert review.name == data['name']
            assert review.active_mission_id == created.mission_id and not review.can_run
            assert canonical(review) == canonical(service.review(run_request(revision).scenario))
        finally:
            release.set()
            await service.close()
            h.repo.close()
    asyncio.run(run())


def test_concurrent_and_cancelled_requests_coalesce_without_retaining_partial_work(monkeypatch):
    h = Harness()
    service = ScenarioService(h.authority, True)
    entered, release = asyncio.Event(), asyncio.Event()
    original, calls = analysis.analyze_text, []
    running = 0
    async def gated(text):
        nonlocal running
        running += 1
        assert running == 1
        calls.append(text)
        entered.set()
        try:
            await release.wait()
            return await original(text)
        finally:
            running -= 1
    monkeypatch.setattr(analysis, 'analyze_text', gated)
    async def run():
        try:
            revision = (await service.write(write(chain()))).result
            reference = run_request(revision).scenario
            first = asyncio.create_task(service.review_async(reference))
            await entered.wait()
            first.cancel()
            first.cancel()
            with pytest.raises(asyncio.CancelledError):
                await first
            assert running == 0 and not service._analysis._cache
            others = [asyncio.create_task(service.review_async(reference)) for _ in range(4)]
            await asyncio.sleep(0)
            assert len(calls) == 2 and running == 1
            release.set()
            reviews = await asyncio.gather(*others)
            assert all(review == reviews[0] for review in reviews)
            assert len(calls) == 2 and running == 0
        finally:
            release.set()
            await service.close()
            h.repo.close()
    asyncio.run(run())


def test_real_nominal_analysis_yields_before_completion_and_matches_full_sync_result(monkeypatch):
    from app.scenarios.contracts import ScenarioContent
    content = ScenarioContent.model_validate(chain())
    monkeypatch.setattr(analysis, 'ANALYSIS_BATCH_SECONDS', 0)
    async def run():
        pending = asyncio.create_task(analysis.analyze_text(canonical(content)))
        await asyncio.sleep(0)
        assert not pending.done()  # Real nominal work yielded, not an injected worker wait.
        text = await pending
        assert text == canonical(analysis.analyze(content))
    asyncio.run(run())
