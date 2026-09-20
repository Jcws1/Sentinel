# Independent critic review, round 1

20 September 2026. Fresh reviewer; I did not implement the production changes.
This report covers the candidate inventoried below, not a later correction.
**Do not accept Milestone 1 yet.** The storage and Details changes have useful
independent evidence, but cold active validation still creates a material source
gap, one of my two compositor captures misses the declared stall criterion, and
the complete final acceptance matrix is not yet available.

## Reviewed identity and method

Starting HEAD: `6c60de5eb40e1e6dd2ba16e4753c90e71adda4d6`, plus the current
uncommitted implementation. I inspected the production diff and adjacent
recording, authority, scenario-contract, scheduling, profile, presentation,
silhouette and Cesium-picking paths. I did not edit production code.

My 198-file application/static-asset inventory is
`test-results/d7-details-closure/critic/source-reviewed.json`, SHA-256
`ad7062cdc6764028837bbe5e7c66b12bbf406088ba3d5d379e76945fa6327568`.
That inventory freezes the candidate to which this review applies. A material
correction needs fresh independent review, as requested by the user.

The implementation author reserved an exclusive runtime window. I ran focused
checks and the two recording probes sequentially, then foreground UI work; there
were no competing task builds, tests or benchmarks. The browser was headed Edge
153.0.4234.48, launched outside the sandbox into the actual desktop, with fresh
contexts and task-owned databases on ports 5441/8241. Browser viewport was
1440×900 CSS pixels, reported DPR approximately 1; 760/820/900 layouts were CSS
emulations. Reported machine configuration is i7-10700K, RTX 3060, physical
2560×1440 at 144 Hz. I did not independently remeasure physical display settings.

Native `sky.list_windows` independently enumerated each uniquely titled reviewer
Edge window. Native accessibility failed once with “foreground window did not
report a process id”; a later request returned no accessibility tree. I retained
these limitations and used browser screenshots for visual inspection. These are
actual-desktop launches corroborated by native enumeration, not isolated-desktop
DOM-focus claims. I did not obtain an independent native screenshot.

All non-local requests were blocked. **Provider requests and attempted external
requests: 0.** This review does not verify configured Google content.

## Severity-ranked findings

### Critical

None demonstrated in the reviewed candidate.

### High — H1: cold active review still delays source publication

Relevant paths: `backend/app/scenarios/analysis.py:48–59`,
`backend/app/scenarios/service.py:44–49`; the real-time source loop remains in
`backend/app/main.py`. The worker-gating regression at
`backend/tests/test_scenario_analysis.py:133` establishes logical independence
while a test worker waits; it does not establish responsiveness during real CPU
analysis.

Reproduction: start the supported Sydney 40-unit/80-action revision, verify all
40 source tracks move, save a fresh immutable revision, wait 700 ms after Save,
then POST that previously unreviewed exact reference to `/api/scenarios/validate`.
Capture live WebSocket arrivals from 600 ms before the request until 800 ms after
its complete response. The Save itself is outside this measured interval.

I reproduced the following twice, against the current backend:

| Attempt | Cold request | Longest arrival gap | Consecutive server recorded-at gap |
| --- | ---: | ---: | ---: |
| `critic-final-ui-b`, original fixture | 2,391.5 ms | **2,288.2 ms** | **1,625 ms** |
| `critic-final-ui-c`, two supported hornet substitutions | 2,426.5 ms | **2,363.8 ms** | **1,516 ms** |

In B, sequence 256 was recorded at `08:21:03.674Z` and sequence 257 at
`08:21:05.299Z`. Their browser arrivals were only 11.1 ms apart after the stall.
This shows both source timing and delivery behavior; it is not solely a slow
review-panel render. The response correctly refused admission with
`ACTIVE_RUN_EXISTS`, identified the exact new revision, and left the running
revision frozen. Correctness is preserved, but the **750 ms** maximum-gap goal
is not met.

Impact: a user reviewing another saved plan can still stall a live operational
picture for multiple seconds. Moving work to a thread is not sufficient evidence
that the CPU workload no longer interferes with publication.

