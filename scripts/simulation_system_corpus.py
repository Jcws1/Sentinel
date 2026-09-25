"""Black-box HTTP corpus for the assembled external-simulation path.

Starts a task-owned uvicorn backend on a disposable database and serves a built
frontend with ``vite preview``; every request goes through the frontend origin's
/api proxy. Sends the golden request, every frozen fixture, every spec §10
negative, the shared and seeded random geometry vectors and the complete
lifecycle matrix, and checks status codes and response envelopes (frozen v1
response schema or the documented C05 minimal error). It then restarts the
backend for exact completed retries, and hard-kills it after preparation of a dense
200-drone (10,000-pair) batch to verify interrupted recovery and exact retry.
The kill is triggered by the durably prepared command in the harness's own
disposable database, read-only: an HTTP status read during the short
cooperative phase can reach the harness only after the synchronous completion
commits, which would kill too late. All assertions stay on HTTP.
Zero 5xx responses are required outside the deliberate kill window.

Expectations come from the frozen fixtures and schema, the spec §8 table written
out below, and the independent geometry oracle. One case uses product code as its
reference: the dense hard-kill retry is compared with the in-process resolver's
result, because it checks recovery, not resolution.

Usage (repository root; build first with build:test):
  backend/.venv/Scripts/python.exe scripts/simulation_system_corpus.py <tag> --build dist-test-<suffix>
Outputs go to ignored test-results/simulation-system/<tag>/. No provider requests.
"""
import argparse
import copy
import hashlib
import json
import os
import random
import socket
import sqlite3
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "backend/tests")]
from jsonschema import Draft202012Validator  # noqa: E402

import geometry_oracle as oracle  # noqa: E402
from app.adapters.simulation_v1.projection import mission_identity  # noqa: E402
from app.simulation.resolver import resolve_drone_attack_simulation  # noqa: E402
from simulation_fixtures import simulation_batch  # noqa: E402
from test_geometry_exact import random_ring  # noqa: E402

FIXTURES = ROOT / "contracts/simulation/fixtures"
RESPONSE_SCHEMA = Draft202012Validator(json.loads((ROOT / "contracts/simulation/v1.response.schema.json").read_text(encoding="utf-8")))
VECTORS = json.loads((ROOT / "frontend/tests/fixtures/geometry/polygon-vectors.v1.json").read_text(encoding="utf-8"))
GOLDEN = json.loads((FIXTURES / "golden.request.json").read_text(encoding="utf-8"))
# Spec §8 plus the register's provisional C02/C03 cells
# (contracts/simulation/compatibility-decisions.md), written out so the corpus
# does not take its expectations from the product's own transition table.
LIFECYCLE = {
    None: {"START": "RUNNING", "HOLD": "RUN_NOT_STARTED", "RESUME": "RUN_NOT_HELD", "ABORT": "RUN_NOT_STARTED"},
    "RUNNING": {"START": "RUN_ALREADY_STARTED", "HOLD": "HELD", "RESUME": "RUN_NOT_HELD", "ABORT": "ABORTED"},
    "HELD": {"START": "RUN_ALREADY_STARTED", "HOLD": "HELD", "RESUME": "RUNNING", "ABORT": "ABORTED"},
    "ABORTED": {"START": "RUN_TERMINAL", "HOLD": "RUN_TERMINAL", "RESUME": "RUN_NOT_HELD", "ABORT": "RUN_TERMINAL"},
}
# Each frozen negative fixture changes one field of the golden request; its error names that field
# (C08 document order: a reversed band at its upper bound, an early sample at its timestamp).
INVALID_FIXTURES = {
    "invalid-live.request.json": ("VALIDATION_ERROR", "/command/source_mode"),
    "invalid-unknown-field.request.json": ("VALIDATION_ERROR", "/unexpected"),
    "invalid-null.request.json": ("VALIDATION_ERROR", "/resolution/interaction_radius_m"),
    "invalid-active-zero.request.json": ("VALIDATION_ERROR", "/samples_by_timestamp/2026-09-06T00:00:01.000Z/0/health"),
    "invalid-probability.request.json": ("VALIDATION_ERROR", "/calibration_profile/rules/0/probability"),
    "invalid-positive-delta.request.json": ("VALIDATION_ERROR", "/calibration_profile/rules/0/health_delta"),
    "invalid-coordinate.request.json": ("VALIDATION_ERROR", "/samples_by_timestamp/2026-09-06T00:00:01.000Z/0/latitude_deg"),
    "invalid-offset.request.json": ("VALIDATION_ERROR", "/command/issued_at"),
    "unclosed-ring.request.json": ("VALIDATION_ERROR", "/area/polygon"),
    "duplicate-drone-id.request.json": ("VALIDATION_ERROR", "/samples_by_timestamp/2026-09-06T00:00:01.000Z/2/drone_id"),
    "reversed-band.request.json": ("VALIDATION_ERROR", "/area/max_altitude_m"),
    "before-execute.request.json": ("VALIDATION_ERROR", "/samples_by_timestamp/2026-09-06T00:00:01.000Z"),
    "missing-rule.request.json": ("MISSING_RULE", "/calibration_profile/rules"),
}


