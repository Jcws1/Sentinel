# Research activity log

## [2026-09-20] ingest | Initial abstract evidence

Read the supplied research DOCX, including all five embedded images; reviewed the report guidelines and selected current repository ledgers. Independently checked archived validation timestamps and recording measurements. Distinguished proposed product capabilities from implemented software behaviour.

## [2026-09-20] query | Abstract headline selection

Selected repeated scenario-validation response as the headline because it is directly relevant to the review workflow. Chose the default Singapore scenario, not the larger Sydney percentage. Preserved the warm-cache qualification, three successive requests per version, observed ranges, and absence of a confidence interval.

## [2026-09-20] create | Obsidian research vault and abstract

Created immutable source snapshots with a hash manifest, linked evidence notes, a claim-gap ledger, and the abstract. Adapted the raw/wiki/schema pattern from Karpathy's linked gist. No source document or project database was edited. No additional test run or literature verification was performed.

## [2026-09-20] lint | Delivery verification

Microsoft Word confirmed 250 abstract words including citation markers. A separate scope review found no material overclaim. All derived-note links resolve, and all 21 source snapshot hashes match the manifest. The vault contains 11 derived Markdown notes. No Obsidian plugins or global settings were changed.


## [2026-09-20] fix | Snapshot integrity and EOL protection

Verified all 21 recorded snapshots. One failed: `raw/repository/README.md` was
6073 bytes against a recorded 6152, with zero carriage returns, because Git's
`core.autocrlf=true` rewrote its CRLF endings to LF. Content was identical
ignoring line endings, but the recorded SHA-256 no longer matched, so the
snapshot no longer served as byte-exact evidence.

This supersedes the delivery-verification entry above, which recorded all 21
hashes as matching. That was true when written and is no longer true of the
period between; the earlier entry is left unedited because the log is
append-only.

Restored the bytes from the unchanged original, which still hashed to the
recorded value, and confirmed 6152 bytes and a matching digest. Added
`.gitattributes` setting `raw/** -text` so the raw layer is never normalised
again; the rule is placed last so it wins over the general `*.md text` rule,
and `git check-attr` confirms `text: unset` for raw snapshots. Git's index
still holds the normalised blob, so the repaired file shows as modified until
it is staged; no commit was made.

Also removed an empty, untracked `IMPLEMENTATION_PLAN.md` from the vault root.
It was 0 bytes, linked from nothing, and not part of the schema.

## [2026-09-20] create | Schema, tooling, and conventions

Wrote `CLAUDE.md` as the authoritative schema: the three layers, the folder and
naming conventions, the page frontmatter contract with its six `status` values,
the link conventions, the preserved evidence rules, the ingest/query/lint
workflows, the guardrails, and the log format. Reduced `AGENTS.md` to a pointer
so two schemas cannot drift apart.

Added `tools/verify_snapshots.py`, `tools/lint_links.py`, and
`tools/snapshot_source.py`. The snapshot tool copies bytes with no text
translation, refuses to overwrite an existing snapshot, re-hashes what it
wrote, and appends the manifest entry.

The link linter deliberately ignores links inside `raw/`. Forty-four such links
dangle because snapshots are partial copies of a larger repository; rewriting
them would violate immutability. Only derived pages are linted.

## [2026-09-20] ingest | Provider budget ledger

Snapshotted `docs/d7-details-closure/PROVIDER.md` (5559 bytes, sha256
617b8c08...c740f67) as the 22nd manifest entry. It was cited by three already
snapshotted ledgers - Performance line 182, Pacing line 144, Verification line
55 - but had never been ingested, leaving a dangling reference in the evidence
chain.

It resolves why configured Video acceptance is open: the run stopped at its
authorised ceiling of 4,000 external request attempts, having spent 3,516, and
the cap closed the page mid-capture. Exit code 1 is the expected budget stop,
not a renderer defect or crash. A separate credential-free probe did confirm
hidden-render suspension and viewer reuse.

