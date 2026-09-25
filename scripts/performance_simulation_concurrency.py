"""P5-BATCH: interactive source responsiveness while an external batch completes.

Each run starts a task-owned backend with the opt-in probe runtime
(backend/tests/batch_probe_runtime.py) on a fresh database, creates the moving
Sydney 20v20 saved scenario (40 units) through the ordinary scenario/interactive
APIs, acquires and starts it with a private task credential, subscribes to the
mission WebSocket and measures a 20 s window. External batch kinds submit a
batch 5 s into the window; ``control`` submits nothing. Recorded per run:
- client WebSocket delta arrival gaps and sequence continuity (loss/reorder),
- server publication gaps for the interactive mission (publication tap),
- 10 ms event-loop heartbeat gaps, and
- operator control latency every second: one ``renew`` action is the intent
  request plus the authoritative command (``renewLatencyMs``, with both parts
  also reported separately), plus batch latency.
Interleaved control/batch pairs keep machine drift out of the comparison.
Batch kinds come from backend/tests/simulation_fixtures.py: local40 and
sparse10000 (one or two timestamps), and the timestamp dimension
(``steps100x40``: 100 timestamps of the same 40 drones; ``churn300``: 300
timestamps adding one drone each, so every frame carries all earlier drones).
Run with the machine otherwise idle; results go to
test-results/simulation-concurrency/<tag>/. No provider requests.

  backend/.venv/Scripts/python.exe scripts/performance_simulation_concurrency.py <tag> [--repeats 3]
"""
import argparse
import asyncio
import json
import os
import platform
import secrets
import socket
import statistics
import subprocess
import sys
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

import websockets

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend/tests"), str(ROOT / "backend")]
from simulation_fixtures import simulation_batch  # noqa: E402

WARMUP_S, WINDOW_S, BATCH_AT_S, RENEW_EVERY_S = 10, 20, 5, 1.0
BUDGET_MS = {"local40": 750}


def free(port):
    with socket.socket() as s:
        try:
            s.bind(("127.0.0.1", port))
            return True
        except OSError:
            return False


def http(method, url, body=None, headers=None, timeout=180):
    data = json.dumps(body).encode() if body is not None else None
    request = urllib.request.Request(url, data=data, method=method,
                                     headers={"Content-Type": "application/json", **(headers or {})})
    started = time.perf_counter_ns()
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            status, raw = response.status, response.read()
    except urllib.error.HTTPError as error:
        status, raw = error.code, error.read()
    return status, raw, started, time.perf_counter_ns()


