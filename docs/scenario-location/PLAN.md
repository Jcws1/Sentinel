# Scenario-owned locations

Baseline: clean `d85fc6e` on 19 September 2026. Current geometry is fixed at 103.85 E / 1.29 N with independent ±5,000 m axis bounds. Units, destinations, boundaries, movement, nominal planning and presentation duplicate that assumption. No listeners were found on the inspected application/test ports.

1. Add `LocalGeometry` (`local-horizontal-v2`, origin, fixed 5,000 m half extent). Keep absent geometry as exact legacy v1, without inserting fields into old canonical bytes. New scenario/interactive/world representations use explicit version gates; archive package v1.13 unchanged and export v1.14. Existing JSON storage needs no new tables.
2. Thread the owning geometry explicitly through pure frontend/backend math, validation, previews and execution. Freeze it in the run and checkpoint; never change process-wide coordinates. Keep profiles, simulation time, command ordering, altitude and recovery rules unchanged.
3. Add a compact location editor, map picking, preview guide and explicit camera actions. Reject an origin change that invalidates existing content, listing affected objects. Preserve map bookmarks and keep editor guides separate from operational zones.
4. Verify legacy bytes/hashes and pending requests, numerical agreement, nearby and remote locations, actual authoring/run UI, moving 20v20, recovery, recorded inspection, layout and viewer lifecycle.
5. Obtain independent critic review of final source and actual isolated UI; address material findings with up to three fresh review rounds. Retain concise reports here, collect raw evidence in ignored test-results during verification, then hash-verify it into the user's external local archive.

Supported v2 origins: latitude between -80 and +80 degrees inclusive; the entire square must fit longitude [-180,180] without wrapping and the supported map latitude range. The existing local spherical approximation is retained around the selected latitude. It is not a geodesic/terrain-clearance model. Inclusive v2 bounds allow only 0.1 mm numerical tolerance for nine-decimal coordinate round trips; v1 math and exact checks remain unchanged.

Do not touch operator databases, credentials, drafts or browser profiles. All verification databases use task-owned names. Reuse shared public assets and bounded builds. Do not commit or push.