def free(port):
    with socket.socket() as s:
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


class Corpus:
    def __init__(self, args):
        self.args = args
        self.out = ROOT / "test-results/simulation-system" / args.tag
        self.out.mkdir(parents=True, exist_ok=True)
        self.db = ROOT / f".cache/simulation-system-{args.tag}-{os.getpid()}.sqlite3"
        self.base = f"http://127.0.0.1:{args.frontend_port}"
        self.cases, self.statuses, self.backend, self.frontend = [], [], None, None
        self.sections = {}
        self.logs = []

    # --- services -----------------------------------------------------------------------------
    def start_backend(self):
        log = open(self.out / f"backend-{len(self.logs)}.log", "w", encoding="utf-8")
        self.logs.append(log)
        env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1", "SENTINEL_DB_PATH": str(self.db)}
        env.pop("SENTINEL_DEMO", None)
        env.pop("SENTINEL_FIXTURES", None)
        self.backend = subprocess.Popen([str(ROOT / "backend/.venv/Scripts/python.exe"), "-m", "uvicorn", "app.main:app",
                                         "--app-dir", "backend", "--host", "127.0.0.1", "--port", str(self.args.backend_port)],
                                        cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
        self.wait_ready()

    def command_state(self, command_id):
        """Durable state of one command, read-only from this harness's own database."""
        try:
            db = sqlite3.connect(f"file:{self.db.as_posix()}?mode=ro", uri=True, timeout=0.2)
            try:
                row = db.execute("SELECT state FROM simulation_commands WHERE command_id=?", (command_id,)).fetchone()
            finally:
                db.close()
        except sqlite3.Error:
            return None
        return row[0] if row else None

    def stop_backend(self, hard=False):
        (self.backend.kill if hard else self.backend.terminate)()
        self.backend.wait(timeout=30)
        for _ in range(100):
            if free(self.args.backend_port):
                return
            time.sleep(0.1)
        raise RuntimeError("Backend port still occupied; refusing a second writer")

    def start_frontend(self):
        log = open(self.out / "frontend.log", "w", encoding="utf-8")
        self.logs.append(log)
        env = {**os.environ, "SENTINEL_API_TARGET": f"http://127.0.0.1:{self.args.backend_port}", "SENTINEL_SHARED_PUBLIC": "1"}
        self.frontend = subprocess.Popen(["node", "node_modules/vite/bin/vite.js", "preview", "--outDir", self.args.build,
                                          "--host", "127.0.0.1", "--port", str(self.args.frontend_port), "--strictPort"],
                                         cwd=ROOT / "frontend", env=env, stdout=log, stderr=subprocess.STDOUT)

    def wait_ready(self):
        # Poll the owned backend directly (short timeout), then confirm the proxy path.
        direct = f"http://127.0.0.1:{self.args.backend_port}/api/simulation/v1/runs"
        for _ in range(600):
            try:
                with urllib.request.urlopen(direct, timeout=2) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(0.1)
        else:
            raise RuntimeError("Owned backend did not become ready")
        for _ in range(300):
            try:
                if self.request("GET", "/api/simulation/v1/runs", record=False, timeout=5)[0] == 200:
                    return
            except OSError:
                pass
            time.sleep(0.1)
        raise RuntimeError("Assembled application did not become ready")

    # --- HTTP ---------------------------------------------------------------------------------
    def request(self, method, path, body=None, record=True, timeout=180):
        data = body if isinstance(body, bytes) or body is None else json.dumps(body).encode("utf-8")
        req = urllib.request.Request(self.base + path, data=data, method=method, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as response:
                status, raw = response.status, response.read()
        except urllib.error.HTTPError as error:
            status, raw = error.code, error.read()
        if record:
            self.statuses.append(status)
        return status, raw

    def post(self, body):
        return self.request("POST", "/api/simulation/v1/commands", body)

    # --- checks -------------------------------------------------------------------------------
    def case(self, group, name, ok, **detail):
        self.cases.append(dict(group=group, name=name, ok=bool(ok), **detail))
        if not ok:
            print("FAIL", group, name, json.dumps(detail)[:400], flush=True)

    def envelope(self, status, raw, code=None, path=None):
        """Success must be schema-valid; failures are schema-valid rejections or the C05 minimal error."""
        try:
            value = json.loads(raw)
        except ValueError:
            return False, "non-JSON body"
        if status == 200:
            ack = value.get("command_ack", {})
            ok = RESPONSE_SCHEMA.is_valid(value) and ack.get("status") == "SUCCEEDED" and ack.get("error_code") is None
            return ok, value
        if set(value) == {"error"}:
            error = value["error"]
            ok = set(error) == {"code", "path", "message"} and (code is None or error["code"] == code)
            return ok and (path is None or error["path"] == path), value
        ack = value.get("command_ack", {})
        ok = (RESPONSE_SCHEMA.is_valid(value) and ack.get("status") == "REJECTED" and ack.get("run_status") == "FAILED"
              and ack.get("error_code") and value.get("results_by_timestamp") == {})
        ok = ok and (code is None or ack["error_code"] == code) and (path is None or ack["error_path"] == path)
        return ok, value

    def expect(self, group, name, body, status, code=None, path=None):
        actual, raw = self.post(body)
        ok, value = self.envelope(actual, raw, code, path)
        self.case(group, name, actual == status and ok, status=actual, expected=status, code=code,
                  body=raw[:300].decode("utf-8", "replace") if actual != status or not ok else None)
        return actual, value, raw

    # --- corpus -------------------------------------------------------------------------------
    @staticmethod
    def identified(body, name):
        body = copy.deepcopy(body)
        body["mission_id"] = f"SYS-{name}"[:128]
        body["command"]["command_id"] = f"SYS-CMD-{name}"[:128]
        return body

    def golden_and_fixtures(self):
        raw = (FIXTURES / "golden.request.json").read_bytes()
        status, first = self.post(raw)
        golden = json.loads((FIXTURES / "golden.response.json").read_text(encoding="utf-8"))
        self.case("golden", "golden exact response", status == 200 and json.loads(first) == golden, status=status)
        status, again = self.post(raw)
        self.case("golden", "identical resend returns stored bytes", status == 200 and again == first)
        hold = (FIXTURES / "hold.request.json").read_bytes()
        self.expect("fixtures", "hold.request.json after golden START", hold, 200)
        status, stored = self.post(raw)
        self.case("golden", "completed START retry while HELD returns stored bytes", status == 200 and stored == first)
        for name in ("empty-snapshot.request.json", "neutral-removed.request.json"):
            self.expect("fixtures", f"{name} reusing CMD-0001 with other content", (FIXTURES / name).read_bytes(), 409,
                        "COMMAND_ID_CONFLICT", "/command/command_id")
            _, value, _ = self.expect("fixtures", f"{name} re-identified", self.identified(json.loads((FIXTURES / name).read_text()), name), 200)
            if name.startswith("neutral"):
                rows = [r for v in value["results_by_timestamp"].values() for r in v["drone_health"]] if isinstance(value, dict) else []
                self.case("fixtures", "neutral/removed rows unchanged", rows and all(r["health_after"] == r["health_before"] for r in rows))
        manifest = json.loads((FIXTURES / "manifest.json").read_text(encoding="utf-8"))
        invalid = [case["file"] for case in manifest["cases"] if case["semantic"] in ("invalid", "invalid-deferred")]
        self.case("fixtures", "every frozen invalid fixture has a pinned error", sorted(invalid) == sorted(INVALID_FIXTURES))
        for name in invalid:
            code, path = INVALID_FIXTURES.get(name, ("VALIDATION_ERROR", None))
            self.expect("fixtures", name, (FIXTURES / name).read_bytes(), 422, code, path)
        self.expect("fixtures", "malformed.request.txt", (FIXTURES / "malformed.request.txt").read_bytes(), 400, "INVALID_JSON")
        self.expect("fixtures", "duplicate-key.request.txt", (FIXTURES / "duplicate-key.request.txt").read_bytes(), 400, "DUPLICATE_KEY")

    def negatives(self):
        """Spec §10 negatives not already exercised by a frozen fixture."""
        def golden(name):
            return self.identified(GOLDEN, name)
        def first_rows(body):
            return next(iter(body["samples_by_timestamp"].values()))
        body = golden("self-intersecting")
        body["area"]["polygon"] = [[103.8, 1.3], [103.9, 1.4], [103.9, 1.3], [103.8, 1.35], [103.8, 1.3]]
        self.expect("section-10", "self-intersecting polygon", body, 422, "VALIDATION_ERROR", "/area/polygon")
        body = golden("duplicate-rule")
        body["calibration_profile"]["rules"].append(copy.deepcopy(body["calibration_profile"]["rules"][0]))
        self.expect("section-10", "duplicate calibration rule", body, 422, "VALIDATION_ERROR", "/calibration_profile/rules/1")
        at = next(iter(GOLDEN["samples_by_timestamp"]))
        text = json.dumps(golden("duplicate-timestamp"))
        rows = json.dumps(GOLDEN["samples_by_timestamp"][at])
        duplicated = text.replace(f'"{at}": {rows}', f'"{at}": {rows}, "{at}": {rows}')
        self.expect("section-10", "duplicate parsed timestamp (C09)", duplicated.encode(), 400, "DUPLICATE_KEY")
        for name, change, pairs in (("exact-radius pair", 100, 1), ("just-outside-radius pair", 100.001, 0)):
            body = golden(name.replace(" ", "-"))
            red, blue = first_rows(body)
            blue.update(longitude_deg=red["longitude_deg"], latitude_deg=red["latitude_deg"], altitude_m=red["altitude_m"] + change)
            _, value, _ = self.expect("section-10", name, body, 200)
            count = sum(len(v["interactions"]) for v in value["results_by_timestamp"].values()) if isinstance(value, dict) else -1
            self.case("section-10", f"{name} interaction count", count == pairs, count=count)
        body = golden("polygon-edge-point")
        for row in first_rows(body):
            row.update(longitude_deg=103.8, latitude_deg=1.35)
        _, value, _ = self.expect("section-10", "polygon-edge point", body, 200)
        self.case("section-10", "polygon-edge point is inside", isinstance(value, dict) and
                  sum(len(v["interactions"]) for v in value["results_by_timestamp"].values()) == 1)
        for name, altitude in (("band-minimum", 0), ("band-maximum", 500)):
            body = golden(name)
            for row in first_rows(body):
                row["altitude_m"] = altitude
            _, value, _ = self.expect("section-10", f"altitude {name} endpoint", body, 200)
            self.case("section-10", f"altitude {name} is inclusive", isinstance(value, dict) and
                      sum(len(v["interactions"]) for v in value["results_by_timestamp"].values()) == 1)
        body = golden("above-band")
        first_rows(body)[0]["altitude_m"] = 500.001
        _, value, _ = self.expect("section-10", "just above altitude band", body, 200)
        self.case("section-10", "above-band drone is ineligible", isinstance(value, dict) and
                  sum(len(v["interactions"]) for v in value["results_by_timestamp"].values()) == 0)
        sparse = simulation_batch("sparse10000", "system-corpus")
        started = time.perf_counter()
        _, value, _ = self.expect("section-10", "10,000-drone maximum-size snapshot", sparse, 200)
        rows = sum(len(v["drone_health"]) for v in value["results_by_timestamp"].values()) if isinstance(value, dict) else 0
        self.case("section-10", "10,000 health rows returned", rows == 10000, rows=rows,
                  seconds=round(time.perf_counter() - started, 2))

    def geometry(self):
        for vector in VECTORS["rings"]:
            body = self.identified(GOLDEN, "ring-" + vector["id"])
            body["area"]["polygon"] = vector["ring"]
            body["samples_by_timestamp"] = {next(iter(GOLDEN["samples_by_timestamp"])): []}
            if vector["expected"] == "valid":
                self.expect("geometry-vectors", vector["id"], body, 200)
            else:
                self.expect("geometry-vectors", vector["id"], body, 422, "VALIDATION_ERROR", "/area/polygon")
        for vector in VECTORS["containment"]:
            body = self.identified(GOLDEN, "contain-" + vector["id"])
            body["area"]["polygon"] = vector["ring"]
            for row in next(iter(body["samples_by_timestamp"].values())):
                row["longitude_deg"], row["latitude_deg"] = vector["point"]
            _, value, _ = self.expect("containment-vectors", vector["id"], body, 200)
            count = sum(len(v["interactions"]) for v in value["results_by_timestamp"].values()) if isinstance(value, dict) else -1
            self.case("containment-vectors", vector["id"] + " eligibility", count == int(vector["inside"]), count=count)
        rng = random.Random(self.args.seed)
        for index in range(self.args.random):
            ring = random_ring(rng)
            body = self.identified(GOLDEN, f"random-{self.args.seed}-{index}")
            body["area"]["polygon"] = ring
            body["samples_by_timestamp"] = {next(iter(GOLDEN["samples_by_timestamp"])): []}
            if oracle.ring_reason(ring) is None:
                self.expect("geometry-random", f"seed {self.args.seed} #{index}", body, 200)
            else:
                self.expect("geometry-random", f"seed {self.args.seed} #{index}", body, 422, "VALIDATION_ERROR", "/area/polygon")

    def lifecycle(self):
        for prior in (None, "RUNNING", "HELD", "ABORTED"):
            for action in ("START", "HOLD", "RESUME", "ABORT"):
                name = f"{prior or 'none'}-{action}"
                base = self.identified(GOLDEN, "life-" + name)
                def variant(act, identity):
                    body = copy.deepcopy(base)
                    body["command"]["action"], body["command"]["command_id"] = act, identity
                    if act in ("HOLD", "ABORT"):
                        body["samples_by_timestamp"] = {}
                    return body
                if prior:
                    self.expect("lifecycle-setup", name, variant("START", "setup-start-" + name), 200)
                if prior == "HELD":
                    self.expect("lifecycle-setup", name, variant("HOLD", "setup-hold-" + name), 200)
                if prior == "ABORTED":
                    self.expect("lifecycle-setup", name, variant("ABORT", "setup-abort-" + name), 200)
                expected = LIFECYCLE[prior][action]
                if expected in ("RUNNING", "HELD", "ABORTED"):
                    _, value, _ = self.expect("lifecycle", name, variant(action, "under-test-" + name), 200)
                    self.case("lifecycle", name + " run status", isinstance(value, dict) and value["command_ack"]["run_status"] == expected)
                else:
                    self.expect("lifecycle", name, variant(action, "under-test-" + name), 409, expected)

    def restart_recovery(self):
        raw = (FIXTURES / "golden.request.json").read_bytes()
        _, before = self.post(raw)
        self.stop_backend()
        self.start_backend()
        status, after = self.post(raw)
        self.case("restart", "completed exact retry after restart returns stored bytes", status == 200 and after == before)
        # Dense 200: 10,000 pairs keep the post-preparation evaluation window open for seconds.
        sparse = simulation_batch("dense200", "system-restart")
        mid = mission_identity(sparse["mission_id"])
        payload = json.dumps(sparse).encode("utf-8")
        submit = subprocess.Popen([sys.executable, "-c", (
            "import sys,urllib.request\n"
            "r=urllib.request.Request(sys.argv[1],data=open(sys.argv[2],'rb').read(),method='POST',headers={'Content-Type':'application/json'})\n"
            "try:\n urllib.request.urlopen(r,timeout=180)\nexcept Exception as e:\n print('submission ended:',type(e).__name__)\n"),
            self.base + "/api/simulation/v1/commands", str(self.write("dense-restart.request.json", payload))],
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
        state = None
        for _ in range(6000):
            state = self.command_state(sparse["command"]["command_id"])
            if state is not None:
                break
            time.sleep(0.01)
        self.stop_backend(hard=True)  # process death after durable preparation
        submit.wait(timeout=60)
        self.start_backend()
        status, runs = self.request("GET", f"/api/simulation/v1/runs/{mid}")
        restored = json.loads(runs) if status == 200 else {}
        self.case("restart", "prepared command becomes interrupted after process death",
                  state == "pending" and restored.get("phase") == "interrupted", durableStateBeforeKill=state,
                  restored=restored.get("phase"))
        other = copy.deepcopy(sparse)
        other["command"].update(action="ABORT", command_id="SYS-ABORT-DURING-INTERRUPTED")
        other["samples_by_timestamp"] = {}
        self.expect("restart", "other command while interrupted", other, 409, "RUN_COMMAND_PENDING")
        status, raw = self.post(payload)
        expected = resolve_drone_attack_simulation(copy.deepcopy(sparse))
        self.case("restart", "exact retry completes with the resolver result", status == 200 and json.loads(raw) == expected, status=status)
        status, again = self.post(payload)
        self.case("restart", "second exact retry returns stored bytes", status == 200 and again == raw)

    def assembled(self):
        status, page = self.request("GET", "/", record=False)
        self.case("assembled", "built frontend index served", status == 200 and b"<div id=\"root\"" in page)
        status, runs = self.request("GET", "/api/simulation/v1/runs")
        mid = mission_identity(GOLDEN["mission_id"])
        status, world = self.request("GET", f"/api/missions/{mid}/world")
        value = json.loads(world) if status == 200 else {}
        self.case("assembled", "mapped world readable through the frontend proxy",
                  status == 200 and value.get("mission", {}).get("domain") == "external-simulation-v1")

    def write(self, name, data):
        path = self.out / name
        path.write_bytes(data)
        return path

    def run(self):
        assert free(self.args.backend_port) and free(self.args.frontend_port), "ports occupied; nothing touched"
        assert not self.db.exists()
        started = time.time()
        try:
            self.start_frontend()
            self.start_backend()
            for section in (self.golden_and_fixtures, self.negatives, self.geometry, self.lifecycle, self.assembled,
                            self.restart_recovery):
                began = time.perf_counter()
                if section == self.restart_recovery:
                    kill_window = len(self.statuses)
                section()
                self.sections[section.__name__] = round(time.perf_counter() - began, 2)
        finally:
            for process in (self.backend, self.frontend):
                if process and process.poll() is None:
                    process.terminate()
                    process.wait(timeout=30)
            for log in self.logs:
                log.close()
            time.sleep(0.5)
            ports_free = free(self.args.backend_port) and free(self.args.frontend_port)
            removed = []
            for suffix in ("", "-wal", "-shm", "-journal"):
                path = Path(str(self.db) + suffix)
                if path.exists():
                    path.unlink()
                    removed.append(path.name)
        server_errors = [s for s in self.statuses if s >= 500]
        failures = [c for c in self.cases if not c["ok"]]
        summary = dict(tag=self.args.tag, build=self.args.build, seed=self.args.seed, randomRings=self.args.random,
                       cases=len(self.cases), failures=len(failures), requests=len(self.statuses),
                       serverErrors=len(server_errors), statusCounts={str(s): self.statuses.count(s) for s in sorted(set(self.statuses))},
                       requestsBeforeRestartSection=kill_window if "kill_window" in locals() else None,
                       portsFree=ports_free, databaseFilesRemoved=removed, seconds=round(time.time() - started, 1),
                       sectionSeconds=self.sections,
                       providerRequests=0)
        (self.out / "cases.json").write_text(json.dumps(self.cases, indent=1), encoding="utf-8")
        (self.out / "summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
        print(json.dumps(summary, indent=1))
        digest = hashlib.sha256((self.out / "cases.json").read_bytes()).hexdigest()
        print("cases.json sha256", digest)
        return 0 if not failures and not server_errors and ports_free else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tag")
    parser.add_argument("--build", required=True, help="built frontend directory under frontend/, e.g. dist-test-<suffix>")
    parser.add_argument("--backend-port", type=int, default=8321)
    parser.add_argument("--frontend-port", type=int, default=5321)
    parser.add_argument("--random", type=int, default=200, help="seeded random geometry rings to send")
    parser.add_argument("--seed", type=int, default=20260924)
    args = parser.parse_args()
    if not args.tag.replace("-", "").isalnum():
        parser.error("tag must be alphanumeric with hyphens")
    raise SystemExit(Corpus(args).run())


if __name__ == "__main__":
    main()
