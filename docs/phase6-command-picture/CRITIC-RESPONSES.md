# Responses to independent review

The critic did not implement these changes. Material corrections require the
critic's fresh execution/review against the corrected source; this response is not
an acceptance decision.

| Finding | Correction | Focused evidence |
| --- | --- | --- |
| P1: all-AGL data could match an undefined datum group | Require a defined group in current Profile points, observed history and Comparison altitude values | Component regression renders an AGL-only scene, enables history, then compares selected AGL: zero plotted samples and Unknown values |
| P2: selected telemetry did not verify its response anchor | Extract and reuse the existing full mission/entity/recording/epoch/frame/sequence/source-time/window assertion before publishing | Eight mismatched-anchor cases are rejected; existing history owner tests still pass |
| P2: historical plotted points lacked numeric inspection | Add 50-row historical pages with timestamps, distance, original native group and segment/break reason, using the same returned samples | Component regression inspects the historical timestamp and window-start reason without another read |
| Hidden document could suspend rAF before chart cleanup | Dispose synchronously on document hide; analytic owner also suspends runtime/audit subscriptions and Profile history demand using its owner document | Lifecycle regression suppresses background rAF and verifies immediate unsubscribe/dispose; actual browser background verification assigned to critic |
| Search placeholder promised normalized state search | Describe literal recorded identity/type/detail search; document that derived lifecycle labels are not normalized search fields | Existing literal wildcard/injection tests and request/event filtering retained |
| Mission observation totals could change with the selected source filter | Arbitrate mission totals across all sources, while filtered counts retain map arbitration | Regression selects an unavailable/stale source while an unfiltered current source still contributes to the mission total |
| Mature moving-40 history read stalls the required workflow | Stream fully validated selected observations and reuse an exact-byte, 1,000-entry / 16 MiB bounded read cache | 37 history/storage/cache checks; identical 451-point cold/warm/uncached responses; actual foreground re-review required; see HISTORY.md |
| History failure hides the error and suggests selecting an already-selected entity | Show the actual error and reuse explicit history retry | Component regression verifies error text and retry invocation |

The candidate-9 corrected product inventory was
`26f2a3560e786ec4e82e74b54c00159618458ee6a8304819c4312cb25e3736bf`
(`candidate-9-product.json`, to be archived with raw evidence). This covers application
source, contracts and frontend dependency declarations. Test harness/docs revisions
have separate full-source inventories. Before final delivery it must still match
the tested/reviewed application bytes or undergo further review.

Focused results after the earlier corrections: 20 frontend checks across analytics
lifecycle and existing observed-history/progress suites; 12 backend analytics
checks including actual same-time NO_EFFECT interactions, exact retry identity,
read-only behavior and invalid cursor rejection. Complete final suites supersede
these subsets as the regression gate.

Candidate 5 additionally passes 22 analytics projection/lifecycle checks and the
37 history/storage/cache checks above. The critic independently rechecks material
changes; supplied focused counts do not replace its own review or the final full
regression suites. Cold history latency remains explicitly measured, not hidden by
larger timeouts.

The critic's candidate 5 foreground rerun still failed the first-history UI gate.
Candidate 6 therefore adds bounded exact-byte proof reuse from successful fully
validated commits, with separate metadata locking and rollback exclusion. The
53-check focused backend group and full 555-check backend suite pass. Its new
first-read diagnostic is 1.03 seconds; unknown historical payloads still take the
strict path. Candidate 5 remains a failed attempt, and fresh independent execution
against candidate 6 is required.

The implementer's full-regression investigation then found Comparison silently
dropping selected identities absent from a later frame. Candidate 7 retains those
IDs in selection order with null chart values and explicit Unknown/Unavailable
numeric rows. All-missing and mixed available/missing component tests preserve
cardinality and ordering. The critic independently reviewed the correction and
the test adaptations described in [REGRESSION.md](REGRESSION.md). The backend proof
cache is unchanged from candidate 6; fresh UI/execution review targets candidate 7.

Candidate 7's non-confounded Sydney 40 Profile sample then exceeded the declared
incremental p95 budget by approximately 1.9 ms (+6.9 ms versus +5 ms allowed).
Candidate 8 bounds only ECharts motion update work, retains a final trailing sample
from the shared sampler, cancels superseded/hidden work, and avoids full chart resets
for callback-only changes. All 463 frontend tests pass, including the new cadence
and lifecycle checks. Static checks and production/test builds pass. The critic's
fresh independent measurements/review remain required; no threshold was relaxed.

