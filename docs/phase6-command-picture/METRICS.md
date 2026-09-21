# Metric and altitude policy

Current observations use one whole runtime presentation frame. The cache holds one
frame/filter projection per runtime; it does not subscribe to cameras or transports.
Source arbitration is the existing entityRows selector. All live charts label the
source effective time, recording time, sequence, mission and source mode.
Mission observation totals arbitrate all sources; filtered counts arbitrate the
selected sources exactly as the maps do. Selecting a source therefore does not
silently change the mission denominator or its current/stale/unlocated totals.

| Metric | Unit / denominator | Exclusions and unknowns |
| --- | --- | --- |
| Overview | Unique mission Entities, one displayed Track per Entity | No-position identities remain in totals; removed identities follow shared filter for filtered counts |
| Current | Entity present AND displayed Track tracking | This is supplied observation state, not confidence; global source delay is separately labelled |
| Stale | Located Entity with non-present presence or non-tracking Track | Includes unobserved, removed and ended; no extrapolation |
| Unavailable position | Entity without a selected Track | No invented point |
| Affiliation / classification | Filtered Entities | Classification absent is Unknown; source identity arbitration matches maps |
| Managed | Explicit Asset records; separate unique-Entity count | Friendly/BLUE alone does not establish management |
| Availability | Explicit Asset availability, including unknown | Assigned differs from condition, control binding and execution state |
| Control | Explicit current-frame bindings / eligible bindings | Not ownership of a lease or authorization to issue a command |
| Condition | Unique managed Entities by explicit condition | Unknown remains an explicit category |
| Assignments / reserves | Active authoritative assignments; legacy-policy reserve members | Absent data/current policy without reserves says not supplied |
| Executions | Current frame's retained movement executions by state | Not lifetime totals; audit provides recorded transitions |
| Audit requests | One receipt identity or external command-received journal identity | Exact retries do not append; pending is state at receipt, not a reconstructed current status |
| Audit events | Unique recorded journal identities through immutable frame sequence | Request entries are separate; outcomes are a subset of events |
| Outcomes | One recorded external interaction / interactive simulated loss | Includes NO_EFFECT; distinct commands are distinct evaluations; not real-world effectiveness |
| Affected entities | Union of internal entity IDs with nonzero recorded health delta or simulated loss | A pair is not two outcomes; repeated simultaneous participants count once |
| Time buckets | Up to 12 equal recording-time intervals | Half-open except inclusive final endpoint; source/effective times displayed separately |
| Telemetry | Unique retained Track/source/series/sample timestamps at pinned audit frame | Existing correction precedence; source-time 15–300s window; missing speed excluded, zero retained |
| Telemetry mean | Arithmetic sample mean in m/s or metres within native datum group | Not time weighted, distance travelled, capability or readiness |
| Comparison | Up to four shared-selected Entities; raw speed m/s, altitude m, source age s | Missing/filtered/incompatible values are null, never zero; labels preserve stale observations |
| Historical Profile exclusions | Retained observations for the displayed Track/source filter within this pane's current source-time plot window | Older/out-of-window and source-filtered points are outside this denominator; exclusive reasons are unavailable origin, incompatible altitude datum/AGL, then before captured origin |

Audit range is recorded UTC, at most 24 hours. A committed frame sequence ceiling
governs events (event sequence is a different counter). Receipt rowid ceiling is
captured on first read; accepted receipts also obey frame sequence. Rejected
receipts lack a frame and are included only through the frame's recorded time and
captured rowid. Equal clock values are ordered by recording time, storage kind and
sequence. Every page retains the same query/cutoff. Search matches literal substrings
of recorded JSON and JSON string-escaped forms of entered text, so original quoted
or backslash identities work as displayed. UTF-8 and ASCII-escaped historical JSON
are supported without rewriting stored bytes. SQLite folds A–Z only; other letters
are case-sensitive. This is independent of map filters. Pages hold at
most 100 rows (UI 50), summary scans at most 20,000 matching rows with an explicit
incomplete warning; pagination remains available beyond that summary bound.
These caps bound returned/materialized rows, not total SQLite scan or sort work.
Client cancellation prevents stale display; it does not claim to interrupt an
already executing SQLite statement. Larger recordings can require more query time.
Displayed lifecycle labels can be derived from event types; literal search does
not promise a normalized-state search over those derived labels.

