import json
import os
import subprocess
import sys
from pathlib import Path


def test_every_canonical_sample_event_receipt_and_checkpoint_matches_baseline():
    root = Path(__file__).resolve().parents[2]
    result = subprocess.run(
        [sys.executable, str(Path(__file__).with_name('recording_equivalence_probe.py'))],
        cwd=root / 'backend', env={**os.environ, 'SENTINEL_EQ_SOURCE_ROOT': str(root), 'PYTHONDONTWRITEBYTECODE': '1'},
        capture_output=True, text=True, timeout=60, check=True,
    )
    expected = json.loads((Path(__file__).parent / 'fixtures/recording-equivalence.json').read_text())
    assert json.loads(result.stdout) == expected