Integrated into four pages rather than filed alone: `Quantitative results`
gained the budget-stop cause and two misquote guards, `Claims and gaps` gained
three rows and a provider-approval note, `Verified scope` gained the confirmed
provider-imagery rendering, and `Repository evidence` now lists the ledger.
Created `wiki/sources/Provider budget ledger.md`.

Recorded but not acted on: the ledger proposes a further run of at most 8,000
attempts. It states that run is unauthorised, and nothing here authorises it.
No benchmark, application or test was executed during this ingest.

The abstract was re-read against the new source and needed no change; it makes
no Video claim, and its display-stall limitation remains accurate.

## [2026-09-20] lint | Post-ingest verification

`verify_snapshots.py`: 22 of 22 snapshots match the manifest. `lint_links.py`:
all derived links resolve, no orphans, frontmatter complete on all 8 wiki
pages. Both runs are the ones this entry records.

Open and unresolved, carried forward: partner integrations remain
unsubstantiated, no human-factors study exists, the configured Video gate needs
a separately approved allocation, and the parent repository's uncommitted
`.gitignore` change adds `/research-brain` while 33 vault files are already
tracked, which will not untrack them.

## [2026-09-20] ingest | Sentinel v3 specification

Snapshotted `docs/Sentinel_v3.md` (55713 bytes, sha256 a581602c...1565d64) as the
23rd manifest entry. The document is dated 10 September 2026, ten days before
ingest; the user flagged it as possibly outdated, which proved correct.

Classified `source_recorded`: design intent, not delivered behaviour. The
repository states the rule independently at `docs/README.md` line 21, which
calls the specification a frozen, hash-checked input and says a planned item is
not proof that it is implemented. Nothing from it is citable as capability.

Its value is design rationale, which the organisers asked the report to
emphasise. The backend-authority split that the milestone verifies is
invariant 5 of this document, paired with invariant 13; intent and
implementation agree, which makes it reportable as a decision.

Four of the document's own concessions corroborate existing gaps rather than
contradicting them: sensor/track confidence "may remain partly conceptual"
(line 685); timeline scrubbing is longer-term work (line 625) and replay
scrubbing only time-permitting (line 1587); multi-window management, saved
workspaces, advanced sensor-fusion visualisation and offline deployment are
listed "Later" (lines 1595-1605); HADR is "not a hackathon build target"
(line 1687); the policy/authority layer is deferred (line 1716).

Two findings run the other way. The external simulation compatibility adapter is
a stated "Must Work" priority but is not evidenced as delivered in the milestone
material, so a specification priority is not delivery. And section 41 names
Singapore, Mojave and Tropical/Jungle as the demonstration environments, while
the evidence shows Singapore and Sydney: Sydney appears across nine measurement
and ledger files including the COMPATIBILITY goldens, and Mojave and Tropical
appear in no evidence file at all. Recorded as confirmed drift, not resolved;
the current intended demo set needs user confirmation before the report
describes environments.

Integrated into five pages rather than filed alone: created
`wiki/sources/Sentinel v3 specification.md`; `Claims and gaps` gained three rows,
a sensor-fusion corroboration and a note that the draft and the specification
fail in opposite directions; `Verified scope` gained the invariant rationale and
the scrubbing boundary; `Research draft` gained the specification as a control on
its capability claims; `Repository evidence` now lists the specification under a
new design-input heading separating it from delivery evidence.

Verified claims against the snapshots before writing rather than from the pasted
text: grep confirmed that "scrubbing", "Mojave" and "Tropical" occur only in the
specification. No benchmark, application or test was executed. The abstract was
re-read and needs no change; it cites no specification content.

## [2026-09-20] lint | Post-ingest verification

`verify_snapshots.py`: 23 of 23 snapshots match. `lint_links.py`: all derived
links resolve, no orphans, frontmatter complete on 9 wiki pages. Both runs are
the ones this entry records.

## [2026-09-20] query | Operational abstract revision

