"""Short matched D7 probes; isolated databases, real validation and durable ticks.

Run with the repository Python and --source-root pointing at either the exact
working-tree snapshot or current checkout. Profile separately from timed samples.
This reports retained JSON and SQLite components, never infers disk-write volume.
"""
import argparse
import asyncio
import cProfile
import hashlib
import json
import math
import pstats
import statistics
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('tag')
parser.add_argument('--source-root', type=Path, default=ROOT)
parser.add_argument('--mode', choices=['validation', 'recording'], default='validation')
parser.add_argument('--samples', type=int, default=5)
parser.add_argument('--ticks', type=int, default=100)
parser.add_argument('--profile', action='store_true')
parser.add_argument('--per-side', type=int, choices=[10, 20])
parser.add_argument('--fixture', choices=['default', 'remote'])
args = parser.parse_args()
if not args.tag.replace('-', '').isalnum() or not 1 <= args.samples <= 20 or not 1 <= args.ticks <= 3000:
    parser.error('Invalid bounded tag/sample/tick count')
sys.path[:0] = [str(args.source_root / 'backend'), str(args.source_root / 'backend/tests')]
from test_interactive import Harness
from test_scenarios import write, run_request
from app.scenarios.service import ScenarioService
from app.world.serialization import canonical

out = ROOT / 'test-results/performance-closure' / args.tag
out.mkdir(parents=True, exist_ok=True)
(ROOT / '.cache').mkdir(exist_ok=True)


def summary(values):
    ordered = sorted(values)
    return dict(samples=values, median=statistics.median(values), p95=ordered[math.ceil(len(values)*.95)-1], maximum=max(values))


def components(path):
    return {suffix or 'database': Path(str(path)+suffix).stat().st_size if Path(str(path)+suffix).exists() else 0
            for suffix in ['', '-wal', '-shm']}


def storage(h, path):
    result = dict(files=components(path))
    result['pragmas'] = {name: h.repo.db.execute('PRAGMA '+name).fetchone()[0]
                         for name in ['page_count', 'page_size', 'freelist_count', 'user_version', 'synchronous', 'wal_autocheckpoint']}
    result['tables'] = {}
    for name in ['frames', 'events', 'interactive_checkpoints', 'command_receipts', 'creation_receipts', 'scenario_revisions', 'scenario_receipts', 'scenario_runs', 'recordings']:
        columns = [r[1] for r in h.repo.db.execute('PRAGMA table_info('+name+')') if r[1].endswith('_json')]
        expression = '+'.join('length(CAST('+c+' AS BLOB))' for c in columns)
        count, size = h.repo.db.execute('SELECT count(*), coalesce(sum('+expression+'),0) FROM '+name).fetchone()
        result['tables'][name] = dict(rows=count, jsonBytes=size)
    return result


async def probe(fixture, per_side):
    content = json.loads((ROOT / fixture).read_text(encoding='utf-8'))
    kept = {u['id'] for u in content['units'] if int(u['id'].split('-')[-1]) <= per_side}
    content['units'] = [u for u in content['units'] if u['id'] in kept]
    content['actions'] = [a for a in content.get('actions', []) if a['unitId'] in kept]
    result = dict(fixture=fixture, fixtureSha256=hashlib.sha256(canonical(content).encode()).hexdigest(), entities=len(content['units']), actions=len(content['actions']))
    with tempfile.TemporaryDirectory(prefix='performance-closure-', dir=ROOT / '.cache') as directory:
        database = Path(directory) / 'recording.sqlite3'
        h = Harness(database)
        try:
            service = ScenarioService(h.authority, True)
            revision = (await service.write(write(content))).result
            reference = run_request(revision).scenario
            if args.mode == 'validation':
                timings = []
                for _ in range(args.samples + 1):
                    start = time.perf_counter()
                    review = service.review(reference)
                    timings.append((time.perf_counter() - start)*1000)
                    assert review.can_run
                value = json.loads(canonical(review))
                value['reference'].pop('definitionId')
                result.update(coldMs=timings[0], repeatedMs=summary(timings[1:]), reviewSha256=hashlib.sha256(canonical(value).encode()).hexdigest())
                (out / f'review-{per_side}-{Path(fixture).stem}.json').write_text(canonical(value))
                if args.profile:
                    profiler = cProfile.Profile()
                    profiler.runcall(service.review, reference)
                    profiler.dump_stats(str(out / f'validation-{per_side}-{Path(fixture).stem}.prof'))
                    with (out / f'profile-{per_side}-{Path(fixture).stem}.txt').open('w') as f:
                        pstats.Stats(profiler, stream=f).strip_dirs().sort_stats('cumulative').print_stats(35)
            else:
                mid = (await h.service.create(run_request(revision))).mission_id
                assert (await h.act(mid, 'acquire')).accepted
                assert (await h.act(mid, 'start')).accepted
                first = h.authority.read(mid)
                result['before'] = storage(h, database)
                timings = []
                started = time.perf_counter()
                for i in range(args.ticks):
                    h.advance(.2)
                    if i and i % 50 == 0:
                        assert (await h.act(mid, 'renew')).accepted
                    begin = time.perf_counter()
                    await h.service.tick()
                    timings.append((time.perf_counter()-begin)*1000)
                frame = h.authority.read(mid)
                assert all(frame.tracks[key].latest.position != track.latest.position for key, track in first.tracks.items())
                assert sum(t.latest.velocity.speed_mps > 0 for t in frame.tracks.values()) == per_side*2
                result.update(wallSeconds=time.perf_counter()-started, simulationSeconds=args.ticks*.2, ticks=args.ticks, durableTickMs=summary(timings), after=storage(h, database))
                latest = json.loads(h.repo.latest_text(mid))
                result['latestFrameFieldBytes'] = {key: len(canonical({'value': value}).encode())-10 for key, value in latest.items()}
                if args.profile:
                    profiler = cProfile.Profile()
                    profiler.enable()
                    for _ in range(10):
                        h.advance(.2)
                        await h.service.tick()
                    profiler.disable()
                    profiler.dump_stats(str(out / f'recording-{per_side}-{Path(fixture).stem}.prof'))
                    with (out / f'profile-{per_side}-{Path(fixture).stem}.txt').open('w') as f:
                        pstats.Stats(profiler, stream=f).strip_dirs().sort_stats('cumulative').print_stats(35)
                assert (await h.act(mid, 'end')).accepted
                result['ended'] = storage(h, database)
        finally:
            h.repo.close()
        result['afterNormalClose'] = components(database)
    result['databaseRemoved'] = not database.exists()
    print(json.dumps(result), flush=True)
    return result


async def main():
    results = []
    fixtures = {'default': 'frontend/tests/fixtures/scenario-20v20.json', 'remote': 'frontend/tests/fixtures/scenario-location/remote-20v20.json'}
    for name, fixture in fixtures.items():
        if args.fixture and args.fixture != name:
            continue
        for per_side in [args.per_side] if args.per_side else [10, 20]:
            results.append(await probe(fixture, per_side))
            (out / 'result.json').write_text(json.dumps(results, indent=2))


asyncio.run(main())