The critic's candidate-8 standalone measurements found a material cadence defect:
53.114 FPS current Profile and 56.458 FPS with observed history. The strict
minimum-interval coalescer reset its phase on every paint and quantized the 144 Hz
display to approximately 48 chart updates/s. Candidate 9 queues chart paints on
accumulated 90 Hz deadlines, skips missed slots after stalls and samples the actual
owner-window clock. This is a scheduling target, not an instantaneous minimum
spacing or a guaranteed display rate. It leaves headroom for the unchanged 60 FPS
target while bounding work below the 144 Hz source clock. One queued rAF prevents
duplicate paints from multiple notifications in a frame. Source/motion/recording
ownership and map interpolation are unchanged.

Tests now require near-target cadence at 144/120/60 Hz, preserve a trailing actual-time
sample, skip missed deadlines, and reject superseded/disposed callbacks. All 466
frontend tests pass. The independent critic must verify both standalone pacing and
map overhead again; passing unit cadence does not establish physical presentation.

Candidate 9's equal-area history control exposed a further 6.870 ms p95 increment.
Candidate 10 preserves chart axes/views with explicit `replaceMerge: ['series']`
for Profile and semantic filter identity for path memoization. Removed history
and old axis extents are checked against real ECharts; an unchanged-filter render
does no chart update, while a current-frame advance trims expired points from a
still-compatible response. Full frontend 468/468 and static/build gates pass.
The candidate-10 438-file product inventory SHA-256 is
`9c5adca02a1fdb3e4e8adfe4dce89c02474f68ca23b187a496b955a92f74bc47`.
Independent remeasurement and the final complete browser repeat remain required.

Candidate 10 still failed the independent equal-area history p95 budget (+6.252 ms
against +5 ms allowed). Candidate 11 coalesces Profile-only running-live history
reads at most once per second, retaining every returned observation and exact
anchor. Map demand and paused/ended final frames stay immediate; changed identity,
hidden/dispose and late callbacks cancel safely. Read-cutoff/current-window labels
make query lag explicit. The full frontend suite passes 471/471; an initial static
failure was confined to the new test fixture's nonempty tuple annotation, corrected
and independently typechecked without changing runtime behavior. All final static
and production/test/verification builds pass. Candidate 11 product SHA-256 is
`284a08b7b67d0c1977c47f012d328c470b5457da6fd167c19a7e4eb75692bf81`.
Fresh critic review and actual equal-area measurements, then the complete matrix,
remain required; no passing score is presumed.

Candidate 11 passes independent equal-area history overhead but retains a standalone
history p95 miss, backed by separate CPU evidence of additional ECharts update/paint
work. Its full foreground UI passed 31/31 with 36 independently inspected images;
that does not close pacing. Candidate 12 raises accumulated deadlines to 120 Hz and
coalesces full Profile model replacement with partial motion painting. The real
ECharts regression verifies replacement/corrections before and after a queued motion
patch. An exact-period floating-point edge is fixed without weakening cadence tests.
Full frontend 472/472 and static/build gates pass. Its 438-file product SHA-256 is
`52cf806eee2105318837c43bbe972713e5dfc5c74892c38315815360f1320147`.
Independent focused 43/43 passes; actual foreground measurements are in progress.
The display thresholds and source/recording/map behavior remain unchanged.

After candidate 12's standalone and matched-area p95 improvements, the implementer
found a shared-range copy defect: a shorter Profile labelled a larger shared read
with its own plot duration. Candidate 13 distinguishes both durations; the clipping
behavior is unchanged and the component test verifies a 15s plot/shared 60s read.

The critic then identified a separate requirement gap: incompatible historical
points were correctly excluded, but only current-entity exclusions had visible
counts. Candidate 14 returns historical counts from the same existing traversal,
with a denominator restricted to the displayed track/source and current plot
window. Reasons are mutually exclusive: missing origin, incompatible datum/AGL,
then pre-capture time. Original breaks/points and all query/chart scheduling stay
unchanged. A mixed MSL/AGL/ellipsoid regression checks the counts before/after an
origin capture, older out-of-window exclusion and missing origin; all-AGL coverage
now requires its explicit historical exclusion count. Fresh review and final
foreground/matrix/browser evidence remain required.

