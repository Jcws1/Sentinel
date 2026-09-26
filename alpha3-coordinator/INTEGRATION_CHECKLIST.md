# Alpha.3 Increment 1 integration checklist

## Required before acceptance

1. Copy this crate into the existing Rust workspace without changing Alpha.2.
2. Add it as a workspace member and run the existing repository checks.
3. Run `cargo fmt --check`.
4. Run `cargo test -p sentinel-alpha3-coordinator`.
5. Run `cargo clippy -p sentinel-alpha3-coordinator --all-targets -- -D warnings`.
6. Resolve compiler or lint failures without weakening the tests.
7. Add repository-native serialization at the boundary, not inside the coordination core.
8. Connect observations read-only; do not connect provider execution.

## Tests to add next

- One stable group becomes two persistent groups and emits exactly one split event.
- Two persistent groups converge and emit exactly one merge event.
- A transient bridge track cannot join two otherwise separate groups.
- Track-ID reassignment preserves group continuity when an association is supplied.
- Temporary dropout preserves identity; expiry dissolves exactly once.
- A mission-epoch reset clears histories, edges and group identities.
- A stale group revision cannot produce a task proposal.

## Integration boundary

The coordinator output may feed a threat-group assessment. It must not directly
invoke an interceptor provider. The existing Rust authority boundary must still
validate mission epoch, track/group revisions, freshness, friendly availability,
feasibility, duplicate assignment and operator confirmation.

## Known Increment 1 limitations

- Split/merge handling is an initial state-machine skeleton, not yet benchmark-qualified.
- Connected components remain vulnerable to a bridge track.
- Pair thresholds and weights are uncalibrated development defaults.
- There is no Parquet replay adapter or Frozen-v1 score yet.
- There are no per-stage latency measurements yet.
