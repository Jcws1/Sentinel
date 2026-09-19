"""Summarize already redacted CPU profiles; no provider URL queries are emitted."""
import collections
import json
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'docs/performance-stability'
summary = {}
for directory in ('perf-before-provider-final', 'perf-after-provider-final', 'perf-after-provider-collision-final'):
    for path in sorted((root / directory).glob('*-cpu.json')):
        data = json.loads(path.read_text(encoding='utf-8'))
        nodes = {n['id']: n['callFrame'] for n in data['nodes']}
        totals = collections.Counter()
        by_id = collections.Counter()
        for sample, elapsed in zip(data.get('samples', []), data.get('timeDeltas', [])):
            frame = nodes[sample]
            url = frame.get('url', '').split('?')[0].split('/')[-1]
            totals[(frame.get('functionName') or '(anonymous)', url, frame.get('lineNumber', -1) + 1)] += elapsed / 1000
            by_id[sample] += elapsed / 1000
        parents = {child: node['id'] for node in data['nodes'] for child in node.get('children', [])}
        readbacks = []
        for node_id, frame in nodes.items():
            if frame.get('functionName') != 'getBufferSubData':
                continue
            chain, ancestor = [], node_id
            while ancestor in nodes:
                call = nodes[ancestor]
                chain.append(dict(function=call.get('functionName') or '(anonymous)', line=call.get('lineNumber', -1) + 1))
                ancestor = parents.get(ancestor)
            readbacks.append(dict(milliseconds=by_id[node_id], callers=chain))
        summary[f'{directory}/{path.name}'] = {
            'note': 'Sampled self time; CPU profiler includes trace setup/finalization outside the separately measured task-duration window. Native calls may include driver work or waiting; this is not isolated GPU timing.',
            'profileDurationMs': (data['endTime'] - data['startTime']) / 1000,
            'topSelfTime': [dict(function=k[0], bundle=k[1], line=k[2], milliseconds=v) for k, v in totals.most_common(20)],
            'nativeReadbackCallers': readbacks,
        }
(root / 'provider-cpu-summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
print(json.dumps({k: v['topSelfTime'][:6] for k, v in summary.items()}, indent=2))
