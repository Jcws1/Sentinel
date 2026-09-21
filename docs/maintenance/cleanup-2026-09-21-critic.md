# Independent cleanup review — 21 September 2026

Reviewer: `/root/cleanup_critic`. I did not implement product changes, alter
tracked tests or edit another reviewer's findings. My writes are this report and
ignored review probes/evidence. The comparison baseline is the actual dirty
working tree, not clean HEAD.

**Recommendation: accept the bounded cleanup, 9.4/10 overall.** No unresolved
Critical, High or Medium cleanup defect was found. One Low task-safety concern
was corrected before removal. This accepts the two unused declarations and
reviewed archival procedure; it does not grant Phase 5, Phase 6, D7 or configured
Video acceptance. Final evidence staging, disposal and sealing are implementer
closeout steps governed by the reviewed guards.

The retained raw-evidence base is
`C:/Archive/Coding/Sentinel3-archive/2026-09-21-repository-cleanup/`.
All `test-results/...` and `frontend/test-results/...` references below resolve
under that archive base after closeout; their original relative paths are
preserved. This review remains in the active repository's `docs/maintenance/`.

## Source and archive review personally completed

- Read the complete current `backend/app/commands/unit_profiles.py`,
  `frontend/src/world/scriptPlan.ts` and `frontend/src/world/unitProfiles.ts`,
  their callers/import paths, package entry points and canonical browser
  configuration. No repository consumer uses removed `placement_speed` or
  `scriptStep`. Active backend movement still uses `entity_speed`/`profile`;
  frontend nominal movement still uses `placementSpeed(unit) * 0.2` at
  `scriptPlan.ts:269` and `:305`. Compatibility models, schemas, dependencies,
  fixtures, source authority and speed values are unchanged.
- Independently hashed the baseline inventory and all 790 source copies. Every
  copy matches inventory SHA-256
  `9e771bf42c0cd71192e74e982dd175fdf2c19c8bd7319bbc897fa30357dec3b6`.
  My final byte-level comparisons prove the two product files differ solely by
  the intended removed blocks. The only other existing source changes are the
  narrow `.gitignore` reporter pattern, current/historical links in
  `docs/README.md`, and append-only current archive entry in `docs/ARCHIVE.md`.
  I read each housekeeping diff.
- Independently checked the 37-target historical plan against the original
  inventory. All 2,542 selected files are original-inventory entries, with
  unique contained paths and literal `historical/<source>` destinations. None
  intersects the 1,297 original database, environment or protected-tree entries.
  Exactly four unchanged old `frontend/docs/**/browser-results.json` files are
  the expected baseline source removals. The configured standard `frontend/dist`
  remains in place. Current package/browser entries use the canonical tracked
  tests, not the archived task copies.
- Re-read and SHA-256 checked every archived historical file after removal:
  **2,542 files / 2,164,780,016 bytes**, all matching manifest SHA-256
  `14fb2475fe535b185ec1c4efff929a0bb114690519406a4c92bdc3b380388302`.
  All original selected targets are absent. This is a same-volume archive move;
  it does not itself reclaim that amount of disk space.
- Independently checked all **437 original database/sidecar** existence, size
  and exact nanosecond-mtime records, without opening them. All match. This is
  metadata preservation, not a byte-for-byte database claim. All **three
  environment** hashes and **857 protected-tree** hashes also match. The 627
  tested product/input/test files match manifest SHA-256
  `a7cfc973e966ba9f1c5ecd408f794bffde56420322320c9b647a7eaf56aecd70`.
- Independently hashed both production output trees: all **403 files /
  16,423,608 bytes** are byte-identical before/after. This supports no changed
  frontend output and no claimed bundle-size or performance improvement.

Evidence: `test-results/cleanup-2026-09-21/critic-archive-preflight.{py,json}`,
`critic-final-audit.{py,json,log,exit}` and the retained baseline/source copies.
The final audit exited 0 at 15:18:07 UTC. The first audit JSON is retained as
`critic-final-audit-first.json`: it returned exit 1 because my initial
product-only classification detected the new `.gitignore` housekeeping rule.
After manually reviewing that diff, I explicitly enumerated the three allowed
housekeeping paths. No preservation/hash check was relaxed.