Candidate 15 corrects a further implementer-found grouping collision, independently
confirmed by the critic through source review. An explicit MSL datum whose text
matched the unspecified-datum/source label could share its axis group. Named MSL
keys now use the disjoint `MSL · datum ` prefix; the exact valid collision has a
regression. No input restriction or conversion approximation is added. The critic
will independently rerun focused checks and final foreground verification on the
frozen candidate, including simultaneous 120s/15s Profile ranges and historical
exclusion accounting.

The critic's independent candidate-15 focused run passed 44/44; the final full
browser run passed 125/125 and was independently parsed in full. The first native
UI attempt failed a new moving-marker pointer probe. Its known capture sequence
and screenshots support a timing explanation, but the attempted coordinate was
not recorded, so that diagnosis remains an inference. The failed probe, screenshots,
exit and cleanup remain retained. The revised probe records coordinates/timestamps
before each direct hover/click and removes intervening native-window inspection;
assertions and timeouts are unchanged.

`critic-ui-candidate15-b` passes 33/33 with 39 screenshots personally inspected by
the critic. The actual chart tooltip/click agrees with Tactical/Details without
command dispatch. Two simultaneous 120s/15s plots correctly label a shared 120s
read; historical reason counts add to the retained denominator at narrow widths.
Stop leaves 39 other entities moving, Pause/Resume/End retain exact anchors, ended
audit and supported external MSL/zero-managed visualization pass. Zero provider
requests/page errors and task database deletion are confirmed. This closes the
final-source UI gate; quantitative matrix/large results and final review remain.

Candidate 15's complete 96-window matrix subsequently exposed 12 incremental
performance non-passes and two per-workload input non-passes. A separate independent
Sydney 40-unit control retained identical map/pane bounds, cameras, four selected
identities and overlays: static panes had p95 15.098/15.265 ms before/after; two
current Profiles 28.947 ms and two Profiles with 60s history 31.016 ms. This confirms
material chart overhead even without observed history. Separate CPU diagnostics
show substantial ECharts update work; their timings are not acceptance samples.

The critic also reproduced a substantive altitude Comparison defect with real
ECharts: a `scale: true` axis hides zero and exaggerates 180/185 m bar lengths.
Candidate 16 keeps a zero-inclusive signed axis, with real-library positive-only,
negative-only and mixed-sign regressions. Null/missing values remain absent.
Unchanged count/Comparison options now reuse their complete plotted-value signature
(identities, order, labels, values, units and metric) while the runtime projection
and source/frame labels continue advancing. Component regressions verify both
unchanged-frame visuals and invalidation for changed labels/values/filters.

The candidate-16 paint experiment uses ECharts' public dirty-rectangle option and
puts current Profile points on a separate zlevel from axes/observed history. Each
Profile retains one chart instance with two bounded canvas layers. The current
120 Hz schedule, shared interpolation, history reads and recording remain unchanged.
The crowded axis title is shortened to `Distance (km)` with overlapping ticks hidden;
the visible caption still defines radial horizontal distance. These changes require
fresh independent review and identical-layout measurements; no performance pass
is assumed. [CRITIC-4.md](CRITIC-4.md) retains the confirmed findings.

The independent candidate-16 repeat passed 49 focused checks and verified the
zero-baseline and narrow-axis corrections. Its equal-area performance repeat did
not improve: current-only p95 28.633 ms versus inert 15.087/15.395 ms; history p95
37.314 ms with 19 intervals above 50 ms. The extra zlevel/dirty-rectangle experiment
has therefore been removed. Its full results and clean disposal evidence remain.

Candidate 17 instead uses typed primitive current-point dimensions with public
ECharts `encode.itemId`, `itemName` and tooltip dimensions. Series callbacks provide
the same affiliation colour, selected size and 0.45 stale/unobserved alpha. Marker
source labels are computed at authoritative projection changes, while every motion
sample still uses the same bounded sampler and actual owner clock. Named-dimension
picking resolves the original opaque identity; recorded history keeps its existing
object format. No internal ECharts model mutation, second renderer or change to
cadence, sample retention or selection ownership is introduced.

Real-library tests exercise actual callback payloads, opaque IDs, formatted tooltip
values/units/source metadata, rendered stale alpha, correction/removal and subsequent
motion patches. Read-only library-model inspection is confined to the test. The
new path avoids `hasItemOption` per-point model construction. Native pointer and
performance verification must still establish that the change works in the app.

Candidate 17's independent 51/51 focused tests and actual marker selection passed,
but its equal-area control retained material frame-tail overhead. It also exposed
a narrow-pane tooltip defect: ECharts' two-column numeric formatter placed values
outside the confined canvas. [CRITIC-5.md](CRITIC-5.md) retains both P2 findings.