Correction: profile actual nominal computation together with event-loop wakeups,
durable ticks and publication, distinguish GIL contention from remaining
synchronous request work, and correct the demonstrated cause. Preserve complete
validation and fresh admission. Repeat this exact cold-active workload; do not
substitute cache-hit timing or the gated-worker test. A material fix requires a
fresh reviewer.

Raw evidence: `frontend/test-results/d7-details-closure/critic-final-ui-b/` and
`critic-final-ui-c/`, especially `result.json`, `progress.json` and the retained
runner variants in the sibling `critic/` directory.

### Medium — M1: the strict display gate remains open

The declared criterion includes no compositor interval over 50 ms. My first
30-second Tactical capture passes that bounded criterion, while the second has
one **55.561 ms** interval. Both average about 114 FPS. The second result must not
be hidden by quoting the first or the average.

Relevant evidence: the two `compositor-events.json` files and `result.json`
captures above; threshold declaration is in `PLAN.md`. Reproduce with the stated
moving Sydney workload and actual foreground browser. Inspect long intervals
against source arrivals, frontend work and renderer traces before assigning an
application root cause. Complete the required pane/provider matrix under the
existing shared budget. Do not lower the criterion or disable features.

This is an acceptance finding, not proof that the Details image or codec caused
the stall. No renderer production code was changed in the reviewed inventory.

### Medium — M2: historical 5v0 cause and complete final suite are unresolved

`frontend/tests/browser/d4-refinement.spec.ts:71–117` still uses a real canvas
ground pick and retains the acceptance assertion. The added camera/request/
receipt attachment is useful evidence and does not weaken that check. I inspected
the current camera restore and surface-picking paths; I have no evidence to name
a root cause for the historical out-of-area receipt.

The author supplied two passing untouched-baseline reproductions. Those do not
diagnose or correct the old failure. Preserve its original evidence and clearly
state that attribution remains open unless new evidence establishes it. A
complete final browser suite and its entire machine-readable result remain a
release gate; passing focused cases cannot replace it. I did not independently
repeat the 5v0 browser case in this review window.

### Low — L1: checkpoint transaction precondition is caller-owned

`backend/app/recording/sqlite_repository.py:152–158,269–272` upgrades the marker
while encoding a checkpoint. Production callers currently own the encompassing
transaction, so I found no production atomicity defect. The low-level method
itself accepts an autocommit call; a future standalone caller could advance the
marker before a failed insert. The author has documented this precondition in
`COMPATIBILITY.md`. Retain that contract in future callers; no late production
change is required solely for this low-risk note.

## Personally verified results

### Persistence and exactness

I ran the focused backend group covering `test_storage_codec.py`,
`test_scenario_analysis.py`, `test_recording_equivalence.py` and
`test_demo_profile.py`: **39 passed in 15.94 s**, two existing dependency
deprecation warnings. XML and full log are retained under
`test-results/d7-details-closure/critic/`.

Source inspection and these tests support the following:

- Compression is an optional internal envelope with explicit schema-5 gating;
  canonical public JSON and world/checkpoint versions are not repurposed.
- Decoding verifies bounded input/output length, a single complete stream,
  SHA-256 and strict UTF-8 before the existing strict world readers. Unsupported,
  truncated, concatenated, oversized and corrupt envelopes fail explicitly.
- Production commits retain FULL synchronous durability and the existing
  frame/event/checkpoint/receipt transaction before publication. Rollback tests
  include the version marker; killed-process tests cover a first transaction and
  updates of already committed data.
- Historical TEXT and mixed TEXT/BLOB histories remain readable without
  rewriting old rows. Deterministic golden tests retain exact frame, event,
  checkpoint, revision and receipt hashes across the supplied lifecycle workload.
- I found no change to recording cadence, authoritative sample count, retained
  history, timestamps, retry identity or simulation rules.

My own uncontended recording comparison used the preserved current-baseline
snapshot and final candidate, the identical Sydney 40-unit/80-action fixture,
100 durable ticks / 20 simulated seconds, one renewal, then End and normal close.
One baseline→final ordered pair is corroboration; it does not explain the entire
historical timing distribution or establish long-duration stability.

