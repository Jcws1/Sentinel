# Measured decisions

## Lossless storage and CPU work

The untouched 40-unit ten-minute baseline retained 790,434,789 bytes of frame
JSON across 3,206 frames (including setup/teardown and seeded fixture frames).
Normal close left a 795,824,128-byte database and no WAL/SHM. Per-soak and
per-frame comparisons will use the captured boundary samples, not this whole-run
total alone. Intentional full-frame history dominates; this is not evidence of a
resource leak or merely a WAL redistribution problem.

A separately timed 50-sample compression experiment used an exact baseline
252,351-byte frame and 113,773-byte checkpoint. Zlib level 1 retained 17,647 and
7,580 bytes respectively; median encode/decode costs were 0.683/0.382 ms and
0.314/0.187 ms. Level 6 saved a further ~3 KB/frame but cost 1.756 ms to encode.
Choose level 1 for an explicitly versioned, bounded internal envelope, preserving
the exact canonical UTF-8 bytes, SHA-256 and strict world readers. No content
deduplication graph, changed wire format or history/cadence reduction is needed.

Before implementation, goals are >=80% lower stored frame bytes and closed
database allocation per committed frame, identical decoded logical data, and no
>10% durable-tick median regression. The original text format remains readable;
existing rows are never rewritten. Operator databases are not opened or migrated.
SQLite's format marker must change atomically with the first encoded write, so
old binaries reject an unsupported database instead of misreading new payloads.

Short tick profiles show repeated JSON round trips dominate CPU. Restrict CPU
changes to redundant dictionary conversions and timestamp-only reads; retain
defensive Pydantic validation, all event checks, FULL durability and commit-before-
publication. Exact baseline hashes will cover every frame, journal event, receipt
and checkpoint in deterministic default/Sydney lifecycle workloads.

## Validation

Current-source Sydney40 repeated review median is 2,091.7 ms (five repeated
requests; cold 2,063.5 ms). Geometry/script nominal execution remains complete.
The API currently invokes that synchronous CPU analysis on the publication event
loop. Pure analysis can run separately from database/authority access and reuse
bounded immutable results for an exact saved revision. Fresh admission state and
checked-at time must be assembled on every request, including cache hits.

Goals before editing: >=75% lower repeated input-to-visible-review median,
repeated authoritative backend review <150 ms, no >10% cold idle-review median
regression, and no >750 ms source-publication gap during a cold active review.
Cold active-review completion may cost more CPU while sharing the machine; it
must not appear finished early. Cache keys cover revision/content plus rule and
profile inputs; no database or mutable execution state goes to the worker.

### Critic-driven correction of the initial worker design

The first CPU-thread implementation failed independent active-run measurements:
2,288.2 and 2,363.8 ms arrival gaps, with server recorded-at jumps of 1,625 and
1,516 ms. A browser-free heartbeat reproduced the problem. In one repeated
sample, an active durable tick occupied 2,099.2 ms wall time but only 31.25 ms
main-thread CPU; the idle analysis alone allowed heartbeat intervals below
47.5 ms. The competing CPU thread did not make durable execution responsive.

Replace the thread with a cooperatively driven form of the identical nominal
dry run. `nominal_steps` yields only between complete nominal ticks and returns
the full result. Existing synchronous callers exhaust it without scheduling
changes. Saved-revision review uses short batches (final target approximately
2 ms, plus an indivisible nominal tick), retaining the exact bounded cache and
fresh admission. Cancelled partial plans are discarded. There is no background
executor, altered live step, reduced analysis or changed publication contract.

An intermediate 10 ms-batch diagnostic reduced the active heartbeat maximum to
125.4 ms; ordinary durable ticks remained roughly 58–100 ms. Idle review was
2.092 s, active review 3.115 s: sharing CPU can lengthen cold review while allowing
live work to continue. Final foreground measurements and a fresh independent
critic must verify the corrected 2 ms candidate. Round 1's 8.6/10 report remains
unaltered adverse evidence, not approval of this correction.

## Details

Images map only from `unitProfiles[entityId].id`. Unreliable historical identity,
unknown and unsupported profiles get a text fallback. Existing recognition
silhouettes remain separate. The supplied images are copied unchanged to static
assets, displayed with contain framing on black, and are never recorded.

## Additional cold-validation sampling

The first final Sydney10v10 cold request was 11.9% slower than its single baseline
observation, exceeding the declared 10% bound. Before further execution, the
task runner declared five fresh-process baseline/final pairs, alternating
AB/BA/AB/BA/AB, each with one cold and one warm request on the identical twenty-unit
Sydney fixture. Use all five pair results and retain the original adverse sample
separately. This estimates cold variance; it does not authorize changing the
threshold or selecting the fastest result. No other runtime work overlaps them.

## Evidence limitations

Two untouched baseline reproductions of the historical 5v0 case passed (alone,
then all four group cases). Historical failure evidence is retained; its cause
is not established. Native desktop window enumeration corroborates actual-desktop
browsers. Later native accessibility-tree inspection hung; it is not relied on
as final display evidence. Native screenshots fail with `SetIsBorderRequired:
No such interface supported (0x80004002)`; browser screenshots remain available.

The first live-soak storage reporter used separate read queries without an
explicit snapshot. Its live table counts/byte sums may straddle a commit; do not
present their boundary deltas as exact. The reporter now holds a read transaction.
Both normal-closed database reports are coherent (the sole writer is stopped),
and those final per-frame values plus deterministic short probes are the primary
storage comparisons. Filesystem lengths remain observations outside SQLite's
logical read snapshot. No checkpoint/vacuum is used to manufacture a saving.

## Coalesced authority refresh

Round 2 measured one 5,179.6 ms Resume menu-operation-to-receipt outlier, mostly
before dispatch. Two additional instrumented unchanged-source UI attempts took
387.7 and 399.9 ms. Both briefly waited for synchronized authority. They did not
reproduce the long delay, so the original sample is not conclusively attributed.

Source inspection found a separate demonstrable defect: `refresh()` returned
immediately whenever an earlier read was pending. A mission-generation change
discarded that earlier reply but also dropped the requested replacement read,
leaving current authority unset until the five-second polling cycle. Overlapping
refresh callers after a revision change could likewise return with old status.
Before editing production, valid strict-status fixtures reproduced both cases:
two failures and twenty passes. The disposal case already passed.

The correction retains one in-flight promise and one coalesced follow-up flag.
Callers await the drained current read, while existing generation/disposal guards
reject obsolete replies. It sends no command, alters no pending identity, makes
no speculative authority claim and does not change the periodic poll interval.
The same twenty-two tests pass after correction. The two logs are retained; a
fresh third critic reviews this material frontend fix and its adjacent paths.