Comparison bars retain a zero-inclusive axis, including when every compatible
native altitude is negative. Bar lengths represent raw signed measurements, never
the difference from a truncated minimum. This does not put distinct datums on a
common axis: the chosen native group still governs which measurements are available.

External pre-validation rejection is not journaled. External recovery's interrupted
state has no historical transition timestamp; the audit does not manufacture one.
Simulation remains the authoritative current recovery/command-result view. No local
pending body, credential or authority token is copied into the analytics store.

## Vertical profile

Horizontal axis is great-circle radial horizontal distance on the mean sphere
(radius 6,371,008.8 m), in kilometres. It is not slant range or a terrain section.
Default origin uses the frozen scenario origin where supplied, then the mission's
declared reference; missing origin is unavailable, never hard-coded to Singapore.
A selected present/tracking Entity may supply a fixed captured position. The UI
labels its source time; observations earlier than that capture are excluded, so
no historical point accidentally borrows a future reference position. It stays
fixed until changed by the operator. Mission origins apply throughout the range.

Current markers use the maps' shared bounded interpolation sampler. The numeric
table reports committed samples, with original timestamp/reference. Stale markers
remain at the source position. Dashed observed histories preserve every returned
break and additionally split on datum/captured-origin exclusion. They never predict.
The axis-only interpolation envelope is not a plotted observation or metric. Its
horizontal bound is current radial distance plus a conservative upper bound on the
already committed linear latitude/longitude interpolation path; vertical bounds
retain native endpoints in the selected datum. This prevents a current point from
leaving the axes while model layout waits for the next authoritative projection.
Current marker tooltips report the last painted interpolation sample; numeric
tables remain explicitly committed observations. Current-marker tooltips use
ECharts' pointer-transparent HTML mode and literal owner-document text nodes;
they cannot consume pointer hits when confined over their marker. Historical
lines have no vertex hover targets: use the retained numeric observations below.
The historical numeric disclosure pages through 50 plotted observations at a time,
retaining source timestamps, radial distances, native altitudes and segment reasons.
It reads the same bounded result used by the chart; it does not issue another query.
For a running live interactive mission, Profile-only history reads refresh at most
once per second, coalescing intermediate demand to the latest committed frame.
This is query freshness, not sample decimation: each read returns all retained
observations within the existing bounds. The status labels the read's source-time
cutoff separately from the current-frame plot-window end; expired observations
are clipped while refreshing. Map history demand stays immediate, as do final
paused/ended frames and changed mission, selection, range or filters. One request
may finish before the latest same-identity demand runs; there are no overlapping
reads. Hidden/closed demand cancels the request and trailing refresh. Source,
motion, interpolation and recording cadence are unchanged.
The requested plot range and returned retained-read range are labelled separately:
two visible Profiles can share a larger read while clipping to different windows.
Historical sample exclusions have their own visible denominator/reason counts;
they are distinct from current-entity Axis exclusions. Compatible and excluded
historical counts sum to the in-window retained subset. No missing sample is
converted to zero, and removing a datum/origin point still breaks the path.
The repository retains at most 1,000 serialized selected-frame projections / 16 MiB
in its read cache. Exact stored bytes and entity identity determine reuse. Full
world validation and legacy/checksum checks still run for unknown payloads. At most
1,000 exact-byte fingerprints of successful fully validated current-process commits
allow reuse of that validation; rollback never installs a proof. This is separate
from the client's eight bounded history responses; neither cache is recording
state. Cold historical reads can take several seconds. A failed read
shows its error and an explicit retry control instead of implying no observations.

No authoritative geoid/terrain conversion is configured. ELLIPSOID WGS84 aliases
follow the existing reviewed policy. Other ellipsoid datums remain distinct. Named
MSL datums remain distinct; their `MSL · datum ` keys cannot collide with the
`MSL · unspecified datum · source ` keys for source-confined unnamed MSL. AGL is
excluded because local-ground heights do not establish a common vertical surface.
Only one native group is plotted per axis; excluded counts are visible. The Cesium
h≈H approximation is deliberately not used here. Original data stays unchanged.
No clearance, sensor coverage, confidence, predictive risk or engagement feasibility.