Candidate 18 uses a single-column rich-text formatter for current and historical
points, with separate distance/altitude lines, explicit units and precision matching
the numeric tables. Original backing values and opaque identities remain unchanged.
Source labels are literal rich text, timestamps get their own line, and observed
history remains distinguishable from current presentation. The additional real-data
formatter test covers signed altitude, rounding, missing values and literal braces.
Its 60 Hz chart-only scheduling policy and bounded rendered-cadence instrumentation
are described in PERFORMANCE.md. Fresh independent native verification must close
the tooltip finding and determine the performance result; neither is assumed.

The independent candidate-18 review verifies readable tooltip values at measured
260 px and 514 px pane widths and exact shared selection without commands. Its
60 Hz experiment fails: standalone rendered cadence is about 58.6/58.9 per second,
and two combined Profiles fall to about 51.2/46.6 per second. Frame tails also
remain above budget. The experiment is reverted; [CRITIC-6.md](CRITIC-6.md) preserves
the actual rendered/compositor results, unchanged budgets and clean task teardown.

Candidate 19 instead retains 120 Hz scheduling and moves current markers using
public ECharts Circle/coordinate APIs on the same canvas. Chart data/axes/history
update synchronously at authoritative boundaries; motion does not rebuild those
models. A conservative silent axis envelope contains the existing interpolation
path without adding observed samples. Exact IDs, size/alpha, current/historical
tooltip separation and original shared selection are retained. Layer identity
includes mission, stream epoch and datum; removed entries and disposal clear handlers.
The critic's pre-freeze source review found that historical tooltip state and the
default 100 ms hide delay could survive an identity boundary. Disposal now hides
all attached tooltip state and Profile sets hideDelay zero. A focused regression
checks this even when no current marker is hovered.

The independent candidate-19 native setup then found absent current tooltips at
both 260 px and 514 px. Its 56/56 focused pass and successful map/Details selection
do not close this P2 finding. Performance testing was paused. The SSR test spies on
dispatch, so it cannot certify actual browser tooltip rendering. Root diagnostics
subsequently rendered the expected tooltip in a minimal real-library browser and
in full Sydney 40-unit development and production headless contexts. Those passes
are explicitly headless diagnostics, not a replacement for the failed native
screenshots. One diagnostic failed because its resource timing buffer had already
dropped the module URL needed for read-only inspection; increasing that diagnostic
buffer recovered the intended event capture without a product change. Native
reproduction now includes actual tooltip-background canvas pixels and focus checks.
[CRITIC-7.md](CRITIC-7.md) retains the initial native result and its follow-up.

The critic's unchanged-source setup b measured an initially rendered tooltip at
both widths, then a pointer jump to the same unrelated native coordinates during
Playwright screenshot capture. Focus and visibility stayed valid; the wide tooltip
disappeared before any authoritative projection changed. Setup c used direct CDP
PNG capture with the same viewport/rendering configuration and unchanged post-capture
pixel assertion. It passed with 21,438/21,418 opaque tooltip pixels at narrow/wide
sizes, persisting across five/four authoritative frames. The critic personally read
the current/source/datum and numeric lines in initial and later images. Exact
selection, zero command writes, zero providers/errors and cleanup passed. Thus the
earlier captures demonstrate a harness-induced pointer relocation, not a product
tooltip defect. No speculative product correction was made. Failed a/b evidence
is retained; direct CDP capture is used for subsequent native pointer evidence.

A new real-browser regression then exposed a distinct product defect: after
initial hover succeeds, moving the pointer 0.25 px inside the same marker hides
its confined canvas tooltip. `browser-hover-candidate19-a` fails its second actual
pixel assertion, with the original result and context retained. The correction
uses ECharts' built-in HTML tooltip with `enterable: false`, so the overlay passes
pointer hits through even when it must overlap the marker. Graphic handlers own
hover; `triggerOn: none` also prevents the generic chart refresh listener from
hiding a tooltip on a graphic without private series metadata. No transition or
hide delay can retain a prior identity. Content is an owner-document node populated
with literal `textContent`, not interpreted source markup. ECharts still owns its
container/disposal; one chart and canvas remain.

