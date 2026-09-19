"""Matched CPU timings in an isolated temporary recording, including durable commits."""
import asyncio
import cProfile
import json
import re
import statistics
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / 'backend'), str(ROOT / 'backend/tests')]
from test_interactive import Harness
from test_scenarios import write, run_request
from app.scenarios.service import ScenarioService


async def benchmark(per_side, output):
    data = json.loads((ROOT / 'frontend/tests/fixtures/scenario-20v20.json').read_text(encoding='utf-8'))
    kept = {u['id'] for u in data['units'] if int(u['id'].split('-')[-1]) <= per_side}
    data['units'] = [u for u in data['units'] if u['id'] in kept]
    data['actions'] = [a for a in data['actions'] if a['unitId'] in kept]
    with tempfile.TemporaryDirectory(prefix='sentinel-perf-', dir=ROOT / '.cache') as directory:
        h = Harness(Path(directory) / 'recording.sqlite3')
        timings = []
        try:
            s = ScenarioService(h.authority, True)
            rev = (await s.write(write(data))).result
            mid = (await h.service.create(run_request(rev))).mission_id
            assert (await h.act(mid, 'acquire')).accepted
            assert (await h.act(mid, 'start')).accepted
            profile = cProfile.Profile()
            for i in range(100):
                h.advance(.2)
                if i and i % 50 == 0:
                    assert (await h.act(mid, 'renew')).accepted
                start = time.perf_counter()
                await h.service.tick()
                timings.append((time.perf_counter() - start) * 1000)
            profile.enable()
            for _ in range(10):
                h.advance(.2)
                await h.service.tick()
            profile.disable()
            profile.dump_stats(str(output / f'{per_side}v{per_side}.prof'))
            frame = h.authority.read(mid)
            moving = sum(t.latest.velocity.speed_mps > 0 for t in frame.tracks.values())
            assert moving == per_side * 2
            assert (await h.act(mid, 'end')).accepted
            return {'perSide': per_side, 'moving': moving, 'medianMs': statistics.median(timings), 'p95Ms': sorted(timings)[94], 'p99Ms': sorted(timings)[98], 'maxMs': max(timings)}
        finally:
            h.repo.close()


async def main():
    (ROOT / '.cache').mkdir(exist_ok=True)
    tag = sys.argv[1] if len(sys.argv) > 1 else 'current'
    if not re.fullmatch(r'[a-z0-9-]+', tag):
        raise SystemExit('Use a lowercase alphanumeric or hyphenated result tag')
    output = ROOT / 'test-results/performance' / ('backend-' + tag)
    output.mkdir(parents=True, exist_ok=True)
    results = []
    for n in (1, 10, 20):
        try:
            results.append(await benchmark(n, output))
        except Exception as error:
            results.append({'perSide': n, 'error': type(error).__name__, 'detail': str(error)[:300]})
    (output / 'result.json').write_text(json.dumps(results, indent=2), encoding='utf-8')
    print(json.dumps(results))
    if any('error' in result for result in results):
        raise SystemExit(1)


asyncio.run(main())
