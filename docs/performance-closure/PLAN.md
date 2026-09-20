# D7 performance closure — bounded pass

Start: **2026-09-20 05:41:16 UTC** (13:41:16 Singapore).
Hard deadline: **06:41:16 UTC**. Stop substantial work before 06:31;
reserve 06:36–06:41 for archival, task-service shutdown and delivery.

The baseline is the current uncommitted checkout, including D7, Orchestrator and
scenario locations, over HEAD recorded in the evidence inventory. No reset,
operator database migration, recording-format change or provider change is allowed.
Historical D7 timing/storage figures are context, not matched before measurements.

1. Inspect ownership, profile recording and exact-revision validation, and retain
   the baseline source snapshot and original-data inventory.
2. Select the smallest measured CPU/serialization improvement; set quantitative
   goals before changing production. Preserve every sample and canonical result.
3. Use matched short probes, affected regression/recovery tests, required static
   and contract checks, actual foreground UI and one complete browser suite.
4. Obtain a fresh independent critic's source, method and actual UI review.
5. Document separate functional, recovery, storage and display decisions. Retain
   raw evidence in a SHA-256-verified external archive and stop owned services.

## Acceptance matrix at entry

| Gate | Current-pass status |
| --- | --- |
| Functional and recovery | Historical D7 pass; rerun affected and complete browser checks |
| Recording efficiency | Profile and attribute retained bytes versus allocation/WAL; no assumed gain |
| Validation | Profile cold/repeated exact-revision review; quantitative goal pending baseline |
| Display pacing | Open; historical averages/tails do not establish sustained 60 FPS |
| Configured Video | Open; historical cap hit at request 4,001/4,000 is not proof of a defect |
| Ten-minute 20v20 stability | Historical only unless a justified new soak fits the timebox |
| Independent review | Pending; score cannot override missing gates |

No provider requests are allocated initially. Configured Video is attempted only
after the selected improvement and verification have time to complete, within the
existing 4,000-request cap and an explicitly shared total budget. No cap resets.

## Selected target and goals (before production edits)

Current-baseline default 40-unit/120-action review: cold **4,759.946 ms**;
three repeated samples **4,650.239 / 4,785.487 / 5,014.937 ms**, median
**4,785.487 ms**. Separate cProfile: 17.215 s instrumented review, 17.209 s
in nominal simulation and 8.064 s in recursive copying. These profiled times
are not comparable to uninstrumented latency.

Target: remove demonstrated repeated movement-copy work and unnecessary
restricted-boundary coordinate work while retaining the same tick-by-tick rules.
No validation-result cache or persistence representation change is planned.

- At least **30%** lower repeated backend review median for default 40/120.
- At least **25%** lower cold backend and foreground visible-review latency.
- Exact deterministic review/plan content, including ordering and completion
  samples; unchanged retained samples/events, durable transactions and hashes.
- No >10% median regression in matched short durable 10v10/20v20 tick probes.
- Recording bytes reported per committed frame and entity-simulation second;
  storage-size acceptance stays open if retained bytes are unchanged.

Display acceptance, if measured: uncontended 12-second compositor windows,
mean at least 60 FPS, p95 <=16.9 ms, p99 <=33.4 ms, no >50 ms stall; 100 FPS
is a stretch average only. These bounded windows cannot certify a ten-minute
soak or all providers. Thresholds are set before before/after display comparison.