## Independent focused checks and actual foreground UI

I executed **39 backend tests** from `test_d3a.py` and `test_d4_refinement.py`,
and **45 frontend tests** from `d3a.test.ts`, `d4.test.ts` and
`scenario-location.test.ts`; both commands exited 0. These cover completion
dependencies, stop/restart interruption, frozen historical readers, profile
speeds and pursuit, boundary rollback, script authoring/nominal geometry and
ended control refusal. The backend retained the two existing dependency
deprecation warnings. No production/test fixture was changed to make a check
pass. Backend logs are in the root task evidence; frontend logs are in its
corresponding `frontend/test-results/cleanup-2026-09-21/` directory.

I wrote and ran a separate ignored foreground probe against
**`dist-production-cleanup`**, using the unchanged repository
`foreground-browser.mjs` and `foreground-identity.mjs` helpers after reading
the computer-use instructions. A fresh task-owned Edge/default context and
new disposable database were used; all non-loopback requests were blocked and
counted. The complete successful **attempt C** exited 0 and passed five grouped
workflows:

1. Author STING and Hornet units through the Units controls, add absolute and
   completion-dependent movements through Conductor, save and validate revision
   1, and run it. The STING dependent estimate is **1.6 source seconds**; its
   committed accepted tick is **8**. Both positions advance at their declared
   **170/80 km/h** profile speeds and retain **231.125 m** supplied ellipsoid
   height. These are simulation semantics, not wall-clock pacing measurements.
2. Inspect the managed STING through Fleet and verify the matching Details
   identity, profile/reference image and telemetry without a control command.
3. Exercise Command Picture shared filtering, Profile-to-Details selection,
   selected 15-second history, captured origin and a second Profile pane.
   Inspection dispatches zero control commands.
4. Pause and verify frozen committed tracks/tick, Resume, End, reload, explicitly
   choose the recording through **Previous demos**, and inspect its audit and
   Hornet Profile/Details. Final frame/sequence remain unchanged; inspection
   dispatches zero control commands.
5. Submit the supported small external golden fixture through Simulation,
   inspect native MSL/BLUE Tracks and Details, verify no managed assets or
   interactive authority, then ABORT and reload its original recorded command.
   The committed outcome remains available; inspection dispatches zero control
   commands and does not change the frame.

I personally viewed all **12 original attempt-C screenshots** and the attempt-B
failure capture. Every C screenshot has a native foreground window/PID match
to its own Edge process, plus visible/focused DOM evidence: **12/12** samples,
PID **32088**, CSS viewport **1280x700**, DPR approximately 1, original PNG size
**2240x1225** under Windows scaling. These are sampled foreground functional
checks, not continuous focus tracking or a display-performance certificate.
Attempt C recorded **zero external/provider attempts and zero page errors**.

Evidence is `frontend/test-results/cleanup-2026-09-21/critic-ui-c/`, including
`critic-result.json`, twelve PNGs, cleanup and the exact executed probe. Probe
SHA-256: `34eebfc079ecbe74f6fd282e3bdd3d798430f55da9372d6f5fc0eacb0c95d9ed`.
No benchmark, configured provider or broad performance-phase retest was run.

Two earlier attempts remain preserved and are not counted as complete passes:

- **A:** the sandbox desktop returned foreground HWND 0. The native foreground
  assertion failed before any credited screenshot/workflow. It was rerun with
  authorized desktop access; the foreground assertion was unchanged.
- **B:** real foreground authoring/movement and live analytics passed, then my
  probe incorrectly assumed reload auto-selects an ended mission. Its screenshot
  shows the honest `No mission` / `Load a mission` state. Source/canonical tests
  establish the supported Previous demos workflow. C adds that explicit UI
  selection before the same ended-recording assertions; no application behavior,
  timeout or acceptance assertion was weakened.