Rewrote the abstract around the problem, approach, twenty-versus-twenty simulation result, and operational implication. Replaced cached-validation timing as the headline while retaining it in the quantitative evidence page. Verified the archived independent scenario result: forty moving tracks, twenty model-defined interception outcomes, forty unique participants, and forty non-operational entities. No verified detection-to-tasking or deployment interval was found; no near-instantaneous deployment claim was added. Ingested the scenario report, raw outcome result, and current recovery harness as three new immutable snapshots. No simulation or benchmark was rerun.

## [2026-09-20] lint | Revised abstract verification

Microsoft Word confirmed exactly 250 words including two citation markers. verify_snapshots.py verified all 26 snapshots; lint_links.py checked 15 derived/control pages with no unresolved links, orphan pages, or missing frontmatter. The existing user-updated schema and previous evidence were preserved.



## [2026-09-20] fix | Complete LLM Wiki convention and evidence audit

Audited the existing vault before the requested implementation-plan ingest.
Preserved all raw snapshot bytes and historical log entries. Expanded CLAUDE.md
and README with the persistent-wiki workflow, source bundles, versioned ingest,
source-report attribution and inherited-preference handling. Fixed invalid status,
title/H1 mismatch, bare wikilinks and source inventory coverage. Added Sentinel
and Video entity hubs, a worked workflow and a dated audit output; index now
catalogs all 14 wiki pages across six source notes.

Corrected the Video budget interpretation (3,500 dispatch allocation, 3,516 observed,
484 unused under the total 4,000 ceiling), retained separate display failures,
qualified historical scope, and separated the future policy layer from implemented
software authority. Recomputed retained measurements: 20 outcomes, 40 participants,
82.7555489573% warm validation reduction, 93.1992943610% stored-bytes/frame reduction.
Read four PDF pages, 235 DOCX paragraphs and five embedded images. Expanded recorded
submission requirements and fixed abstract reference coverage; prose remains
250 whitespace-delimited words. Word was not rerun.

Hardened snapshot path/provenance checks, exclusive creation and atomic manifest
updates. Expanded the linter's metadata, alias, image-link, table-pipe and catalog
checks. Nine isolated tool tests passed. The attempted parallel file reviews stalled
on approvals and are not claimed as independent evidence audits. No application,
benchmark, provider request, field test, literature verification or commit occurred.

## [2026-09-20] lint | Pre-plan-ingest gate

Ran tools/verify_snapshots.py: 26 entries and 26 raw files, all hashes match.
Ran tools/lint_links.py: 19 derived/control pages, links and aliases resolve,
no orphans, metadata and index coverage valid. These are the actual runs immediately
following the audit repairs. All 26 snapshots have direct source-note citations.
Tool regression suite: nine tests passed in isolated temporary vaults.

The supplied literal path docs/IMPLEMENTATION/_PLAN.md does not exist. Repository
file discovery found docs/IMPLEMENTATION_PLAN.md, also named by the retained docs
index. Asked for optional clarification; absent a correction, the next ingest
uses that matching file and records its actual provenance. Existing parent-project
changes remain outside this audit. Original user-preference messages and some
underlying ledger artifacts remain unavailable within the vault.


## [2026-09-20] ingest | Implementation plan and delivery chronology

After completing the existing-vault audit and pre-ingest checks, snapshotted the
matching docs/IMPLEMENTATION_PLAN.md (the supplied docs/IMPLEMENTATION/_PLAN.md
path was absent). Actual source: C:\Archive\Coding\Sentinel3\docs\IMPLEMENTATION_PLAN.md.
Captured 121999 bytes, SHA-256 3263bfb0692ed4f160dfdf31d5b461ddaca3ca84a8f799599afa3bb39938bbff,
as raw/repository/docs/IMPLEMENTATION_PLAN.md, the 27th manifest entry.

Created the source_recorded Implementation plan note and the
mixed_verified_and_proposed Delivery roadmap synthesis. Integrated scope, results,
claims/gaps, specification interpretation, repository provenance, fleet evidence,
Sentinel/Video hubs and the worked workflow; index now catalogs 16 wiki pages and
seven logical source notes.

