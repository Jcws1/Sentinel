"""The optional D7 fault server must never open an operator database."""
import os
import subprocess
import sys
from pathlib import Path
from uuid import uuid4

import pytest


@pytest.mark.parametrize("invalid", ["opt-in", "directory", "prefix", "suffix"])
def test_fault_server_rejects_unowned_database_before_open(tmp_path, invalid):
    owned = Path(__file__).resolve().parents[2] / "frontend" / ".cache"
    # Violate one guard at a time; another failed condition must not mask it.
    parent = tmp_path if invalid == "directory" else owned
    prefix = "operator-" if invalid == "prefix" else "verification-"
    suffix = ".db" if invalid == "suffix" else ".sqlite3"
    database = parent / f"{prefix}{uuid4()}{suffix}"
    env = {**os.environ, "SENTINEL_INTEGRATION_PROBE": "0" if invalid == "opt-in" else "1",
           "SENTINEL_DB_PATH": str(database), "PYTHONPATH": str(Path(__file__).parent)}
    result = subprocess.run([sys.executable, "-c", "import integrated_runtime"],
                            env=env, cwd=Path(__file__).resolve().parents[1],
                            capture_output=True, text=True, timeout=20)
    assert result.returncode != 0
    assert "explicitly owned verification database" in result.stderr
    assert not database.exists()


def test_normal_application_has_no_fault_routes():
    from app.main import create_app
    assert not any("__verification" in getattr(route, "path", "")
                   for route in create_app().routes)


def test_probe_injects_only_one_explicitly_armed_matching_receipt():
    owned = Path(__file__).resolve().parents[2] / "frontend" / ".cache"
    database = owned / f"verification-probe-{uuid4()}.sqlite3"
    env = {**os.environ, "SENTINEL_INTEGRATION_PROBE": "1",
           "SENTINEL_DB_PATH": str(database), "PYTHONPATH": str(Path(__file__).parent)}
    code = """
import integrated_runtime as p
import sqlite3
p.ordinary_receipt = lambda *args: 'delegated'
def receipt(body): return p.controlled_receipt(None, 'id', '{}', body)
assert receipt('{}') == 'delegated'
p.gate['failReceiptOperation'] = 'stop'
assert receipt('{"operation":"behavior"}') == 'delegated'
try:
    receipt('{"operation":"stop"}')
except sqlite3.OperationalError:
    pass
else:
    raise AssertionError('Armed fault not injected')
assert p.gate['injectedFailures'] == 1
assert receipt('{"operation":"stop"}') == 'delegated'
assert receipt('{}') == 'delegated'
"""
    result = subprocess.run([sys.executable, "-c", code], env=env,
                            cwd=Path(__file__).resolve().parents[1],
                            capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, result.stderr
    assert not database.exists()