def percentile(values, p):
    ordered = sorted(values)
    return ordered[max(0, -(-len(ordered) * p // 100) - 1)] if ordered else None


def gaps_ms(times_ns):
    return [(b - a) / 1e6 for a, b in zip(times_ns, times_ns[1:])]


def summarize(values):
    return dict(count=len(values), max=max(values, default=None), p99=percentile(values, 99), p95=percentile(values, 95),
                median=statistics.median(values) if values else None)


def scenario_content():
    code = ("import {performanceScenario} from './tests/performance/scenario.mjs';"
            "console.log(JSON.stringify(performanceScenario(20,{location:'sydney'})))")
    output = subprocess.check_output(["node", "--input-type=module", "-e", code], cwd=ROOT / "frontend")
    return json.loads(output)


class Run:
    def __init__(self, args, kind, ordinal, content, out):
        self.args, self.kind, self.ordinal, self.content, self.out = args, kind, ordinal, content, out
        self.base = f"http://127.0.0.1:{args.port}"
        directory = ROOT / ".cache/batch-probe"
        directory.mkdir(parents=True, exist_ok=True)
        self.db = directory / f"batch-probe-{args.tag}-{kind}-{ordinal}-{os.getpid()}.sqlite3"
        self.credential, self.holder = secrets.token_hex(32), f"Probe {uuid.uuid4().hex[:8]}"
        self.arrivals, self.renewals, self.batch = [], [], None

    def start(self):
        assert free(self.args.port), "probe port occupied; nothing touched"
        env = {**os.environ, "SENTINEL_BATCH_PROBE": "1", "SENTINEL_DEMO": "1", "SENTINEL_DB_PATH": str(self.db),
               "PYTHONDONTWRITEBYTECODE": "1", "PYTHONPATH": os.pathsep.join([str(ROOT / "backend/tests"), str(ROOT / "backend")])}
        env.pop("SENTINEL_FIXTURES", None)
        self.log = open(self.out / f"{self.kind}-{self.ordinal}-backend.log", "w", encoding="utf-8")
        self.server = subprocess.Popen([str(ROOT / "backend/.venv/Scripts/python.exe"), "-m", "uvicorn", "batch_probe_runtime:app",
                                        "--host", "127.0.0.1", "--port", str(self.args.port)],
                                       cwd=ROOT / "backend", env=env, stdout=self.log, stderr=subprocess.STDOUT)
        for _ in range(300):
            try:
                if http("GET", self.base + "/api/interactive/entry", timeout=2)[0] == 200:
                    return
            except OSError:
                time.sleep(0.1)
        raise RuntimeError("probe backend did not start")

    def stop(self):
        self.server.terminate()
        self.server.wait(timeout=30)
        self.log.close()
        for _ in range(100):
            if free(self.args.port):
                break
            time.sleep(0.1)
        removed = []
        for suffix in ("", "-wal", "-shm", "-journal"):
            path = Path(str(self.db) + suffix)
            if path.exists():
                path.unlink()
                removed.append(path.name)
        return free(self.args.port), removed

    def control(self, action):
        """One operator control action: intent request, then the authoritative command."""
        status, raw, started, intent_received = http("POST", f"{self.base}/api/interactive/{self.mission}/intents", {"action": action})
        assert status == 200, raw
        intent = json.loads(raw)
        status, raw, sent, received = http("POST", f"{self.base}/api/interactive/{self.mission}/commands",
                                           {"commandId": str(uuid.uuid4()), "holderId": self.holder, "intent": intent},
                                           {"X-Sentinel-Control": self.credential})
        receipt = json.loads(raw)
        assert status == 200 and receipt["accepted"], raw
        return dict(startedNs=started, intentMs=(intent_received - started) / 1e6, commandSentNs=sent,
                    commandMs=(received - sent) / 1e6, receivedNs=received, ms=(received - started) / 1e6)

    def prepare(self):
        status, raw, _, _ = http("POST", self.base + "/api/scenarios",
                                 {"requestId": str(uuid.uuid4()), "expectedRevision": 0, "content": self.content})
        saved = json.loads(raw)["result"]
        reference = {key: saved[key] for key in ("definitionId", "revision", "contentHash")}
        status, raw, _, _ = http("POST", self.base + "/api/interactive/runs", {"creationId": str(uuid.uuid4()), "scenario": reference})
        receipt = json.loads(raw)
        assert status == 200 and receipt["accepted"], raw
        self.mission = receipt["missionId"]
        self.control("acquire")
        self.control("start")
        http("POST", self.base + "/__verification/batch-probe/watch", {"missionId": self.mission})

    async def listen(self, stop):
        async with websockets.connect(f"ws://127.0.0.1:{self.args.port}/api/missions/{self.mission}/stream", max_size=None) as socket_:
            while not stop.is_set():
                try:
                    raw = await asyncio.wait_for(socket_.recv(), timeout=0.5)
                except asyncio.TimeoutError:
                    continue
                at = time.perf_counter_ns()
                value = json.loads(raw)
                self.arrivals.append(dict(atNs=at, type=value.get("type"), sequence=value.get("sequence"),
                                          previous=value.get("previousSequence"), epoch=value.get("streamEpoch"),
                                          effectiveAt=value.get("effectiveAt"), recordedAt=value.get("recordedAt")))

    async def renew(self, stop):
        while not stop.is_set():
            began = time.perf_counter_ns()
            self.renewals.append(await asyncio.to_thread(self.control, "renew"))
            await asyncio.sleep(max(0, RENEW_EVERY_S - (time.perf_counter_ns() - began) / 1e9))

    async def submit(self):
        if self.kind == "control":
            return
        body = simulation_batch(self.kind, f"concurrency-{self.args.tag}-{self.ordinal}")
        status, raw, sent, received = await asyncio.to_thread(http, "POST", self.base + "/api/simulation/v1/commands", body)
        self.batch = dict(kind=self.kind, status=status, sentNs=sent, receivedNs=received, ms=(received - sent) / 1e6,
                          requestBytes=len(json.dumps(body)), responseBytes=len(raw),
                          inputRows=sum(len(v) for v in body["samples_by_timestamp"].values()))

    async def measure(self):
        stop = asyncio.Event()
        listener = asyncio.create_task(self.listen(stop))
        await asyncio.sleep(WARMUP_S)
        window_start = json.loads(http("GET", self.base + "/__verification/batch-probe?sinceNs=0&untilNs=0")[1])["serverPerfNs"]
        client_start = time.perf_counter_ns()
        renewer = asyncio.create_task(self.renew(stop))
        await asyncio.sleep(BATCH_AT_S)
        await self.submit()
        remaining = WINDOW_S - (time.perf_counter_ns() - client_start) / 1e9
        await asyncio.sleep(max(3.0, remaining))
        stop.set()
        await asyncio.gather(listener, renewer)
        probe = json.loads(http("GET", f"{self.base}/__verification/batch-probe?sinceNs={window_start}")[1])
        return client_start, window_start, probe

    def metrics(self, client_start, window_start, probe):
        window = [a for a in self.arrivals if a["atNs"] >= client_start]
        deltas = [a for a in window if a["type"] == "delta"]
        continuity = all(b["previous"] == a["sequence"] and b["sequence"] == a["sequence"] + 1 and b["epoch"] == a["epoch"]
                         for a, b in zip(deltas, deltas[1:]))
        published = [p for p in probe["publications"] if p["missionId"] == self.mission and p["type"] == "delta"]
        received = {d["sequence"] for d in deltas}
        missing = sorted({p["sequence"] for p in published} - received)
        missing = [s for s in missing if s <= max(received, default=-1)]
        effective = [d["effectiveAt"] for d in deltas]
        result = dict(kind=self.kind, ordinal=self.ordinal, missionId=self.mission,
                      windowSeconds=round((max((a["atNs"] for a in window), default=client_start) - client_start) / 1e9, 3),
                      arrivalGapsMs=summarize(gaps_ms([d["atNs"] for d in deltas])),
                      publicationGapsMs=summarize(gaps_ms([p["atNs"] for p in published])),
                      eventLoopGapsMs=summarize(gaps_ms(probe["beats"])),
                      eventLoopGapsOver50Ms=sum(g > 50 for g in gaps_ms(probe["beats"])),
                      renewLatencyMs=summarize([r["ms"] for r in self.renewals]),
                      renewIntentLatencyMs=summarize([r["intentMs"] for r in self.renewals]),
                      renewCommandLatencyMs=summarize([r["commandMs"] for r in self.renewals]),
                      renewStartGapsMs=summarize(gaps_ms([r["startedNs"] for r in self.renewals])),
                      renewals=len(self.renewals), deltasReceived=len(deltas), deltasPublished=len(published),
                      sequenceContinuous=continuity, missingSequences=missing,
                      effectiveTimeMonotonic=effective == sorted(effective),
                      resyncOrSnapshotInWindow=[a["type"] for a in window if a["type"] in ("snapshot", "resync-required")],
                      batch=self.batch)
        if self.batch:
            during = [r["ms"] for r in self.renewals if r["startedNs"] < self.batch["receivedNs"] and r["receivedNs"] > self.batch["sentNs"]]
            result["renewLatencyOverlappingBatchMs"] = summarize(during)
        budget = BUDGET_MS.get(self.kind)
        if budget is not None:
            result["budgetMs"] = budget
            result["withinBudget"] = (result["arrivalGapsMs"]["max"] or 0) <= budget
        return result


async def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("tag")
    parser.add_argument("--repeats", type=int, default=3)
    parser.add_argument("--port", type=int, default=8341)
    parser.add_argument("--kinds", default="control,local40,sparse10000")
    args = parser.parse_args()
    if not args.tag.replace("-", "").isalnum():
        parser.error("tag must be alphanumeric with hyphens")
    out = ROOT / "test-results/simulation-concurrency" / args.tag
    out.mkdir(parents=True, exist_ok=True)
    content = scenario_content()
    results, cleanup = [], []
    for ordinal in range(1, args.repeats + 1):
        for kind in args.kinds.split(","):
            run = Run(args, kind, ordinal, content, out)
            run.start()
            try:
                run.prepare()
                client_start, window_start, probe = await run.measure()
                result = run.metrics(client_start, window_start, probe)
            finally:
                ports_free, removed = run.stop()
                cleanup.append(dict(kind=kind, ordinal=ordinal, portFree=ports_free, databaseFilesRemoved=removed))
            (out / f"{kind}-{ordinal}.json").write_text(json.dumps(dict(result=result, arrivals=run.arrivals,
                                                                    renewals=run.renewals, probe=probe), indent=1), encoding="utf-8")
            results.append(result)
            print(json.dumps({k: result[k] for k in ("kind", "ordinal", "arrivalGapsMs", "eventLoopGapsMs", "renewLatencyMs",
                                                     "sequenceContinuous", "missingSequences")} | ({"batchMs": result["batch"]["ms"]} if result["batch"] else {})),
                  flush=True)
    summary = dict(tag=args.tag, platform=platform.platform(), python=sys.version, warmupSeconds=WARMUP_S, windowSeconds=WINDOW_S,
                   batchAtSeconds=BATCH_AT_S, renewEverySeconds=RENEW_EVERY_S, budgetsMs=BUDGET_MS, results=results, cleanup=cleanup,
                   providerRequests=0)
    (out / "summary.json").write_text(json.dumps(summary, indent=1), encoding="utf-8")
    failed = [r for r in results if r.get("withinBudget") is False or not r["sequenceContinuous"] or r["missingSequences"]]
    raise SystemExit(1 if failed else 0)


if __name__ == "__main__":
    asyncio.run(main())
