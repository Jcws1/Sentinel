# Implementation responses

## Independent round 1 — 8.1/10, changes required

- **M1 accepted.** The temporary Restricted-boundary candidate check omitted the run context. It now retains `interactive`, so activation and normal occupancy/movement use identical frozen geometry. Added a regression at 80° latitude with an actor 0.494 mm from a Restricted edge, plus an allowed point beyond the unchanged 1 mm tolerance. No boundary rule or tolerance was relaxed.
- **M2 accepted.** Old run, scenario and review payloads now reject the presence of the new geometry field, including null. Backend field-presence checks distinguish explicitly supplied wire fields from absent defaults on revalidated Pydantic instances. Frontend tests cover valid old bytes and invalid null-field additions; canonical historical output remains absent-geometry.
- The author's initial before-validator implementation incorrectly treated default null fields in Pydantic revalidation as wire-supplied. A positive old-world test caught that before delivery; the correction uses `model_fields_set`. This intermediate failure and the critic's original reproducers remain in ignored evidence.

## Independent round 2 — 8.2/10 entry state, changes required

- **High legacy-review regression accepted.** After M2, `ScenarioService.review()` still explicitly constructed a legacy motion preset with `local_geometry=None`. The stricter reader correctly rejected it, preventing validation of old scenarios. The constructor now omits the keyword for absent geometry. Added a positive save/review/retry test for historical content and a negative explicit-null review test. This is an implementation defect discovered by the independent review, not a reason to weaken the strict reader.
- After correction, all 391 backend tests passed. All seven affected browser failures passed on recheck; 36 distinct existing browser cases passed across the final affected runs. The second critic independently reran its 118 focused backend cases successfully. A fresh round 3, rather than either earlier score, owns acceptance of the corrected source.

## Independent round 3 — 9.1/10, accept

- No additional actionable Critical, High, Medium or Low finding was established. The fresh critic inspected final source and adjacent paths, personally rechecked M1/M2/H1, ran 154 backend and 19 frontend cases, and completed the Gibraltar foreground UI exercise including historical Validate and real restart/recovery.
- Final scores: frontend correctness 9.2, backend correctness 9.2, spatial correctness 9.1, compatibility/reliability 9.1, maintainability 8.9; overall 9.1. Its recommendation is acceptance of this feature with no established material blocker. No claim is made about the entire codebase or earlier performance limitations.
- All 198 production files in the critic's manifest still match after final cleanup. Subsequent changes only finalize documentation and move hash-verified evidence to the user's external local archive. Earlier reports retain their original findings and scores; only evidence links were adjusted after archival.
