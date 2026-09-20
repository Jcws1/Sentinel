# Shared provider budget

Total Milestone 1 cap: **4,000 external HTTP(S) request attempts**, including
implementer, critic, failed runs and retries. Existing credentials/providers only.
No persistent cache, bulk download, cap reset or increase is authorized.

| Allocation | Request limit | Time limit | Status / consumption |
| --- | ---: | ---: | --- |
| Baseline/current grid, all three critic rounds | 0 | Each probe finite | Zero provider requests |
| Final configured Video-only, moving 20v20 | 3,500 through dispatch gate | 180 s total, finite loading plus 30 s compositor window | Stopped at cap; 3,516 observed attempts, 3,500 passed dispatch gate |
| Remaining total-pass allowance | 484 attempts | No further run scheduled | Unused; no cap reset or retry |

The previous D7 capture visibly loaded Google content but spent its request
budget before completing. Its loading/streaming evidence does not prove a
renderer defect. This run opens one Video viewer directly, retains normal image
quality, overlays and attribution, and avoids ordinary-3D provider loading before
the measurement. Readiness means visible resident provider tiles, not indefinitely
waiting for a moving camera's request queue to empty. It separately checks hidden
render suspension and viewer reuse.

Source inspection shows the existing retention policy requires tilesLoaded and
no pending resource recovery. Hiding a still-streaming viewer therefore evicts
it; a loaded retainable viewer should be reused. The probe records both cases,
including disposed/created counts and requests on reopening. It does not weaken
that policy or call a cold recreation a successful warm-reuse check. Video-only
uses the normal auxiliary stack so Details is a real sibling tab for suspension.

The harness intercepts requests before dispatch through CDP, explicitly retains
normal HTTP caching, stops at the per-run cap or wall-time limit and records
attempts/dispatched requests plus repeated hashed origin/path identities. It
never records provider credentials or raw query strings. Interception overhead
is unquantified; path repetition alone does not establish unwanted downloads or
cache misses. Browser cache-served attempts are counted conservatively.

This is a bounded final configuration verification, **not a matched configured
before/after comparison**. The corrected grid harness provides matched pane
comparisons separately. If the allocation cannot complete Video, retain the gap
and provide a concrete additional-budget proposal; do not automatically spend the
reserve retrying the same incomplete capture.

## Final bounded attempt

Actual-desktop Edge window 65541194 visibly displayed Google photorealistic city
content, moving simulated-unit labels and Cesium ion / Google Maps attribution.
The screenshot `20v20-video-provider-ready.png` is retained. This was the normal
338×177-pixel docked Video canvas within a 1440×900 viewport, not a fullscreen renderer.
All forty scenario tracks were active. The application quality and camera-follow
rules were unchanged; the normal view control looked north to include neighboring
moving units.

Finite resident-content readiness took 40.4 ms after the fixed 12,000 ms Video
warmup, with 1,834 attempts already counted. It is not a cold-load duration.
There were 210 visible tiles, 335,039,063 resident bytes, resolution scale 1 and
the unchanged photorealistic detail-error setting 6. The queue did not have to become
idle. The cap then closed the page during the intended 30-second capture:
**no complete compositor window was retained**, and configured hidden/reopen
checks were not reached. Exit 1 and the page-closed failure are the expected
budget-stop outcome, not proof of an application crash. Task cleanup succeeded.

Accounting: 3,516 observed external attempts; 3,500 passed the before-dispatch
gate; the remaining concurrent attempts were blocked as the page closed. Of
3,462 response observations, 2,755 were served from browser cache, zero were
304 responses, and encoded transfer totaled 44,826,774 bytes. There were 710
unique hashed origin/path identities and 2,790 repeated-path dispatches.
Loading accounts for 1,793 request events and the attempted measurement phase
1,723, including 41 between the phase-label change and readiness; that phase count
is not a steady-window-only count. These are browser/CDP counts, **not provider billing counts**. Cache hits
still consume the conservative attempt budget. Path repetition does not mean
repeated network downloads; query identity is deliberately omitted to protect
credentials. The results therefore do not establish cache churn or repeated
viewer recreation as the cause of the request rate.

The separate credential-free Video-only probe verifies hidden rendering stops
and a retainable viewer is reused (one created, zero disposed, unchanged counts
after reopening). It cannot close the configured-content retention gate.

**Acceptance remains open.** A concrete proposal requiring separate provider
approval is one further fresh-context run with at most 8,000 total request
attempts, 180 seconds overall, finite loading and one 30-second docked capture,
then one hide/reopen check. Preserve normal browser caching, quality, providers,
credentials and attribution; allocate no critic requests or automatic retries.
The higher ceiling would accommodate the observed conservative cache-hit count,
but does not guarantee completion. This proposal is not executed or authorized
by this report; the current pass stops at 3,516 of its 4,000-attempt ceiling.