## Supplied complete gates inspected independently

The implementer's complete suites are supplied executions: **562 backend** and
**486 frontend tests in 49 files**, both exit 0, plus passing type, lint, format,
contract, foundation, repository and production/test/verification builds. I read
their logs and exit records; I did not rerun those complete suites myself.

I independently traversed every actual result in the original final Playwright
JSON: **126 tests**, each expected/pass, exactly one passed result, retry 0;
zero skipped, unexpected, flaky or root errors. Runtime is **874.751223 s** and
the wrapper exited 0. JSON SHA-256:
`d3b5a00fb3f054f0ce6892510485c99cb9148bd8bc40491d140a930e4b862cc0`.
My parser and complete per-case readback are
`test-results/cleanup-2026-09-21/critic-browser-readback.{py,json}`.

## Severity-ranked findings

**Critical / High / Medium:** no new unresolved defect identified within this
cleanup. This is evidence-bounded review, not proof of every input or schedule.

**Low, corrected before removal — delete the exact archived inventory.** The
initial task-only `archive-historical.ps1` recursively deleted directories after
an earlier enumeration and full 2.16 GB hash readback. Reproduction of the guard
gap: add an unlisted file to a target directory between those stages; recursive
deletion could sweep that file without an archive entry. I recommended exact-file
deletion. The implementer corrected it before removal. I verified the current
guard at `test-results/cleanup-2026-09-21/archive-historical.ps1:87`: each exact inventoried file is immediately
rehashed before deletion, then non-recursive `Directory.Delete(path, false)`
removes empty directories and fails if new content remains. There is no evidence
that any unarchived file was actually deleted.

I also read the final evidence staging/sealing and disposable-output scripts.
They require contained non-reparse paths, archive readback, no overwrites,
database/profile exclusion, current evidence equality or archived build
inventory equality, and exact-file/empty-directory-only removal. The final
disposal lists eight task output/build roots and six historical directories
eligible only when empty. Source/report text must be frozen before staging;
later changes require their own retained inventory/readback.

## Resource closeout, scores and limits

All A/B/C browser contexts and browsers closed in `finally`; each service cleanup
reports `servicesStopped=true`, `cleanupOk=true` and database `deleted=true`.
I independently queried Windows processes/listeners at **15:17:39 UTC**: no
known owned process or descendant remains, ports **5451/8251** have no listener,
and all three task databases and WAL/SHM/journal paths are absent. Receipt:
`test-results/cleanup-2026-09-21/critic-occupancy.{ps1,json}`. The final preservation
rehash followed these closures. No operator database/browser profile, dependency,
credential, unrelated research or contract was changed by this reviewer; no
commit or push was made. Exclusive runtime ownership is released.

| Dimension | /10 | Basis |
| --- | ---: | --- |
| Cleanup safety | 9.6 | Full historical readback, protected-path exclusion, exact-file deletion correction and independent data/resource preservation. |
| Correctness | 9.5 | Exact two-declaration diff, active speed paths retained, byte-identical frontend output and direct nominal/committed movement checks. |
| Compatibility / regression | 9.4 | Own 39/45 focused passes and foreground flows, supplied complete 562/486/126 passes; no claim beyond tested inputs/configurations. |
| Maintainability | 9.3 | Conservative scope, uncertain compatibility code/dependencies retained, canonical tests preserved and restoration/provenance recorded. |
| **Overall cleanup assessment** | **9.4** | **Accept this bounded cleanup under the reviewed closeout guards.** |

I read the historical Phase 5 round-3, Phase 6 `CRITIC-9` and D7 round-3 reports.
Phase 5 mixed-scale geometry/bulk responsiveness and its withheld **8.6/10**,
Phase 6 combined-Profile pacing and withheld **8.5/10**, and D7 strict display /
configured Video limits remain open. This cleanup score neither changes those
ratings nor proves a performance improvement. The short two-unit foreground
fixture is functional coverage; larger supported workloads rely on the supplied
complete suite, and no new capacity, pacing or external-conformance claim is made.

