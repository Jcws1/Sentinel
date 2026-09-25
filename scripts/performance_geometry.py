"""Matched A/B timing for exact polygon validation (decode-regression budgets).

  frames <out.json>
      Produce world frames that contain zones from tracked inputs, through the
      real application on a temporary database: saved Sydney/default location
      scenarios with boundaries, external golden/local40/remote40/§9 missions and
      the tactical fixture. Output: [{"name", "text"}] with canonical frame JSON.
      Six extra frames reuse the golden frame with a 101-position zone: stars
      (ordinary, mixed-exponent, subnormal-scale), whose edge boxes are mostly
      disjoint, and accordions of the same three kinds, whose edge boxes all
      overlap so the exact bounding-box early exit never applies. They carry
      "diagnostic": true: both A/B tools report them but exclude them from the
      budget, which covers tracked fixtures only (their zones have 4-6 positions).
  backend <frames.json> --baseline-root <dir> [--rounds 30] [--iterations 20]
      Alternate child processes that time WorldFrame.model_validate_json on the
      same frames, using <dir>/backend (a baseline snapshot, e.g. `git archive
      HEAD backend`) versus this checkout. Reports per-frame medians and the
      median candidate/baseline ratio per round. Each child also times resolver
      containment (validation.inside_polygon for a 10 x 10 grid of drones) on
      the golden area and every diagnostic zone ("containment:<zone>" entries,
      diagnostic, not budgeted).
Run with the machine otherwise idle. No provider requests.
"""
import argparse
import copy
import json
import math
import os
import statistics
import subprocess
import sys
import tempfile
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def diagnostic_rings():
    """101-position zones for worst-case characterisation; valid for HEAD and candidate.

    Stars have mostly disjoint edge boxes, the best case for the exact bounding-box early exit.
    Accordions (critic round 2, L2) are sawtooths of long, stacked, nearly parallel edges turned
    45 degrees, so every edge box overlaps every other and each pair needs exact orientations.
    """
    def star(cx, cy, rx, ry, scale=1.0):
        points = []
        for i in range(100):
            angle, factor = 2 * math.pi * i / 100, 0.6 if i % 2 else 1.0
            points.append([round(cx + factor * rx * math.cos(angle), 6) * scale,
                           round(cy + factor * ry * math.sin(angle), 6) * scale])
        return points + [list(points[0])]

    def accordion(cx, cy, size, scale=1.0):
        along = [(0.0, 2.0 * k) if i == 0 else (100.0, 2.0 * k + 1) for k in range(49) for i in (0, 1)]
        along += [(-10.0, 98.0), (-10.0, -1.0)]
        c = size / math.sqrt(2)
        points = [[round(cx + (u - v) * c, 6) * scale, round(cy + (u + v) * c, 6) * scale] for u, v in along]
        return points + [list(points[0])]
    mixed = star(0.0, 0.0, 170.0, 80.0)
    mixed[25][0], mixed[75][0] = 1e-300, -1e-300  # one tiny term widens every exact integer
    mixed_accordion = accordion(0.0, 0.0, 0.6)
    mixed_accordion[0] = [1e-300, -1e-300]  # the first vertex, (0, 0), moved by a tiny term
    mixed_accordion[-1] = list(mixed_accordion[0])
    return {"diagnostic-ordinary-101": star(103.85, 1.35, 0.05, 0.03),
            "diagnostic-mixed-exponent-101": mixed,
            "diagnostic-subnormal-101": star(0.0, 0.0, 1.0, 0.6, 1e-300),
            "diagnostic-accordion-ordinary-101": accordion(103.85, 1.35, 0.006),
            "diagnostic-accordion-mixed-exponent-101": mixed_accordion,
            "diagnostic-accordion-subnormal-101": accordion(0.0, 0.0, 0.6, 1e-300)}


