"""Deterministic recording workload, run in a separate process for UUID isolation."""
import asyncio
import hashlib
import itertools
import json
import os
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
source = Path(os.environ.get('SENTINEL_EQ_SOURCE_ROOT', ROOT))
sys.path[:0] = [str(source / 'backend'), str(source / 'backend/tests')]
identities = itertools.count(1)
uuid.uuid4 = lambda: uuid.UUID(int=next(identities))

from test_interactive import Harness
from test_scenarios import write, run_request
from app.scenarios.service import ScenarioService
from app.world.serialization import canonical

try:
    from app.recording.storage_codec import decode_text
except ImportError:
    decode_text = lambda value: value


def fingerprint(text):
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


async def exercise(fixture):
    h = Harness()
    try:
        # The frozen fingerprints were captured on Windows, where this implicit read
        # decoded the UTF-8 fixture as cp1252 (the Sydney name holds a middle dot).
        # Stating that decoding keeps the baseline identical in UTF-8 mode and on
        # other platforms; no fixture, hash or assertion changes.
        content = json.loads((ROOT / fixture).read_text(encoding="cp1252"))
        service = ScenarioService(h.authority, True)
        revision = (await service.write(write(content))).result
        request = run_request(revision)
        created = await h.service.create(request)
        assert created == await h.service.create(request)
        mid = created.mission_id
        assert (await h.act(mid, 'acquire')).accepted
        assert (await h.act(mid, 'start')).accepted
        checkpoints = []
        for tick in range(20):
            h.advance(.2)
            await h.service.tick()
            checkpoints.append(fingerprint(canonical(h.repo.checkpoint(mid))))
        assert (await h.act(mid, 'pause')).accepted
        frozen = h.repo.latest_text(mid)
        h.advance(45)
        await h.service.tick()
        assert h.authority.read(mid).effective_at == json.loads(frozen)['effectiveAt']
        assert (await h.act(mid, 'acquire')).code == 'RECLAIM_REQUIRED'
        assert (await h.act(mid, 'reclaim')).accepted
        assert (await h.act(mid, 'resume')).accepted
        for tick in range(5):
            h.advance(.2)
            await h.service.tick()
            checkpoints.append(fingerprint(canonical(h.repo.checkpoint(mid))))
        assert (await h.act(mid, 'end')).accepted
        tables = {}
        for name, columns, order in (
            ('frames', ['frame_json'], 'sequence'),
            ('events', ['event_json'], 'sequence'),
            ('command_receipts', ['payload_json', 'receipt_json'], 'command_id'),
            ('creation_receipts', ['payload_json', 'receipt_json'], 'creation_id'),
            ('scenario_revisions', ['revision_json'], 'definition_id,revision'),
            ('scenario_runs', ['revision_json'], 'mission_id'),
            ('scenario_receipts', ['payload_json', 'receipt_json'], 'scope,request_id'),
        ):
            rows = h.repo.db.execute('SELECT ' + ','.join(columns) + ' FROM ' + name + ' ORDER BY ' + order).fetchall()
            tables[name] = [[fingerprint(decode_text(value)) for value in row] for row in rows]
        return dict(fixture=fixture, tables=tables, checkpoints=checkpoints,
                    finalCheckpoint=fingerprint(canonical(h.repo.checkpoint(mid))),
                    latest=fingerprint(h.repo.latest_text(mid)),
                    contentHash=revision.content_hash)
    finally:
        h.repo.close()


async def main():
    results = []
    for fixture in ('frontend/tests/fixtures/scenario-20v20.json',
                    'frontend/tests/fixtures/scenario-location/remote-20v20.json'):
        results.append(await exercise(fixture))
    print(json.dumps(results, indent=2))


if __name__ == '__main__':
    asyncio.run(main())
