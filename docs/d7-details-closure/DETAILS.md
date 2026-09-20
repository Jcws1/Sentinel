# Details refinement and foreground evidence

The panel now follows the reference's compact header → black image well → small
silhouette/type/name strip → status → telemetry hierarchy. Existing affiliation
colors, telemetry units, ellipsoid labels, controls, selection ownership and map
cameras remain intact. The small silhouette is separate from the static aircraft
reference image. There is no Shield AI branding or unsupported telemetry.

Both supplied PNGs are copied byte-for-byte into the static asset catalogue.
Only explicit frozen profile identity selects an image: `sting-v1` and
`hornet-10-v1`. The same profile uses the same image across permitted affiliations.
No model is inferred from a friendly/hostile label, entity name or list position.
Unknown and historical identities retain an honest fallback. The default v2 demo
does not acquire an invented profile merely to show a photograph.

The fixed image well reserves space, uses a black background and `object-fit:
contain`; async image loading and failure do not shift telemetry. The supplied
originals already have some edge clipping, and CSS adds none. `Model reference`
and accessible text identify the images as static. The obsolete Illustration
caption is removed. Images are not embedded in world frames or recordings.

Actual-desktop final-source verification (`d7-details-final-details`) and all
three independent reviewers exercised explicit STING and quadcopter identities,
both supported quadcopter affiliations, unknown identity, failure/fallback,
rapid selection, pin/follow, keyboard controls, live and ended-recording inspection.
The final session used native Edge window 30149872 and an isolated moving Sydney
forty-unit scenario. No provider requests were made.

At viewport widths 1440/900/820/760 px the image wells measured respectively
377.42×210, 300×180, 370.57×180 and 340.57×180 CSS pixels. These are responsive
layout checks on one physical display, not performance evidence for four displays.
The roomy inspector layout keeps the image beside telemetry instead of hiding it.
Docking, scrolling, closing/reopening, camera stability and focus remain covered
by the existing browser suite and the dedicated Details workflow.

Screenshots in the external SHA-256 evidence archive:

- [STING and identity/telemetry](../../../Sentinel3-archive/2026-09-20-d7-details-closure/frontend/test-results/performance/d7-details-final-details/friendly-01.png)
- [Friendly quadcopter](../../../Sentinel3-archive/2026-09-20-d7-details-closure/frontend/test-results/performance/d7-details-final-details/friendly-02.png)
- [Hostile quadcopter](../../../Sentinel3-archive/2026-09-20-d7-details-closure/frontend/test-results/performance/d7-details-final-details/hostile-01.png)
- [760 px layout](../../../Sentinel3-archive/2026-09-20-d7-details-closure/frontend/test-results/performance/d7-details-final-details/layout-760.png)
- [Ended STING recording](../../../Sentinel3-archive/2026-09-20-d7-details-closure/frontend/test-results/performance/d7-details-final-details/recorded-sting.png)
- [Unknown profile fallback](../../../Sentinel3-archive/2026-09-20-d7-details-closure/frontend/test-results/performance/d7-details-final-details/unsupported-profile.png)

See [compatibility decisions](COMPATIBILITY.md), [verification](VERIFICATION.md)
and the [independent final review](critic-round-3.md).
