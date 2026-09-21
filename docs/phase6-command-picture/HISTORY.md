# Narrow history-read correction

The independent critic reproduced a slow selected-entity history read in a
non-default Sydney moving 40-unit mission after approximately 90 seconds of
recording. The profile did not finish its first history read during the unchanged
5-second UI assertion budget. The failed attempt and network diagnostics remain
in the archive. A source-effective clock lag in a screenshot was not evidence of
publication staleness: fixed simulation ticks and recording timestamps are
different time bases.

The existing reader decoded and validated each full historical world, then kept
all those worlds while choosing corrections and segmentation for one entity.
The 451-instant window contained approximately 94 MB of logical frame data.
Profiling showed substantial validation and graph-retention costs. This directly
blocked the new Profile's required retained-history workflow, so Phase 6 includes
the following narrow read-path correction:

- Stream one decoded frame at a time and retain selected tracks and entity presence.
- On unknown-byte cache misses, still validate the entire original world, including
  unrelated fields, legacy representations and compressed-envelope integrity.
- Reuse at most 1,000 selected-frame projections / 16 MiB of serialized values in
  a repository-local LRU. Exact stored-byte SHA-256 and entity identity key reuse;
  changed bytes under an unchanged frame ID cannot hit an old entry.
- Decode fresh models for every caller, with a separate cache lock. No new
  recording table, writer, cadence, durability, history limit or resolver policy.

The existing correction, gap, source, datum and discontinuity algorithm remains.
The 37 focused history/storage/cache checks pass, including legacy bytes, corruption
of unrelated fields, compressed corruption, concurrent reads, mutation isolation,
both cache limits, historical cutoffs and restart behavior.

An unprofiled in-memory 40-unit diagnostic (471 commits, 451 effective instants,
120-second requested window) measured 4,528.6 ms cold, 107.0/94.7/92.6 ms repeated,
and 5,078.6 ms uncached. All five complete response hashes matched exactly.
The cache held 451 entries and 463,910 serialized bytes. This demonstrates reuse,
not first-read elimination or physical display performance. Object/key overhead is
additional to the serialized-byte limit. Foreground re-review remains the deciding
usability/resource gate; final results are in PERFORMANCE.md and CRITIC-1.md.

The earlier profiled strict/compact diagnostic is retained separately. Profiling
overhead and different graph retention make its times unsuitable for a direct
speedup ratio against these unprofiled results. The reusable diagnostic is
`scripts/analytics_history_probe.py`; it uses an in-memory task recording.

## Second correction after actual foreground re-review

Candidate 5's repeated reads improved, but the independent moving-40 first-load
check still exceeded the unchanged five-second UI budget. That failed gate remains
failed; the cached diagnostic was insufficient to establish ordinary usability.

The follow-up records at most 1,000 SHA-256 fingerprints of the exact canonical
stored payloads that the existing writer fully validated and successfully committed
in the current process. Matching bytes can reuse that proof: the history reader
still checks the storage envelope and validates the selected projection. This
does not trust a supplied WorldFrame object or an arbitrary database row. Unknown,
modified, evicted and historical bytes still take the complete strict reader path.

Proofs install only after SQL COMMIT. Outer transactions stage a bounded deque of
fingerprints and discard it on rollback. A separate short metadata lock prevents
the writer from waiting for expensive history decoding. No proof survives restart,
and no schema, transaction, command identity or publication rule changes. Additional
tests cover proof provenance, outer rollback, unrelated-field corruption, strict
fallback and lock separation. Fresh independent review and foreground results are
required before treating this correction as accepted.

The matched second diagnostic measured 1,029.6 ms for the first selected read of
451 recently committed observations, then 84.0/91.3/82.9 ms repeated. Clearing both
proofs and projections restored the strict historical path (4,592.4 ms); uncached
streaming took 4,476.1 ms. All six complete response hashes match. This distinguishes
recent-commit reuse from the unchanged cost of unknown historical bytes. The focused
analytics/history/storage/cache group passes 53 checks; the complete backend suite
passes 555 checks. Foreground latency is still a separate gate.

## Candidate-7 independent UI recheck

The independent critic's candidate-7 foreground Sydney moving-40 review passed
the unchanged five-second readiness assertion: changing retained history from 60
to 120 seconds completed in 2,670 ms after the recording matured. Numeric history
included its window-start boundary and an independent screenshot was captured.
This closes that representative responsiveness failure; it does not change the
strict cold-historical cost or establish every workload's display performance.