Preserved the plan's internal contradictions: a 20 September Milestone 1 opening,
older D5-D7 deferrals, historical M1 sketch and stop-after-D3a ending. Corroborated
only the named milestone claims against retained ledgers; no blanket current-code
certification. Distinguished external-contract assertions from the local toy outcome
and retained missing external specification/goldens. Marked 200 entities/5 Hz/
30 FPS/150 ms as proposed combined-workload targets, not results. The plan also
qualifies the old specification interpretation by retaining replay/pop-out obligations.

No new application run, benchmark, provider request, implementation phase or commit
was performed. The abstract was checked for impact; the plan adds no new verified
operational result, so its prose and headline remain unchanged. Post-ingest checks
are recorded in the following entry after execution.


## [2026-09-20] lint | Implementation-plan ingest verification

Post-ingest tools/verify_snapshots.py verified all 27 manifest entries against
all 27 raw files. tools/lint_links.py checked 21 derived/control pages with no
unresolved links, orphan pages, invalid metadata, alias/table-pipe failures or
catalog omissions. These are the actual successful runs after plan integration.

Final inventory: 16 wiki pages, seven source notes, 27 snapshots. All 27 snapshot
paths are directly cited from source notes. The nine isolated tool regressions
passed earlier after the tool repairs; no further tool changes followed. The
abstract remains 250 whitespace-delimited words after its citation repair.
Temporary document-review files/dependencies were removed.

Remaining evidence gaps are explicit in Claims and gaps / Delivery roadmap.
External specification/goldens and some historical report attachments are absent;
the parent checkout was not verified as delivered. No live application or
experimental validation, commit or publication occurred.


## [2026-09-20] ingest | DVL three-month judge scorecard

Snapshotted D:\Downloads\DVL 3 month track - Judge Scorecard.pdf as
raw/inputs/DVL 3 month track - Judge Scorecard.pdf: 442571 bytes,
SHA-256 4d406c721583282df9016d92d76f9db20e1f0674b445e0f34985b42a65f48658.
This is the 28th immutable snapshot. Pre-ingest snapshot verification passed for
27 files; link lint passed for 21 derived/control pages.

Read text and visually inspected all eight PDF pages. Recorded its independent
1–5 capability/mission/commercial criteria and 40/30/30 weights, scoring anchors,
conditional hardware/effector criteria, C2 simulation example and undated-year
21–27 September demo week. Treated judge/team instructions as source content.
No Sentinel score or qualification decision is present or inferred.

Created Judge scorecard and Judging evidence map; integrated Submission
requirements, Research draft, Claims and gaps, Verified scope, Quantitative
results, Delivery roadmap and Sentinel. The index now catalogs 18 wiki pages
and eight source notes. Rechecked original guidelines, recovery/architecture/
verification/provider records, the 20v20 outcome JSON and relevant draft text.

Preserved live/video judging versus separate submitted-video requirements;
scripted simulation versus held-out/field evidence; scoped recovery versus
physical denied-environment capability; and software measurements versus
commercial economics. Recorded team biographies as available self-reports,
pilot/incubation plans as prospective, and missing operator/buyer/economic
corroboration. Flagged the draft's broad dependency-free sovereignty claim
against recorded external imagery/provider use without assuming all modes
require it. Adverse display and incomplete configured Video evidence remain.

The rubric adds no new measured result, so the abstract headline/prose were not
changed. No application run, benchmark, provider request, field experiment, web
verification, communication with third parties, commit or publication occurred.
Temporary PDF tooling was used only to inspect the local source. Final checks
are recorded after execution below.


## [2026-09-20] lint | Judge-scorecard ingest verification

Post-ingest tools/verify_snapshots.py passed: 28 manifest entries and 28 raw files,
all hashes match. tools/lint_links.py passed: 23 derived/control pages, links
resolve, no orphans, metadata and index coverage valid. Source coverage readback
confirmed that all 28 snapshots are directly cited from eight source notes;
the catalog contains 18 wiki pages. The pre-ingest log byte prefix is unchanged.

