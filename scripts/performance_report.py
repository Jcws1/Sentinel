"""Render retained measurement JSON without inventing missing samples."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'docs/performance-stability'
fmt = lambda n: '—' if n is None else f'{n:.2f}'
lines = ['# Measured results', '',
    'Machine: Intel Core i7-10700K (8C/16T), NVIDIA RTX 3060, driver 32.0.16.1088. Physical display: 2560×1440, 144 Hz. Browser: headed Edge 153.0.4234.46. Default measurement viewport: 1440×900 CSS pixels, DPR 1; individual records contain exact dimensions, focus and visibility. Fresh task contexts and databases; no concurrent test/build/browser workload during measurements.', '',
    'Compositor columns use Chromium `Display::FrameDisplayed` trace timestamps cropped to the bounded measurement window. They are presentation evidence, not a photodiode measurement. Main runs also collect RAF and CPU profiles; RAF rates are deliberately not reported as display FPS. The independent critic adds a trace without a measurement-owned RAF and an idle negative control. Source-coordinate changes are tile-quantized diagnostics, not pixel FPS.', '',
    'Steady-state windows are 12 seconds unless the raw record states otherwise. Each run uses the same pane sequence and warmup. Initial loading is excluded and reported separately. Missed slots estimate missing opportunities at 144 Hz from presentation gaps; they are not unique application frame IDs. “>50” counts presentation gaps above 50 ms. Quantiles use observed intervals, not an assumed tick rate. CPU profiling and tracing add overhead.', '']

for name in ['perf-before-matched', 'perf-after-matched',
             'perf-before-existing', 'perf-after-existing',
             'perf-before-configured', 'perf-after-configured',
             'perf-before-provider-final', 'perf-after-provider-final',
             'perf-after-provider-collision-final', 'perf-after-native-dpr',
             'perf-after-dimensions',
             'perf-after-dimensions-streaming', 'perf-after-dimensions-grid',
             'perf-after-1440p', 'perf-after-4k']:
    path = ROOT / name / 'result.json'
    if not path.exists(): continue
    r = json.loads(path.read_text(encoding='utf-8'))
    lines += [f'## {name}', '', f"Completed: {r.get('passed', False)}. Configured providers: {r.get('configured')}. Raw evidence: [{name}/result.json]({name}/result.json).", '',
        '| Workload / panes | FPS | Median ms | p95 ms | p99 ms | Max ms | Missed 144 Hz slots | >50 ms | Main task ms | Layout ms |',
        '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    for s in r.get('samples', []):
        c=s['compositor']; q=c['intervals']
        lines.append('| '+ ' | '.join([s['label'],fmt(c['fps']),*[fmt(q[k]) for k in ['median','p95','p99','max']],str(c['estimatedMissed144HzSlots']),str(c['stallsOver50Ms']),fmt(s['taskMs']),fmt(s['layoutMs'])])+' |')
    lines += ['', '| Workload / panes | Video markers / labels at start→end | Provider state at start |', '|---|---:|---|']
    for s in r.get('samples', []):
        begin, end = s['before'], s['after']
        def overlay(state):
            value = (state.get('video') or {}).get('videoOverlay') or {}
            return f"{len(value.get('points', []))}/{len(value.get('labels', []))}"
        three_d = (begin.get('threeD') or {}).get('spatial', {})
        video = (begin.get('video') or {}).get('spatial', {})
        provider = f"3D base={three_d.get('displayedBase', 'absent')}, imagery/terrain/buildings={three_d.get('imagery', '—')}/{three_d.get('terrain', '—')}/{three_d.get('buildings', '—')}; Video={video.get('photorealistic', 'absent')}"
        lines.append(f"| {s['label']} | {overlay(begin)} → {overlay(end)} | {provider} |")
    lines += ['', '| Workload / panes | Publication age median / p95 ms | Arrival interval median / p95 ms | Wall minus simulation effective time median ms |', '|---|---:|---:|---:|']
    for s in r.get('samples',[]):
        p=s['publicationAgeMs']; a=s['arrivalIntervals']; e=s['simulationClockAgeMs']
        lines.append(f"| {s['label']} | {fmt(p['median'])} / {fmt(p['p95'])} | {fmt(a['median'])} / {fmt(a['p95'])} | {fmt(e['median'])} |")
    lines += ['', 'Lifecycle latency from UI dispatch (includes opening the menu, obtaining intent, sending the command and reading its receipt):', '']
    for c in r.get('commands',[]): lines.append(f"* {c['operation']}: {fmt(c['latencyMs'])} ms; accepted={c['accepted']}.")
    if r.get('loading'):
        lines += ['', 'Loading checkpoints (excluded from steady-state task-duration/presentation windows):', '']
        for item in r['loading']:
            nav = item.get('navigation', {})
            lines.append(f"* {item['workload']}: navigation loadEventEnd {fmt(nav.get('loadEventEnd'))} ms; setup to warmed Tactical {fmt(item.get('setupToWarmTacticalMs'))} ms; additional wait for Google tiles loaded {fmt(item.get('providerReadyWaitMs'))} ms.")
    lines += ['']

lines += ['## Backend durable tick benchmark', '',
    '100 measured ticks per workload, 10 additional profiled ticks, fixed 200 ms simulation steps; task-only SQLite recording includes durable commit. No browser is involved. These timings measure processing capacity, not display FPS.', '',
    '| Source | Workload | Moving tracks | Median ms | p95 ms | p99 ms | Max ms |', '|---|---|---:|---:|---:|---:|---:|']
for name in ['backend-before','backend-after-first']:
    for s in json.loads((ROOT/name/'result.json').read_text()):
        if 'medianMs' not in s:
            lines.append(f"| {name} | {s['perSide']}v{s['perSide']} | Rejected by original 32-unit bound | — | — | — | — |")
        else:
            lines.append('| '+ ' | '.join([name,f"{s['perSide']}v{s['perSide']}",str(s['moving']),*[fmt(s[k]) for k in ['medianMs','p95Ms','p99Ms','maxMs']]])+' |')
lines += ['', 'Publication age is client wall time at socket delivery minus server `recordedAt`; on this local same-clock machine it includes remaining validation/persistence, publication, transport and event-loop scheduling. It is not a pure wire latency. Effective time is the simulation clock: startup/pause offsets and fixed-step progression make wall-minus-effective time unsuitable as a standalone freshness measure. The unchanged presentation clock interpolates only between committed positions with an adaptive bounded 100–500 ms cadence; it freezes/clears on stale, disconnected, changed intent, discontinuity or epoch transitions.', '',
    'Unadjusted JS heap samples in FPS results include normal allocation/GC cycles. Resource-growth conclusions use the separate bounded soak and post-collection checkpoints, not the difference between arbitrary heap readings. See lifecycle and critic evidence for actual checks.', '']
lines += ['## Lifecycle, input and resource growth', '',
    'These functional foreground runs use five hide/reopen cycles and a 120-second moving soak. Input samples time selection dispatch to matching Details text plus two RAF opportunities; they are a DOM/render opportunity proxy, not a physical input-to-photon sensor measurement. Command samples include UI menu/intent/network/receipt work. A few samples cannot establish tail latency.', '',
    '| Run | Passed | Selection samples ms | Pause / Resume / Stop / Return / End ms |', '|---|---|---|---|']
soaks = []
for name in ['perf-lifecycle-before-10', 'perf-lifecycle-after-10-final', 'perf-lifecycle-after-20-final', 'perf-lifecycle-grid-final']:
    path = ROOT/name/'result.json'
    if not path.exists(): continue
    r = json.loads(path.read_text())
    soaks.append((name, r))
    lines.append(f"| {name} | {r.get('passed', False)} | {', '.join(fmt(x['visibleDetailsMs']) for x in r.get('input', []))} | {' / '.join(fmt(x['elapsedMs']) for x in r.get('commands', []))} |")
lines += ['', '| Run / checkpoint | Collected heap MiB | DOM nodes | Listeners | Cesium created / disposed | Pool alive | Recording MiB |', '|---|---:|---:|---:|---|---:|---:|']
for name, r in soaks:
    for s in r.get('resources', []):
        if not s['gc']: continue
        counts = s['state']['cesiumCounts']
        lines.append(f"| {name} / {s['label']} | {fmt(s['heap']/1048576)} | {s['nodes']} | {s['listeners']} | {counts['created']} / {counts['disposed']} | {s['state']['pool']['alive']} | {fmt(s.get('recordingBytes', 0)/1048576) if s.get('recordingBytes') is not None else '—'} |")
lines += ['', 'Heap growth over two minutes alone cannot prove a leak or unlimited stability. The recording grows intentionally with persisted history. Stable post-reopen DOM/listener/renderer counts distinguish retained UI structure from resource duplication. Initial process-memory snapshots list launch roots and may omit the real Python executor; only the final grid soak resolves the backend listener PID and is suitable for backend-native-memory claims. A further configured-provider soak was not run after the bounded resolution test hit its external-request cap.', '']
(ROOT/'MEASUREMENTS.md').write_text('\n'.join(lines),encoding='utf-8')
print('Wrote MEASUREMENTS.md from retained measurement records')
