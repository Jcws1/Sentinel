# Compatibility policy and implementation decisions

The frozen external specification, schemas and fixture values are unchanged.
`contracts/simulation/compatibility-decisions.md` remains the historical Phase 0
register. Its concrete provisional policies are authorized locally by the Phase 5
request; this does not constitute organiser confirmation.

Local policy identity: `sentinel-simulation-v1-local-1`. Store it with commands,
run detail and audit. Confirmed rules and provisional cases have separate tests
and acceptance statements. No unqualified exact-conformance claim is permitted
while external questions remain unresolved.

The user explicitly approved these supplemental local policies during this task:

- C22: timestamps with seconds `60` are rejected with a validation error. Calendar
  dates and exact UTC millisecond spelling are still validated; no silent time
  normalization is performed.
- C17: zero-area polygons are rejected. Use stable translated arithmetic so a
  small valid polygon is not rejected through cancellation at a large longitude.
  Planar longitude/latitude containment remains the disclosed C17 interpretation.
- C10: HOLD/ABORT validate all supplied fields/snapshots but do not require effect
  rule coverage, because they evaluate no samples. Duplicate rules remain invalid.

Other existing policies, including lifecycle precedence/missing cells, fallback
error envelopes, numeric canonicalization, command identity scope, profile changes,
cross-command correction and last-seen health, remain explicitly provisional.

Source-only audit also identified a collision already permitted by the external
pipe-delimited interaction hash. Preserve that hash exactly, including duplicates;
internal event identity additionally includes the structured timestamp/red/blue
tuple, run and command, so no distinct interaction is discarded.

External batches own separate internal missions/runs and never borrow interactive
authority. There is no movement/streaming bridge. MSL source values remain MSL;
existing visual approximation labels are required. Calibration identity is not
aircraft identity and cannot choose a Details photograph or imply a managed asset.

Implementation decisions about journal/recovery, adapter state and UI are added
as their concrete boundaries are established and tested.
