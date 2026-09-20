# D7 integrated demo, compatibility and recovery acceptance

20 September 2026. **Functional and recovery gates pass. Performance acceptance remains withheld, so this is not unqualified overall acceptance.** The fresh final critic scores the scoped change **9.0/10**, with no unresolved material defect established in the reviewed paths. See [verification](VERIFICATION.md), [independent review](critic-round-2.md) and [performance limits](PERFORMANCE.md).

## Corrections

- Ended recordings now explain **“Demo ended. Recorded inspection is read-only.”** before offering ownership guidance. Two production guards changed; controls remain refused and simulation/backend authority is unchanged.
- Both obsolete Intercept browser expectations now explicitly assert `local-fleet-v2`, exact receipts/member outcomes, unique proximity assignments, ordinary movement for unassigned members, Stop and persistent NON-OP. Historical v1 tests, old contracts and hash guards remain unchanged. The [version matrix](VERSION-MATRIX.md) maps replacement coverage.
- Camera regressions retain exact Tactical and non-pitch checks. Only derived 3D pitch allows a documented machine-precision bound for Cesium readback. Both earlier failing complete runs remain evidence.
- Verification helpers wait for the complete exact-revision validation response and real stream/renderer readiness. A guarded, opt-in test server injects receipt rollback and a genuinely stalled source inside the sole task writer; normal application routes are unchanged.

## Final gates

| Gate | Result |
| --- | --- |
| Frontend | **403 tests / 41 files passed** |
| Backend | **397 passed**, two existing dependency deprecation warnings |
| Complete browser suite | **117/117 passed in one 879.058-second run**, zero skips, retries or flaky results |
| Static / contracts / frozen specifications | TypeScript, lint, format, current/generated/foundation contracts, **43 guards**, repository hygiene and bounded production/verification builds passed |
| Foreground workflow | Sydney origin, Orchestrator selection/dependency refusal, exact saved revision, 40 moving entities, Suggestions explicit Apply, maps/Video, Pause/Resume/Stop/End, recorded inspection and New demo verified |
| Recovery | Exact lost Save/Run/Apply/Stop identities, rollback, source stall, reconnect, long Pause, lease/reclaim, restart and persisted End; [matrix](RECOVERY.md) distinguishes foreground tests from isolated regression coverage |
| Bounded resources | **611.353 seconds**, all 40 positions changed at all 20 checkpoints, one WebSocket and two retained renderers; DOM/listener counts stable |
| Independent review | Fresh round 2: **9.0/10**, own 105 frontend / 127 backend checks and independent foreground Sydney 40-unit recovery workflow passed |

## Limits and evidence

Grid 20v20 short compositor windows averaged **114.71–138.02 FPS**. Configured Tactical and ordinary 3D averaged **94.53 / 138.43 FPS**. Uneven tails remain; these are not blanket sustained 60 FPS certification. Google Video loaded visible content but exceeded the bounded request budget during capture, leaving its pacing unverified. Physical 4K performance and indefinite resource stability were not established.

The ten-minute recording grew **757.65 MB**; collected heap rose **7.83 MB**. Initial validation of the 40-unit/120-action measurement scenario took **5.507 seconds** to visible review. These remain measured limits, not resolved performance claims.

[Selected screenshots and motion](EVIDENCE.md), [regression corrections](REGRESSION-NOTES.md), [review responses](REVIEW-RESPONSES.md) and the [baseline/plan](PLAN.md) retain provenance and adverse results. The hash-verified local archive is `C:/Archive/Coding/Sentinel3-archive/2026-09-20-integrated-acceptance/`; reusable tests and concise reports remain in source.

All task services stopped and their 32 database cleanup receipts were verified. Disposable builds, evidence copies and isolated zoom profiles were removed after archival verification. All 437 original database artifacts retain their original size/mtime; all 195 protected historical/contract files remain byte-identical. Of 193 baseline production files, only the two stated guards changed. No original file was removed, no operator storage was cleared, and no commit or push was made. This pass stops at D7.