def containment_drones(ring, side=10):
    """A side x side grid of drone positions over the zone's bounding box (cell centres)."""
    xs, ys = [p[0] for p in ring], [p[1] for p in ring]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    return [dict(longitude_deg=x0 + (x1 - x0) * (i + 0.5) / side, latitude_deg=y0 + (y1 - y0) * (j + 0.5) / side)
            for i in range(side) for j in range(side)]


def emit_frames(out):
    sys.path[:0] = [str(ROOT / "backend"), str(ROOT / "backend/tests")]
    from fastapi.testclient import TestClient
    from app.main import create_app
    from app.adapters.simulation_v1.projection import mission_identity
    from app.missions.tactical_fixture import TACTICAL_FIXTURE_ID
    from simulation_fixtures import simulation_batch
    frames = []
    with tempfile.TemporaryDirectory(prefix="geometry-frames-", dir=ROOT / ".cache") as directory:
        with TestClient(create_app(str(Path(directory) / "frames.sqlite3"), True, demo_enabled=True)) as client:
            credential = "c" * 64

            def control(mid, action):
                intent = client.post(f"/api/interactive/{mid}/intents", json={"action": action}).json()
                receipt = client.post(f"/api/interactive/{mid}/commands", json={"commandId": str(uuid.uuid4()), "holderId": "bench", "intent": intent},
                                      headers={"X-Sentinel-Control": credential}).json()
                assert receipt["accepted"], receipt
            for name in ("remote-20v20", "default"):
                content = json.loads((ROOT / f"frontend/tests/fixtures/scenario-location/{name}.json").read_text(encoding="utf-8"))
                saved = client.post("/api/scenarios", json={"requestId": str(uuid.uuid4()), "expectedRevision": 0, "content": content}).json()["result"]
                reference = {key: saved[key] for key in ("definitionId", "revision", "contentHash")}
                run = client.post("/api/interactive/runs", json={"creationId": str(uuid.uuid4()), "scenario": reference}).json()
                assert run["accepted"], run
                control(run["missionId"], "acquire")
                control(run["missionId"], "start")
                frames.append(dict(name=f"interactive-{name}", text=client.get(f"/api/missions/{run['missionId']}/world").text))
                control(run["missionId"], "end")
            batches = [("external-golden", json.loads((ROOT / "contracts/simulation/fixtures/golden.request.json").read_text(encoding="utf-8"))),
                       ("external-local40", simulation_batch("local40", "frames")), ("external-remote40", simulation_batch("remote40", "frames"))]
            dataset = json.loads((ROOT / "frontend/tests/fixtures/simulation/defensive-s9.json").read_text(encoding="utf-8"))
            batches.append(("external-s9-north", dataset["missions"][0]["commands"][0]))
            for name, body in batches:
                assert client.post("/api/simulation/v1/commands", content=json.dumps(body)).status_code == 200
                frames.append(dict(name=name, text=client.get(f"/api/missions/{mission_identity(body['mission_id'])}/world").text))
            frames.append(dict(name="tactical-fixture", text=client.get(f"/api/missions/{TACTICAL_FIXTURE_ID}/world").text))
    golden = json.loads(next(f["text"] for f in frames if f["name"] == "external-golden"))
    for name, ring in diagnostic_rings().items():
        frame = copy.deepcopy(golden)
        next(iter(frame["zones"].values()))["geometry"]["coordinates"] = [ring]
        frames.append(dict(name=name, text=json.dumps(frame, separators=(",", ":")), diagnostic=True))
    for frame in frames:
        assert json.loads(frame["text"])["zones"], frame["name"]
    Path(out).write_text(json.dumps(frames, indent=1), encoding="utf-8")
    print(json.dumps([dict(name=f["name"], bytes=len(f["text"]), zones=len(json.loads(f["text"])["zones"])) for f in frames]))


