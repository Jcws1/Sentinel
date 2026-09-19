"""Attribute changes to the preserved dirty working tree, never to HEAD."""
import difflib
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT / 'docs/performance-stability'
BASE = ROOT / '.cache/performance-stability/baseline-source'
manifest = json.loads((EVIDENCE / 'baseline-source.json').read_text())
paths = set(manifest)
for folder in ['frontend/src', 'frontend/tests', 'frontend/scripts',
               'backend/app', 'backend/tests', 'contracts/sentinel/v1.13', 'scripts']:
    for path in (ROOT / folder).rglob('*'):
        if path.is_file() and path.suffix in {'.ts', '.tsx', '.mjs', '.css', '.py', '.ps1', '.json', '.md'}:
            paths.add(path.relative_to(ROOT).as_posix())
changes, diff, hashes = [], [], {}
for name in sorted(paths):
    original, current = BASE / name, ROOT / name
    if name in manifest:
        assert original.is_file(), name
        assert hashlib.sha256(original.read_bytes()).hexdigest() == manifest[name], name
    before = original.read_bytes() if original.exists() else None
    after = current.read_bytes() if current.exists() else None
    if after is not None:
        hashes[name] = hashlib.sha256(after).hexdigest()
    if before == after:
        continue
    changes.append({'path': name, 'status': 'added' if before is None else 'deleted' if after is None else 'modified'})
    diff.extend(difflib.unified_diff(
        (before or b'').decode('utf-8-sig').splitlines(keepends=True),
        (after or b'').decode('utf-8-sig').splitlines(keepends=True),
        fromfile='baseline/' + name, tofile='candidate/' + name))
(EVIDENCE / 'task-source.diff').write_text(''.join(diff), encoding='utf-8')
(EVIDENCE / 'task-changed-files.json').write_text(json.dumps(changes, indent=2) + '\n', encoding='utf-8')
(EVIDENCE / 'final-source-hashes.json').write_text(json.dumps(hashes, indent=2) + '\n', encoding='utf-8')
print(f'Verified {len(manifest)} preserved files; attributed {len(changes)} changed/new paths.')
