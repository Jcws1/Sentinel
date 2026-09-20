# Partial D7 performance closure

20 September 2026. Authorized 60-minute follow-up; start 05:41:16 UTC,
deadline 06:41:16 UTC, final five minutes reserved for cleanup. No commit or push.

Two small backend changes remove repeated copying of read-only movement geometry
and coordinate work when no restricted boundary exists. Every nominal/live tick,
boundary check where applicable, retained sample, canonical output and durability
obligation remains. No cache, storage format, migration, UI or provider change.

The default 40-unit/120-action repeated backend review improves **4,785.5→2,268.6 ms
(52.6%)**. Matched actual-desktop input-to-review DOM improves **4,992.0→2,569.0 ms
(48.5%)**; complete exact-revision content matches. Sydney40 improves less and
does not meet every 25% goal. Retained storage bytes are unchanged.

| Acceptance area | Current decision |
| --- | --- |
| Functional | **Withheld:** final complete browser suite is 116 passed / 1 failed; frontend 403, backend 404 and required static gates pass |
| Recovery | Named regression and independent Save/Stop retry, immutable revision and recorded-inspection checks pass; final delivery acceptance remains conditional on the failed browser gate |
| Validation responsiveness | Primary default 40-unit goals met; Sydney cold improvement below 25%, synchronous event-loop stall remains |
| Storage efficiency | **Withheld:** no byte reduction; short Sydney40 tick timing regression remains unexplained |
| Display performance | **Withheld:** one independent actual Tactical window passes bounded thresholds, but configured Video and full foreground matched matrix remain open |
| Overall performance closure | **Partial**, never unconditional acceptance |

The fresh [critic](CRITIC.md), **8.8/10 overall**, independently inspected source, reproduced real
foreground Sydney 40-unit behavior and measured a 12-second Tactical window. The 9/10
target was **not met**. Its score
cannot override unmet storage/display goals or the failed regression gate.

The complete browser run (14.7 minutes, no skips/retries) rejects the 5v0 test's
3D movement destination as outside the supported area. Attribution remains open;
the test and its assertion were not changed. No late rerun is substituted for a
complete-suite pass. See the exact failure in [verification](VERIFICATION.md).

See [bounded plan](PLAN.md), [diagnosis and compatibility](DIAGNOSIS.md),
[measurements and adverse results](PERFORMANCE.md), [verification](VERIFICATION.md),
and [exact source identity and evidence index](EVIDENCE.md).
Raw snapshots, profiles, screenshots, diagnostics, failed attempts and cleanup
receipts are retained in the hash-verified local archive described in
[ARCHIVE](../ARCHIVE.md). Source identity includes all uncommitted baseline work,
not only HEAD `83364f617b3e8842426b0551faa670b5cfd5995a`.

The historical D7 ten-minute soak remains historical. No additional soak,
configured-provider run, physical 4K verification or subsequent roadmap phase was
started. Current provider requests: **0**. The native capture/activation tool timed
out waiting for app approval; isolated-desktop traces are explicitly diagnostic.
Actual foreground browser evidence comes from elevated launches, native window
enumeration and browser screenshots. Operator data/preferences/credentials and
all earlier uncommitted work are preserved.