def child(root, frames_path, iterations):
    sys.path.insert(0, str(Path(root) / "backend"))
    from app.domain.models import WorldFrame
    from app.simulation.validation import inside_polygon
    try:  # the candidate resolver prepares the area once per timestamp
        from app.domain.geometry import PreparedRing
    except ImportError:  # the baseline resolver passes the ring itself
        PreparedRing = None
    frames = json.loads(Path(frames_path).read_text(encoding="utf-8"))
    for frame in frames:  # warm-up and acceptance check
        for _ in range(3):
            WorldFrame.model_validate_json(frame["text"])
    result = {}
    for frame in frames:
        started = time.perf_counter_ns()
        for _ in range(iterations):
            WorldFrame.model_validate_json(frame["text"])
        result[frame["name"]] = (time.perf_counter_ns() - started) / iterations / 1e6
    golden = json.loads((ROOT / "contracts/simulation/fixtures/golden.request.json").read_text(encoding="utf-8"))
    for name, ring in {"golden-area": golden["area"]["polygon"], **diagnostic_rings()}.items():
        drones = containment_drones(ring)
        area = PreparedRing(ring) if PreparedRing else ring
        [inside_polygon(drone, area) for drone in drones]  # warm-up
        started = time.perf_counter_ns()
        area = PreparedRing(ring) if PreparedRing else ring
        for drone in drones:
            inside_polygon(drone, area)
        result[f"containment:{name}"] = (time.perf_counter_ns() - started) / 1e6
    print(json.dumps(result))


def backend(frames_path, baseline_root, rounds, iterations, out):
    samples = {"baseline": [], "candidate": []}
    for round_ in range(rounds):
        order = ("baseline", "candidate") if round_ % 2 == 0 else ("candidate", "baseline")
        for variant in order:
            root = baseline_root if variant == "baseline" else ROOT
            env = {**os.environ, "PYTHONDONTWRITEBYTECODE": "1"}
            output = subprocess.check_output([sys.executable, __file__, "child", str(root), frames_path, str(iterations)], env=env)
            samples[variant].append(json.loads(output))
    names = list(samples["candidate"][0])
    diagnostic = {f["name"] for f in json.loads(Path(frames_path).read_text(encoding="utf-8")) if f.get("diagnostic")}
    diagnostic |= {name for name in names if name.startswith("containment:")}
    report = {}
    for name in names:
        base = [s[name] for s in samples["baseline"]]
        cand = [s[name] for s in samples["candidate"]]
        ratios = [c / b for b, c in zip(base, cand)]
        report[name] = dict(baselineMedianMs=statistics.median(base), candidateMedianMs=statistics.median(cand),
                            medianRatio=statistics.median(ratios), ratioP90=sorted(ratios)[int(0.9 * (len(ratios) - 1))])
    summary = dict(rounds=rounds, iterations=iterations, baselineRoot=str(baseline_root), frames=report,
                   budgetScope="tracked-fixture frames; diagnostic frames and containment entries are reported, not budgeted",
                   diagnosticFrames=sorted(diagnostic),
                   worstMedianRatio=max(r["medianRatio"] for name, r in report.items() if name not in diagnostic),
                   budgetRatio=1.10)
    summary["withinBudget"] = summary["worstMedianRatio"] <= summary["budgetRatio"]
    Path(out).write_text(json.dumps(dict(summary=summary, samples=samples), indent=1), encoding="utf-8")
    print(json.dumps(summary, indent=1))


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "child":
        return child(sys.argv[2], sys.argv[3], int(sys.argv[4]))
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    frames = sub.add_parser("frames")
    frames.add_argument("out")
    bench = sub.add_parser("backend")
    bench.add_argument("frames")
    bench.add_argument("--baseline-root", type=Path, required=True)
    bench.add_argument("--rounds", type=int, default=30)
    bench.add_argument("--iterations", type=int, default=20)
    bench.add_argument("--out", required=True)
    args = parser.parse_args()
    if args.command == "frames":
        emit_frames(args.out)
    else:
        backend(args.frames, args.baseline_root, args.rounds, args.iterations, args.out)


if __name__ == "__main__":
    main()
