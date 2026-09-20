# Milestone 1: D7 corrections and Details refinement

**Partial performance closure.** Recording efficiency, validation responsiveness
and Details refinement are implemented and independently reviewed. Strict display
acceptance remains open; configured Video visibly loaded but exhausted its
bounded request allocation before a complete pacing capture. Phase 5 simulation
compatibility and Phase 6 Command Picture / Vertical Profile are not implemented.

## Corrections

- Repeated full frame/checkpoint JSON dominated retained recording bytes. A small
  checksummed, bounded zlib envelope preserves exact UTF-8 and canonical content,
  compresses only when smaller and marks new compressed storage version 5 in the
  existing commit transaction. Historical TEXT remains untouched/readable. The
  latest-recorded timestamp query no longer loads the complete latest frame;
  redundant model-to-canonical-JSON-to-model work is removed.
- Complete nominal scenario analysis was recomputed for repeated exact revisions
  and blocked the source loop. A bounded full-input/rule-keyed cache reuses only
  pure completed analysis; genuinely cold work yields between nominal ticks.
  Fresh admission and checked-at state are computed after complete analysis.
  The first threaded design failed real-load review and was replaced.
- An authority refresh could be dropped behind an older in-flight status read,
  leaving current control unavailable until the five-second poll. Refresh callers
  now await one in-flight read plus one coalesced current read, with the existing
  mission/disposal guards. Two demonstrated baseline failures now pass.
- Details uses the supplied STING/quadcopter photographs by explicit profile ID,
  centered on black, followed by a separate silhouette/type/name strip, status
  and existing telemetry. Unknown identities and asset failures have honest
  fixed-space fallbacks. No image bytes enter recordings or wire messages.

The original 5v0 out-of-area browser refusal and the 5.22-second historical Resume
sample remain unexplained historically. Untouched-source reproductions and later
checks are retained; no unsupported destination was made legal and no timing
claim pretends the refresh race conclusively caused the old outlier.

## Measured results

The baseline is the actual clean starting tree at
`6c60de5eb40e1e6dd2ba16e4753c90e71adda4d6`, not an older substitute implementation.

| Measurement | Baseline → final |
| --- | --- |
| Ten-minute moving 20v20 stored payload/frame | 246,548.59 → 16,767.04 B, **−93.20%** |
| Normally closed DB/frame | 248,229.61 → 18,069.78 B, **−92.72%** |
| Whole closed DB, including setup/End | 795,824,128 → 59,052,032 B; 3,206 → 3,268 frames |
| Default 40/120 repeated backend review, five samples | 2,337.7 → 7.6 ms median |
| Default 40/120 actual input→review, three warm samples | 2,694.2 → 464.6 ms median |
| Sydney 40/80 actual input→review, three warm samples | 2,165.7 → 170.0 ms median |
| Default / Sydney actual input→review, one cold each | 2,626.3→2,570.5 / 2,148.4→2,132.0 ms |
| Cold active review maximum source gap, default / Sydney | 2,472.6→281.6 / 2,212.3→257.6 ms |
| Sydney40 durable tick, two controlled pairs | 74.814→61.927 and 74.786→62.849 ms medians |
| Configured Video attempts | 3,516 of 4,000 total-pass ceiling; 3,500 passed dispatch gate; no retry |

Cold active validation takes longer while sharing CPU with live ticks, but no
longer creates the measured multi-second publication freeze. The first Sydney10
cold sample missed its +10% goal; five predeclared alternating fresh-process pairs
then showed +1.25% median. Default cold automation-helper time worsened 20.6%, and
one soak End helper sample worsened 993→2,968 ms. These adverse results are retained
alongside browser-input timing. No cumulative device-write or lifetime leak-free
claim is made. See [complete timing/storage methodology](PERFORMANCE.md) and
[compositor pacing, including failed windows](PACING.md).

## Verification and independent review

Complete backend/frontend checks report **438 backend tests and 414 frontend
tests across 42 files**, with all required static/contracts/build/repository
checks and **43 frozen guards** passing. One complete final browser suite passes
**118/118**, with zero skips, flaky results, retries or global errors and wrapper
exit 0. The entire JSON result was inspected. See [verification](VERIFICATION.md).

Functional, affected recovery, measured storage efficiency and Details UI are
accepted within the documented scope. **Display performance fails its strict
criteria, configured Video pacing is incomplete, and overall acceptance is withheld.**

Both matched ten-minute soaks keep all forty units moving at every checkpoint,
one active stream, bounded renderer counts and twenty reopenings. Actual Sydney
UI verifies manual movement, Patrol, Suggestions/stale refusal/exact Apply retry,
restart/reclaim, Intercept/NON-OP, End and recorded inspection. Separate final
faults verify rollback before publication, lost Stop, source stalls and long
Pause. Details is operated at desktop and 760/820/900 px with both supplied images.

Three fresh implementation-independent review rounds scored **8.6 → 8.8 → 9.1**.
The final review independently ran 40 backend/30 frontend checks, operated Sydney
forty-unit UI, captured its own screenshots, reproduced storage and active review,
and tested the held-old-status correction. Its category scores are backend 9.3,
frontend 9.2, compatibility/recovery 9.2, resource efficiency 8.7, Details 9.3 and
maintainability 9.1. There are no unresolved Critical/High findings in the reviewed
corrections. The score does not override the remaining performance gates.

## Delivery records

- [Acceptance matrix and exact checks](VERIFICATION.md)
- [Plan](PLAN.md), [baseline inventory](BASELINE.md), [measured decisions](DECISIONS.md)
- [Recording/cache compatibility and downgrade boundary](COMPATIBILITY.md)
- [Recovery cases and retained failures](RECOVERY.md)
- [Details design and screenshots](DETAILS.md)
- [Provider accounting and bounded additional-approval proposal](PROVIDER.md)
- [Independent final critic and addendum](critic-round-3.md), [responses/fixes](REVIEW-RESPONSE.md)
- [Source identity, external SHA-256 evidence and cleanup](EVIDENCE.md)

The final reviewed production inventory contains 198 files and has SHA-256
`1f6db1a50aa45d9f16f5e7930fc6ec0389408c67f1805a8061443002d71f11cf`.
Historical reports/frozen specifications remain unchanged. New storage cannot be
opened by an older format-4 binary; no operator database was migrated in this
task. No commit or push is made. Stop after this milestone.

Task services and browser contexts are stopped, all 21 allocated ports are free,
and disposable databases/generated outputs are cleaned up. External evidence
passed SHA-256 readback before removal; the post-cleanup preservation audit passes.
See [the completed archive and cleanup record](EVIDENCE.md). No Phase 5 or Phase 6
work was begun.