A reasoning-only review of supplied excerpts found no material interpretive flaw;
it was not an independent filesystem or source audit. Provider observations
remain attributed to the ledger. No verification tools changed, so their earlier
nine-test regression suite was not rerun. Temporary PDF renders and local
inspection dependencies were removed after checking their exact vault path.

Open evidence includes target-operator validation, scoped external integration
and deployment independence, software economics, substantiated defensibility,
confirmed buyer/incubation progress, and the retained display/Video acceptance
gaps. The scorecard establishes criteria, not Sentinel scores or readiness.


## [2026-09-20] fix | Unrecorded V2 draft recorded in place

tools/verify_snapshots.py reported one problem on entry: raw/inputs/
Sentinel_Report_DRAFT_V1_Revised_V2.docx was present in raw/ but absent from the
manifest, having been copied in without tools/snapshot_source.py. Its bytes were
hashed and recorded in the manifest in place, unmodified: 53,921 bytes, sha256
cba5cf2c3806eb870ec4b08879c8de3591c41ac8c41fa100fc756d52c5e81556, source
modification time 2026-09-20T13:33:02Z. Nothing in raw/ was rewritten, reformatted
or re-copied, and no existing entry was altered.

Provenance was investigated before recording rather than assumed. The same-named
document at output/documents/ is NOT byte-identical: 53,899 bytes, sha256
9188fa06..., modified 13:27:04Z, six minutes earlier. Comparing the two archives
member by member showed six differing members and a word/document.xml differing by
139 bytes across three paragraphs; a text diff showed all three to be copy-edits
with no change to any claim, number, citation or section. The vault-held file is
therefore the later revision. A hash search across the Sentinel3 tree, Downloads,
Desktop and Documents found its bytes in no other file, so its pre-vault origin is
unrecoverable. The manifest entry's original_path records where the bytes were
found, not where they came from, and a provenance_note in the entry says so
explicitly.

The earlier revision was then snapshotted normally with tools/snapshot_source.py
to raw/inputs/Sentinel_Report_DRAFT_V1_Revised_V2.2026-09-20.docx, so the
difference between the two is evidenced inside the vault rather than asserted.
The dated filename follows the schema's collision rule and is the EARLIER file;
that is stated on the source page because the name implies otherwise.

Not done: the damaged-snapshot procedure in section 7 was deliberately not used,
because these bytes were never recorded and so had no prior hash to contradict;
nothing was re-hashed after alteration. No file in raw/ was edited or deleted.

## [2026-09-20] ingest | Report draft V2 and section evidence map

Ingested the 20 September submission draft from the two snapshots above and wrote
wiki/sources/Report draft V2.md. The draft has 148 paragraphs, no embedded media,
a 249-word abstract, three written body sections, two populated comparison tables,
23 references, and eight section bodies still carrying bracketed template text.
The eight placeholders were inventoried by paragraph range.

Claims were traced rather than accepted. Five draft statements trace to cited raw/
snapshots; two are claims the draft correctly withholds; one cannot be checked
because its cited source is not snapshotted; 20 of 23 references are external and
absent from raw/. The draft does not repeat the research draft's sensor-fusion,
confidence-scoring, GNSS-denied or partner-integration overreaches, and no claim
in it contradicts an existing wiki page.

Citation integrity was checked against the commit the draft cites. Snapshot
content was compared with commit 3041454 ignoring line endings: docs/architecture.md
and docs/reports/performance-stability.md match that commit exactly, so references
[4] and [5] are faithful. An initial raw-hash comparison suggested drift; that was
git's line-ending normalisation in `git show`, not content drift, and the corrected
comparison is what is recorded on the page. Revision 75f428d was confirmed to exist
as the repository's initial commit, with the cited range spanning 17 commits whose
oldest is dated 2026-09-10. Five snapshotted repository files have drifted in the
working tree since 3041454; that drift is uncommitted work postdating the cited
revision, so the existing snapshots remain the correct anchors and were NOT
re-snapshotted.

