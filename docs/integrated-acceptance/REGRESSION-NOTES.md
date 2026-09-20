# Regression gate corrections

## Version-specific Intercept

See [the exact expectation matrix](VERSION-MATRIX.md). The two original failures were reproduced before editing, corrected to explicit v2 semantics, and passed both the focused run and the first complete D7 browser run. Dedicated backend v1 tests, legacy readers, contracts and hash guards remain unchanged.

## Derived Cesium pitch readback

The first complete browser run finished **116/117**. Its only failure was `boundaries.spec.ts`'s final independent-camera equality: pitch `34.959491458575336` versus `34.959491458575286`; every other field was exact. This repeats the earlier recorded Orchestrator flake and is retained as failed evidence.

Inspection of pinned `@cesium/engine/Source/Scene/Camera.js`1025–1042 establishes that the SDK's `pitch` getter temporarily transforms ENU/world camera vectors even for a read. `CesiumAdapter.camera()` derives degrees from that getter. Bit equality of this derived value is therefore not the correct camera-ownership assertion.

The test retains exact center, span, heading, projection and focus height. Only pitch readback permits64 machine-epsilon units scaled to its magnitude: about5e-13° at35°, under0.1nm over the6km footprint. Missing/nonfinite values still fail. Existing independent-pane/bookmark tests remain. There is no production rounding, camera repositioning, retry, skipped test or enlarged timeout. The independent critic separately confirmed the SDK path and the bounded correction.

The next complete run reproduced the same defect in another boundary assertion: `34.973070166102296` versus `34.97307016610232`, with all other fields exact. The shared `cameraAssertions.ts` now applies the same pitch-only check to the Cesium readbacks in boundaries, live D3A drawing and RTS camera independence. Tactical cameras remain entirely bit-exact. The two failed complete runs remain evidence; the final full rerun is a separate gate.

## Streaming readiness and validation

The foreground workspace runner previously waited for MapLibre's `loaded()`-based probe to become true during continuous40-unit `setData` updates. That is an engine-idle predicate, not a dependable streaming-readiness boundary. It now requires the actual mission, active renderer, applied frame, all40 distinct rendered entity IDs and subsequent sequence advancement. Hidden schedule suspension, zero extra sockets across eight reopen cycles and renderer ownership assertions remain and passed.

The performance fixture loader now waits for the completed validation body before inspecting the exact Ready heading. The first recovery attempt reached Ready in its failure screenshot, after the default assertion window under other functional test load. Foreground recovery reran successfully. A duplicate inline loader in `measure.mjs` still had the earlier click-then-assert race, reproduced in two retained configured setup failures with zero provider requests. Both paths now call `validateSavedScenario`: assert `canRun`, match the definition/revision/hash to the accepted save receipt's `result`, then assert the exact visible review heading. The existing assertion budget is unchanged; no arbitrary sleep or blanket retry was added. The critic caught an intermediate receipt/result shape error before the shared path was exercised. The corrected configured run passed, recording5.461s to the full body and5.507s to the review. That real initial validation cost remains a limitation, not steady-state FPS. Measurements run separately from test/build load.

## Fault-runner lifecycle synchronization

The final probe rerun caught a verification race: its immediate read after clicking Pause captured tick13 while the Pause command was still pending; the committed paused world was tick14. `operatorUI.action` performs menu input and does not promise command completion. The fault runner now waits for the exact accepted Pause/Resume/End receipt before reading authoritative state, explicitly asserts that state and retains the full31.5-second equality/lease checks. It records before/after tick, effective time and lease revision. The failed run remains in the archive. No production timing or outcome changed.

## Ended recording guidance

The independent critic reproduced Fleet's misleading “Waiting for available control” and “Acquire or reclaim control first” advice after reopening an ended recording. Both controls were disabled, so this was a status-explanation defect, not an authority bypass. `directMovement.ts` and `scriptControl.ts` now identify the terminal frame before offering lease advice: “Demo ended. Recorded inspection is read-only.” Two regression cases cover absent and nominally held control and continue to refuse movement, selected script control and behavior capture. Running/paused admission and backend authority are unchanged. A fresh critic reviews the corrected source and actual recorded UI.