| Measurement | Baseline | Candidate |
| --- | ---: | ---: |
| Newly committed measured frames | 101 | 101 |
| Logical measured frame payload | 19,703,512 B | 19,703,512 B |
| Stored measured frame payload | 19,703,512 B | 1,461,591 B |
| Logical bytes / new frame | 195,084.28 | 195,084.28 |
| Stored bytes / new frame | 195,084.28 | 14,471.20 |
| Stored bytes / entity / simulated second | 24,629.39 | 1,826.99 |
| Durable tick median / p95 | 74.421 / 114.431 ms | 60.916 / 95.905 ms |
| Measured loop wall time | 8.365 s | 7.097 s |
| Closed DB allocation, 105 total frames | 21,032,960 B | 2,134,016 B |
| Closed DB allocation / total frame | 200,313.90 B | 20,323.96 B |
| WAL / SHM after normal close | 0 / 0 B | 0 / 0 B |

Stored measured frame bytes fall **92.58%**; closed database allocation falls
**89.85%** at the same lifecycle stage. This is not merely WAL redistribution.
Logical bytes are identical. I did not measure cumulative device write volume,
write amplification or allocations by SQLite object, and make no claim about
those quantities. Raw probe reports retain page/freelist/component information.
Both disposable databases were deleted after closure.

Raw probes: `test-results/performance-closure/critic-m1-recording-before/` and
`critic-m1-recording-after/`. I used the reusable probe independently; I did not
adopt the implementer's measured samples as my own.

### Review, UI and recovery

On the original Sydney fixture (B), one cold keyboard-input-to-review-DOM sample
was **2,386.1 ms**; three repeated requests were **202.4, 196.5 and 190.2 ms**.
The repeated median is **196.5 ms**. Repeated request headers arrived about
9.7–13.8 ms after browser request start; body completion remained about 99–101 ms,
and subsequent UI work remained visible in the end-to-end timings. Two rAFs are
only a paint-opportunity proxy, not compositor presentation proof. These are
cold/warm observations on the candidate, not an independent matched frontend
before/after comparison.

The final successful UI-only attempt D used supported Sydney geometry and the
same 40 actors/80 actions, with Friendly 02 and Hostile 01 explicitly assigned
the supported hornet profile to exercise image mapping. Both native enumeration
and browser screenshots were retained. I personally verified:

- Exact saved-revision review through keyboard input; dirty Validate is disabled.
  A committed Save response was lost deliberately. Reload retained the exact
  pending request; replay used the same body/identity and created revision 2 once.
- All forty authoritative positions changed after Run. Frozen geometry and
  running revision identity were preserved.
- Supplied STING and quadcopter images render against black with matching small
  silhouettes, type/name and affiliation. Friendly and hostile hornet share the
  same asset. Unsupported Lancet shows an honest fallback. Pin retains STING
  while following Details changes selection. 760/820/900 layouts retain readable
  image, identity and telemetry with no Details horizontal overflow.
- An intentionally aborted quadcopter asset request shows “Reference image
  unavailable”; changing to STING still works and image-well height is unchanged.
- Pause freezes positions. A committed Stop response was lost; reload retains
  its exact request, retry produces one matching event, and pending state clears.
  Resume and End succeed. Reload/Previous demos opens populated, read-only
  recorded Details with the STING photo and truthful ended-control explanation.

Attempt D command menu-action-to-receipt samples: Pause **406.6 ms**, Resume
**289.7 ms**, End **313.4 ms**. Browser request start→response-end was approximately
110.4/70.9/105.8 ms respectively. This does not reproduce the historical 5.22 s
Resume sample or explain its cause; do not silently discard that old outlier.

I hash-compared the copied static assets against both supplied PNGs: they match
byte-for-byte. CSS uses `object-fit: contain`; visual inspection shows no added
airframe cropping. Existing edge clipping in the originals is preserved. The
layout follows the requested image/identity/telemetry hierarchy without adding
unsupported controls or implying a live camera image.

Own screenshots are in
`frontend/test-results/d7-details-closure/critic-final-ui-d/`: `04-sting-detail`,
`05-quadcopter-detail`, `05b-friendly-quadcopter`, `06-pinned-sting`,
`07-unsupported`, `08-layout-760/820/900`, `09-after-image-failure` and
`11-recorded-read-only` (PNG). I inspected the desktop/narrow imagery rather than
merely checking file existence.