The browser check now locates the same actual marker pixels and asserts rendered
tooltip visibility, exact source/value text, confined bounds and the unchanged
0.25 px motion, plus click-through selection, corrected-frame/resize reinspection,
removal and zero commands. DOM assertions replace canvas-background assertions
because the library tooltip now renders in DOM; the failed canvas attempt is
preserved. Unit checks cover literal malicious-looking labels and the correct
owner document. Historical lines provide bounded numeric inspection, not claimed
vertex hover targets.

The candidate-20 independent native setup passes at measured chart widths of
205 and 459 CSS pixels. The critic personally read the initial and later-time
screenshots and confirmed the original entity in map/Details. Both 0.25 px pointer
nudges pass, with `pointer-events: none` on the actual HTML tooltip. Each 34-sample
DOM monitor spans five committed frame identities, with no post-hover invisible
sample or focus failure. Commands/providers/page errors are zero, closed chart
and canvas counts are zero, and authoritative End/task cleanup pass. This closes
the reproduced within-marker hover defect; it does not close performance budgets.
The fresh independent seven-file focused check passes 57/57, exit 0. The complete
native UI and final-source performance sequence remain separate gates.

## Fresh final reviewer — search reproduction

The separate final reviewer contributed no application, regression or tracked
measurement-harness source. Its real interactive acquire/read endpoint probe
accepts opaque request identities containing quotes, backslashes and Unicode and
verifies that storage and responses preserve them. Searching the complete displayed
quoted/backslash identities returns no rows in candidate 20, while searching their
JSON-escaped forms finds them. Ordinary `ALPHA` finds both records. SQLite's `lower`
folds ASCII only: `Ω-REQUEST-ABC` and `Ω-request-abc` match the same record, while
`ω-request-abc` does not. The three in-memory apps close and all audit reads leave
SQLite `total_changes` unchanged. The earlier external-ID probe was correctly
rejected by that contract and is retained as a probe setup failure, not a defect.

The displayed-ID failure is accepted for narrow correction after the reviewer's
exclusive timing slot. The intended query-only change retains existing raw JSON
substring behavior and also matches JSON string-escaped forms of typed text,
including historical ASCII escapes. Empty/ordinary ASCII predicates stay identical.
Original identities, payload bytes, retries, timestamps, cutoffs, bounds and schema
must remain unchanged. Tests and documentation will explicitly cover ASCII-only
case folding; Unicode folding is not being invented. This paragraph records an
accepted finding and plan, not a completed correction or passed regression gate.

Candidate 22 adds only query forms: the original search plus distinct UTF-8 and
ASCII JSON string escapes. No stored value is rewritten, no row is
duplicated by the OR predicate, and empty/ordinary ASCII searches retain one
predicate. The metric dictionary now states the actual ASCII-only case-folding
boundary. Seven new real-endpoint/historical-encoding cases first reproduce four
failures on the uncorrected source, then all 19 audit cases pass with the correction.
The tests preserve exact retry results and stored receipt bytes, prove zero audit
writes, and retain literal wildcard behavior and existing raw-JSON search. Complete
regression and independent follow-up remain required before final delivery.

The fresh reviewer's candidate-21 public `useDirtyRect` experiment also fails the
unchanged equal-area budgets. Current p95/p99 increments against its initial
bracket are 7.571/14.789 ms; history increments are 13.611/22.601 ms. Final brackets
confirm the nonpass. Actual tooltip/nudge/selection checks pass and all services
and disposable data are cleaned up. The one-line option is reverted exactly;
every candidate-22 frontend product byte matches candidate 20. The failed experiment
and isolated verification bundle identity remain evidence, not a performance fix.

## Final fresh-review disposition

CRITIC-9 independently repeats the original API reproduction on candidate 22,
passes all 19 audit tests and six actual production-UI searches in an ended task
recording, and personally inspects all six screenshots. It verifies the exact
one-file product delta, every final product hash and the complete 126-case browser
result/exit. Its services, browser processes, CDP listener and task databases are
gone. The exact-identity search P2 is closed; the preceding setup failures remain
retained and separately explained in REGRESSION.md and its report.

The fresh final scores are data 9.2, frontend 9.2, compatibility/recovery 9.1,
performance/resources 6.0, maintainability 9.0 and overall **8.5, withheld**.
The material combined-Profile P2 and recorded input-budget misses remain open.
Failed bounded optimizations are not represented as corrections, and neither
thresholds, source fidelity, recording cadence nor population were reduced.
The delivery explicitly fails the requested 9/10 target and distinguishes this
Phase 6 pacing limitation from deferred Phase 5 and inherited D7/Video gaps.
