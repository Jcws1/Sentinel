"""Bounded Phase 5 probes. Fresh disposable DB per sample; no external providers.

The 120-second / 2-GiB incremental RSS diagnostic budgets are harness limits, not
API input caps. Windows peak working set is process-wide and reported separately
from current RSS. This is a backend measurement, never compositor evidence.
"""
import argparse
import asyncio
import ctypes
import hashlib
import json
import platform
import queue
import statistics
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "backend/tests")]
from app.missions.service import MissionService
from app.recording.sqlite_repository import RecordingRepository
from app.recording.storage_codec import decode_text
from app.simulation.service import SimulationService
from simulation_fixtures import simulation_batch


def memory(pid=None):
    if sys.platform != "win32":
        return {}
    class Counters(ctypes.Structure):
        _fields_ = [("cb", ctypes.c_ulong), ("PageFaultCount", ctypes.c_ulong)] + [(name, ctypes.c_size_t) for name in (
            "PeakWorkingSetSize", "WorkingSetSize", "QuotaPeakPagedPoolUsage", "QuotaPagedPoolUsage", "QuotaPeakNonPagedPoolUsage", "QuotaNonPagedPoolUsage", "PagefileUsage", "PeakPagefileUsage")]
    values = Counters()
    values.cb = ctypes.sizeof(values)
    kernel = ctypes.windll.kernel32
    kernel.GetCurrentProcess.restype = ctypes.c_void_p
    kernel.OpenProcess.restype = ctypes.c_void_p
    handle = kernel.OpenProcess(0x410, False, pid) if pid else kernel.GetCurrentProcess()
    try:
        if not handle or not ctypes.windll.psapi.GetProcessMemoryInfo(ctypes.c_void_p(handle), ctypes.byref(values), values.cb):
            return {}
    finally:
        if pid and handle:
            kernel.CloseHandle(ctypes.c_void_p(handle))
    return {key: getattr(values, key) for key in ("WorkingSetSize", "PeakWorkingSetSize", "PagefileUsage", "PeakPagefileUsage")}


def components(path):
    return {suffix or "database": Path(str(path)+suffix).stat().st_size if Path(str(path)+suffix).exists() else 0 for suffix in ("", "-wal", "-shm")}


