"""Capture only source and metadata needed to attribute this pass; no credentials/data."""
import hashlib
import json
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'docs/performance-stability'
SNAPSHOT = ROOT / '.cache/performance-stability/baseline-source'
OUT.mkdir(parents=True, exist_ok=True)
if SNAPSHOT.exists():
    raise SystemExit('Baseline already exists; refusing to overwrite')
paths = []
for directory in ('frontend/src', 'frontend/tests', 'frontend/scripts', 'backend/app', 'backend/tests', 'contracts', 'scripts'):
    paths.extend(p for p in (ROOT / directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts)
paths.extend(p for p in (ROOT / 'frontend').glob('*') if p.is_file() and not p.name.startswith('.env'))
paths.extend([ROOT / '.gitignore', ROOT / 'backend/pyproject.toml'])
manifest = {}
for path in paths:
    relative = path.relative_to(ROOT)
    target = SNAPSHOT / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, target)
    manifest[relative.as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
(OUT / 'baseline-source.json').write_text(json.dumps(manifest, indent=2), encoding='utf-8')
status = subprocess.run(['git', 'status', '--short'], cwd=ROOT, capture_output=True, text=True, check=True)
(OUT / 'baseline-working-tree.txt').write_text(status.stdout, encoding='utf-8')
data = {}
for parent in ('backend', 'frontend/.cache', 'tmp'):
    for p in (ROOT / parent).rglob('*sqlite3*'):
        if p.is_file():
            stat = p.stat()
            data[p.relative_to(ROOT).as_posix()] = {'bytes': stat.st_size, 'mtime_ns': stat.st_mtime_ns}
(OUT / 'existing-database-inventory.json').write_text(json.dumps(data, indent=2), encoding='utf-8')
print(json.dumps({'sourceFiles': len(manifest), 'preservedDatabasesAndSidecars': len(data)}))