Wrote wiki/outputs/Report evidence map.md, keyed to the guidelines PDF's required
sections and page budgets rather than to the judging criteria, so it complements
the existing criterion-keyed Judging evidence map instead of duplicating it. It
records, per section, the evidence available with its conditions, the gaps, and a
list of claims to refuse. Load-bearing numbers are restated inline so the page
survives being pasted without the vault.

Integrated into index.md (catalog and counts, now 20 wiki pages and 30 snapshots
across nine source notes), Research draft (successor relationship), Abstract
(the draft removed both citation clusters when carrying the prose to the cover),
Claims and gaps (six new requirement-level gaps), Judging evidence map and
Submission requirements (page budgets and the two requirements most at risk).

Gaps newly recorded: no 21 June baseline exists, because the git history begins
2026-09-10 with 18 commits in total; no TRL assessment exists anywhere in this
corpus; MOSA rests only on internal contracts; there is no cost model; and the
draft's own reference [23] cannot be checked because the two map documents are
not snapshotted.

Not done: a newer draft, output/documents/Sentinel_Report_DRAFT_V1_Revised_V3.docx
(199,558 bytes, modified 20 September 2026 22:01 local), was found beside a Word
lock file indicating it was open for editing. It was deliberately NOT read or
snapshotted, because an open document is not a stable source, and the user's
instruction named V2. Everything recorded this session describes V2 and may
already be superseded. The repository evidence gap in step 3 of the request was
NOT closed; a snapshot proposal was put to the user and awaits approval, so
nothing under docs/phase5-simulation-compatibility/, contracts/sentinel/,
backend/app/simulation/ or frontend/src/modules/ was snapshotted. No application
run, benchmark, provider request, database access, commit, push or publication
occurred. External references in the draft were not verified against their
sources; no web access was used.

Checks after the work: tools/verify_snapshots.py passed, 30 manifest entries and
30 raw files, all hashes match. tools/lint_links.py passed, 25 derived and control
pages, all links resolve, no orphans, metadata and index coverage valid. Both runs
are the ones producing these statements. The verification tools were not modified,
so their unit suite was not rerun. Temporary PDF text renders were written to a
session scratchpad outside the vault.

## [2026-09-20] fix | Contested functional-gate figures flagged in the evidence map

While sizing step-3 snapshot candidates, docs/performance-closure/ was found in
the checkout: eight files, dated 20 September 2026, not snapshotted and not
ingested. It reports 403 frontend tests across 41 files, 404 backend tests, and a
final complete browser suite of 116 passed / 1 failed, with functional, storage
and display acceptance withheld and overall closure recorded as partial. The
Milestone 1 ledger already in this vault reports 414 frontend, 438 backend and
118/118 with zero failures, labelled final production.

Both are dated the same day. The lower test counts are consistent with
performance-closure being the earlier package, which would leave the Milestone 1
figures correct, but neither document establishes the ordering on its own and
this vault has NOT verified it. Rather than resolve it unilaterally or leave an
unqualified number in a deliverable, wiki/outputs/Report evidence map.md was
amended to mark the 118/118 zero-failure line as unconfirmed for report use, with
the competing figures stated and the ordering question named.

That package also appears to hold the follow-up evidence this vault records as
missing: it reports 4,785.5 to 2,268.6 ms (52.6%) default 40-unit repeated
backend review, the same pair of numbers Quantitative results currently has to
attribute to the implementation plan because the underlying package was absent,
plus a matched actual-desktop input-to-review DOM figure of 4,992.0 to 2,569.0 ms
(48.5%), and states retained storage bytes are unchanged.

Not done: nothing was snapshotted, because step 3 of the request is gated on the
user's approval. The claim was therefore qualified from the working tree rather
than cited, and is explicitly marked in the page as seen-but-not-ingested. The
figures above were read from the checkout, not from raw/, so they are not yet
evidence under this vault's rules. Quantitative results was NOT amended, because
amending it would require citing a source the vault does not hold. Ingesting
docs/performance-closure/ is the first item of the snapshot proposal put to the
user.