async def sample(kind, ordinal, output):
    request = simulation_batch(kind, "matched")
    raw = json.dumps(request, separators=(",", ":"))
    started = time.perf_counter()
    before = memory()
    print(json.dumps(dict(probeStarted=ordinal, rssBaseline=before.get("WorkingSetSize", 0))), flush=True)
    stop = False
    memory_peak = before.get("WorkingSetSize", 0)
    loop_gaps = []
    last = time.perf_counter()
    async def observe():
        nonlocal memory_peak, last
        while not stop:
            await asyncio.sleep(.02)
            now = time.perf_counter()
            loop_gaps.append((now-last)*1000)
            last = now
            memory_peak = max(memory_peak, memory().get("WorkingSetSize", 0))
            if now-started > 120 or memory_peak-before.get("WorkingSetSize", 0) > 2*1024**3:
                task.cancel()
    with tempfile.TemporaryDirectory(prefix="phase5-probe-", dir=ROOT / ".cache") as directory:
        path = Path(directory) / "simulation.sqlite"
        repo = RecordingRepository(str(path))
        authority = MissionService(repo)
        service = SimulationService(authority)
        times = {}
        original_prepare, original_complete = service._prepare, service._complete
        def prepare(*args):
            times["validationToPrepareMs"] = (time.perf_counter()-started)*1000
            begin = time.perf_counter()
            value = original_prepare(*args)
            times["prepareMs"] = (time.perf_counter()-begin)*1000
            times["evaluationStart"] = time.perf_counter()
            return value
        def complete(*args):
            times["resolutionMs"] = (time.perf_counter()-times.pop("evaluationStart"))*1000
            begin = time.perf_counter()
            value = original_complete(*args)
            times["completionTransactionMs"] = (time.perf_counter()-begin)*1000
            return value
        service._prepare, service._complete = prepare, complete
        task = asyncio.create_task(service.submit(raw))
        observer = asyncio.create_task(observe())
        try:
            response_text = await asyncio.wait_for(task, timeout=120)
            duration = (time.perf_counter()-started)*1000
            result = json.loads(response_text)
            after = memory()
            stop = True
            await observer
            db = repo.db
            logical = sum(len(decode_text(r[0]).encode()) for r in db.execute("SELECT frame_json FROM frames"))
            logical_events = sum(len(r[0].encode()) for r in db.execute("SELECT event_json FROM events"))
            measured = dict(kind=kind, ordinal=ordinal, cold=ordinal==0, totalMs=duration, stages=times,
                requestBytes=len(raw.encode()), responseBytes=len(response_text.encode()), requestSha256=hashlib.sha256(raw.encode()).hexdigest(),
                responseSha256=hashlib.sha256(response_text.encode()).hexdigest(),
                inputRows=sum(map(len, request["samples_by_timestamp"].values())), timestamps=len(request["samples_by_timestamp"]),
                eligibleOutputPairs=sum(len(v["interactions"]) for v in result["results_by_timestamp"].values()),
                healthRows=sum(len(v["drone_health"]) for v in result["results_by_timestamp"].values()),
                memoryBefore=before, memoryAfter=after, sampledPeakRssBytes=memory_peak,
                eventLoopMaxGapMs=max(loop_gaps, default=0), liveFiles=components(path),
                frameCount=db.execute("SELECT count(*) FROM frames").fetchone()[0],
                eventCount=db.execute("SELECT count(*) FROM events").fetchone()[0],
                logicalFrameBytes=logical, logicalEventBytes=logical_events,
                pageCount=db.execute("PRAGMA page_count").fetchone()[0], pageSize=db.execute("PRAGMA page_size").fetchone()[0],
                freePages=db.execute("PRAGMA freelist_count").fetchone()[0],
                sourceGapLimitation="20ms event-loop heartbeat, not interactive publication or compositor")
        finally:
            stop = True
            await service.close()
            await observer
            repo.close()
        measured["afterNormalClose"] = components(path)
        measured["retainedBytesPerFrame"] = measured["afterNormalClose"]["database"] / measured["frameCount"]
        measured["retainedBytesPerInputRow"] = measured["afterNormalClose"]["database"] / measured["inputRows"]
    measured["databaseRemoved"] = not path.exists()
    (output / f"{kind}-{ordinal}.json").write_text(json.dumps(measured, indent=2))
    return measured


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("tag")
    parser.add_argument("--kind", choices=["golden", "local40", "remote40", "sparse10000", "dense50", "dense100", "dense200"], required=True)
    parser.add_argument("--samples", type=int, default=4)
    parser.add_argument("--worker", action="store_true", help=argparse.SUPPRESS)
    args = parser.parse_args()
    if not args.tag.replace("-", "").isalnum() or not 1 <= args.samples <= 8:
        parser.error("Invalid diagnostic tag/count")
    output = ROOT / "test-results/phase5-simulation-compatibility" / args.tag
    output.mkdir(parents=True, exist_ok=True)
    if not args.worker:
        # External supervision also bounds synchronous serialization/SQLite work,
        # where an asyncio timeout cannot preempt the blocked event loop.
        command = [sys.executable, str(Path(__file__).resolve()), args.tag, "--kind", args.kind, "--samples", str(args.samples), "--worker"]
        lines = queue.Queue()
        with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True) as child:
            def read_output():
                for line in child.stdout:
                    lines.put(line)
            reader = threading.Thread(target=read_output, daemon=True)
            reader.start()
            run_started, baseline, peak = time.perf_counter(), 0, 0
            failure = None
            while child.poll() is None:
                try:
                    line = lines.get(timeout=.05)
                    print(line, end="", flush=True)
                    try:
                        message = json.loads(line)
                        if "probeStarted" in message:
                            run_started, baseline = time.perf_counter(), message["rssBaseline"]
                    except ValueError:
                        pass
                except queue.Empty:
                    pass
                rss = memory(child.pid).get("WorkingSetSize", 0)
                peak = max(peak, rss)
                if time.perf_counter()-run_started > 120 or (baseline and rss-baseline > 2*1024**3):
                    failure = "Diagnostic time/memory budget reached; result is incomplete"
                    child.kill()
                    break
            child.wait()
            reader.join(timeout=1)
            while not lines.empty():
                print(lines.get(), end="")
            (output / "supervision.json").write_text(json.dumps(dict(exitCode=child.returncode, failure=failure,
                parentObservedPeakRssBytes=peak, pollMs=50, perRunSeconds=120, incrementalRssBudgetBytes=2*1024**3), indent=2))
            if child.returncode or failure:
                raise SystemExit(child.returncode or 1)
        return
    results = []
    try:
        for ordinal in range(args.samples):
            result = await sample(args.kind, ordinal, output)
            results.append(result)
            print(json.dumps({key: result[key] for key in ("kind", "ordinal", "totalMs", "eligibleOutputPairs", "eventLoopMaxGapMs", "retainedBytesPerInputRow")}), flush=True)
    finally:
        (output / "summary.json").write_text(json.dumps(dict(platform=platform.platform(), python=sys.version, providerRequests=0,
            results=results, warmMedianMs=statistics.median([r["totalMs"] for r in results[1:]]) if len(results)>1 else None), indent=2))


if __name__ == "__main__":
    asyncio.run(main())
