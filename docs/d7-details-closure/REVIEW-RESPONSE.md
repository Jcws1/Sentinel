# Response to independent review

Round 1's [unaltered report](critic-round-1.md) scored the candidate 8.6/10 and
withheld acceptance. Its high finding was valid: moving nominal analysis to a
CPU thread still delayed durable live publication by more than two seconds.

## H1: corrected and independently reproduced

The implementation author reproduced the contention without a browser. A durable
tick occupied 2,099 ms wall time with only 31 ms main-thread CPU during concurrent
analysis. The replacement drives the same complete nominal plan cooperatively,
yielding between complete nominal ticks after approximately 2 ms of CPU work.
It changes neither live simulation timing nor validation completeness. The cache
remains bounded and exact-revision keyed; fresh admission is computed afterward.

Focused regressions verify exact nominal/golden results, real loop progress,
coalescing and cancellation without partial cached results. The author's final
foreground cold-active reviews have maximum arrival gaps of 287.2 ms default and
272.1 ms Sydney, with truthful complete responses taking 4.45/4.36 seconds. A
fresh independent round-2 agent reviewed the corrected source and measured
265.8/280.7 ms maximum arrival gaps for two genuinely cold active reviews. The
complete responses took 4.32/5.22 seconds; no incomplete result appeared early.
Its own source, measurements and limits are in [round 2](critic-round-2.md).

## M1: strict display acceptance remains open

The 55.561 ms critic stall is retained alongside its passing first capture. The
predeclared no->50 ms criterion is unchanged. Matched complete pane measurements,
final ten-minute soak and bounded configured Video checks are still required.
No renderer feature, entity count, update cadence or visual quality was reduced.

## M2: historical 5v0 attribution remains open

Two untouched-source reproductions passed. There is insufficient evidence to
assign the historical refused destination to application picking, projection,
fixture setup or a test defect. No speculative change to those paths was made.
The real ground click and strict accepted-receipt assertion remain; diagnostics
now retain the camera, surface, request and refusal if it recurs. The complete
final suite is required regardless of those focused passes. A final suite pass
can establish a current regression gate, not retrospectively explain the old
failure.

## L1: retain caller-owned checkpoint transaction contract

Both production callers enclose checkpoint encoding and version advancement in
the required transaction. The compatibility documentation explicitly states that
the low-level checkpoint method requires that caller-owned transaction. No
production atomicity defect was demonstrated, so no speculative late change was
made solely for this maintenance note.

There is no disagreement with the critic's material findings. Round-1 evidence
and unsuccessful probe attempts remain retained; later corrections do not rewrite
that assessment.

## Round 2: dropped authority reads corrected and freshly reviewed

Round 2 scores its frozen candidate 8.8/10. Its Medium refresh finding is valid:
overlapping `refresh()` calls returned without a fresh read. Two strict-fixture
regressions failed on that code before implementation, while disposal passed.
The correction uses one shared promise and one coalesced follow-up flag, with
unchanged generation/disposal guards, identities and authority checks. All 22
affected tests now pass, and all 414 frontend tests pass on the final source.

The original 5,179.6 ms Resume outlier remains. Two detailed unchanged-source UI
repeats took 387.7/399.9 ms; neither reproduced the delay. The dropped-read defect
can explain waiting for the five-second poll, but responsibility for that exact
sample is unproven. The fresh [third critic](critic-round-3.md) independently
verified a held-old-response mission switch in the actual UI. Resume remained
disabled until a fresh read, which enabled it 30.045 ms after release. Its next
Resume took 273.518 ms from helper invocation, 23 ms from click to fetch and
204.2 ms from click to the probe's decoded reply.

Round 3 also identified an overstatement in this pass's compatibility prose:
checkpoint JSON consumption is not an independent strict schema reader. The
documentation now distinguishes strict historical frame validation, envelope
integrity and the unchanged checkpoint recovery logic. No validation capability
absent from the baseline is claimed.

Round 3 scores the reviewed correction **9.1/10**, with no new Critical/High
defect. It personally passed 40 backend and 30 frontend focused tests, a moving
Sydney40 Details/recovery workflow, a 30-second Tactical compositor window and
a matched recording pair. Its weaker durable-tick improvement (73.617 to
67.123 ms, −8.82%) is retained alongside the author's stronger paired samples.
Its category scores are backend 9.3, frontend 9.2, compatibility/recovery 9.2,
performance/resource efficiency 8.7, Details 9.3 and maintainability 9.1.

The final reviewed inventory contains 198 production files; SHA-256 of that
inventory is `1f6db1a50aa45d9f16f5e7930fc6ec0389408c67f1805a8061443002d71f11cf`.
Both matched soaks, final recovery and complete 118/118 browser suite now pass;
all reviewed production hashes and original data/reference/protected-file checks
match. Configured Video remains incomplete at its cap, and the complete final
pane matrix passes only 3/10 strict windows. The critic's evidence-only addenda
agree with those limits. The score does not override failed display criteria or
grant overall acceptance. The archive/readback and cleanup audit are linked from
[EVIDENCE](EVIDENCE.md).