### Compositor observations

Each trace uses `Display::FrameDisplayed` events bounded by CDP timestamps,
not rAF averages. Both have 3,416 presentations / 3,415 intervals across the
approximately 30-second window with Tactical grid and Orchestrator visible,
normal overlays and all forty actors still moving at the end.

| Attempt | Mean FPS | Median | p95 | p99 | Maximum | >50 ms | Estimated missed 144 Hz slots |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| B, original Sydney fixture | 113.84 | 6.951 ms | 13.936 ms | 20.857 ms | 48.671 ms | 0 | 972 |
| C, two explicit hornet substitutions | 113.79 | 6.951 ms | 13.941 ms | 20.852 ms | 55.561 ms | 1 | 989 |

These are different profile assignments, so they are two representative captures,
not a matched A/B optimization comparison. Missed-slot counts are estimates
derived from physical 144 Hz, not evidence of exact display-driver drops.
Source-age summaries in these probes cover the capture plus trace collection
because the arrival filter has no end bound; I therefore do not present them as
strictly window-matched source-age percentiles. The active-review gap evidence
is separately bounded as described in H1.

I did not independently test ordinary 3D, configured Video, the complete pane
matrix or the ten-minute resource soak. One short passing trace cannot substitute
for those gates, and C already misses the declared no-long-stall criterion.

## Supplied evidence and limits

The author reports complete backend 437/frontend 411 passes, required static,
contract and 43 frozen guards, and the baseline ten-minute moving soak. These are
supplied results, not my independent full-suite runs. I reviewed the described
methodology and relevant source but have not adopted final acceptance while the
final browser suite, final matched soak, provider matrix and H1 correction remain
pending. The later delivered report must resolve or explicitly leave each open.

I did not independently operate every Patrol, v2 Intercept, NON-OP, Suggestions,
WebSocket-gap or legacy-v1 UI case; their complete regression evidence must come
from the required final gates. No self-review is presented as independent review.

Failed critic attempts are retained: A stopped at the native-tool confirmation
checkpoint; B correctly displayed Lancet fallback where my initial probe wrongly
expected a quadcopter; C reached all photo/pin/narrow assertions but assumed reload
would display the active mission automatically. D corrects those probe assumptions
with supported explicit profiles and “Return to active demo”, without changing
application assertions, production behavior or timeout budgets. D passed, exit 0.
No blanket test retries were introduced.

## Scores and acceptance recommendation

| Category | Score / 10 | Reason |
| --- | ---: | --- |
| Backend/persistence correctness | 9.2 | Defensive bounded codec, retained authority and transaction boundary; focused recovery checks pass |
| Frontend correctness | 9.1 | Existing ownership retained; independent Details and pending-request workflows pass |
| Compatibility/recovery | 9.1 | Exact-content and historical-reader coverage plus personally verified Save/Stop replay and recorded inspection |
| Performance/resource efficiency | 7.0 | Strong measured storage gain and warm review speed, but cold publication stall and strict display miss remain |
| Details visual fidelity/usability | 9.2 | Supplied assets, truthful identity, black framing, silhouette hierarchy and usable narrow layouts |
| Maintainability | 8.8 | Small localized implementation with explicit versions/bounds; concurrency performance needs correction and complete evidence |
| **Overall** | **8.6** | **Partial milestone; do not grant overall acceptance** |

Functional and recovery acceptance remain conditional on the final complete
suite and source identity. The narrow storage-efficiency result is supported by
my matched probe, subject to required final long-run evidence. Details refinement
is supported by my independent UI checks. Publication responsiveness and overall
display performance are **withheld**. Scores do not waive missing gates.

All reviewer contexts and task services were stopped. All four UI cleanup
receipts report `servicesStopped=true`, `cleanupOk=true` and database deletion;
ports 5441/8241 were independently checked free after D. The two recording probe
databases were also removed. Raw outputs, failures, screenshots, the independent
runner variants and source inventory remain for the author's SHA-256 archive.
I did not access operator databases, alter credentials/preferences, commit or push.
