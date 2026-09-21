# Independent documentation review — 21 September 2026 UTC

Reviewer: `/root/documentation_critic`. I did not author the README, architecture
guide, index or component READMEs and did not implement product changes. My writes
are this report and task-local review evidence. The comparison baseline is the
actual cleaned working tree at HEAD
`30414540b89508193ea84c4f8e235362ebd61a37`, not a substituted clean checkout.

**Recommendation: accept the corrected documentation, 9.3/10 overall, subject to
the delivery owner's final preservation and archive readback.** No unresolved
Critical, High, Medium or Low documentation defect remains from this review. One
Medium onboarding error and five Low findings below were corrected and
independently checked. This is documentation
acceptance, not application, performance, security or external-conformance
acceptance.

## Scope and source tracing personally completed

I read the [cleanup ledger](cleanup-2026-09-21.md), its
[independent review](cleanup-2026-09-21-critic.md), the complete new
[README](../../README.md) and [architecture guide](../architecture.md), and the
narrow index/backend/frontend README changes. I checked the diagrams against the
call paths and reviewed the relevant versioned contracts, package scripts,
configuration and historical acceptance reports.

Direct implementation tracing covered:

- Mission locks and source-writer claims; atomic initial recording, frame,
  checkpoint and receipt creation; commit-before-publication; bounded subscriber
  queues and reconnect snapshots.
- Exact command identity/body reuse, admission versus accepted work, control
  leases, receipt-only rejection, interactive restart interruption and the
  external prepare/evaluate/complete/retry boundary.
- External generic-world projection without invented Assets/control; scenario
  revisions/location, version domains and historical readers.
- Source, recording and presentation clocks; fixed source steps; native altitude
  references, Cesium's visual approximation and separate Profile grouping.
- Recording codec and validation proofs; history/audit response caps versus SQL
  work and uncapped retention; shared transport, history and renderer/chart owners.
- Local network exposure, absence of deployment authentication, browser-visible
  provider configuration and the distinction between control ownership and user
  authentication.

The first trace inventory contains 31 inspected source files; the follow-up
contains 52. Every recorded hash matches the documentation-task baseline. This
does not claim exhaustive line-by-line review of all 788 starting files. The
retained trace locations and hashes are in
`critic-source-trace.{ps1,json}` and `critic-followup.json` under the raw-evidence
path below.

## Personally executed checks

- Validated 205 local Markdown targets in the first four-document pass, finding
  one broken target. The corrected five-document pass validates **213 local
  targets with zero missing files/directories**. All ten named npm scripts in the
  README exist with the documented purposes. This is a local-target check, not
  certification of every external URL or a rendered Markdown/Mermaid screenshot.
- Executed the documented backend pytest path/configuration with
  `--collect-only -q -p no:cacheprovider`: **562 tests collected in 29 files**,
  exit 0. No tests ran; the two existing dependency deprecation warnings remain.
- Executed `scripts/export_contracts.py --check`: exit 0, current contracts match.
  Uvicorn and repository-check help invocations also exited 0; Uvicorn supports
  the documented `--app-dir`, host and port arguments.
- Independently reproduced the empty-environment difference using a synthetic
  variable: Windows PowerShell **5.1.19041.6456** removes an empty assignment;
  PowerShell **7.6.5** preserves it. No provider key was printed or used.
- After correction, executed the actual README frontend environment block in
  required `pwsh`, replacing only the npm service launch with a local Vite
  `loadEnv` probe. All three credential variables are present and resolve empty;
  provider/style and disabled photorealistic settings match. Output contains only
  boolean configuration facts and variable names.
- Independently verified the successful supplied smoke database and its
  WAL/SHM/journal paths are absent. At **16:17:52 UTC**, my OS check found no known
  smoke-B process/descendant or listener on ports **8000/5180**. I started no
  application service, browser or database and made no provider request.

Exact commands, document hashes, per-link results, durations and logs are retained
in `critic-document-checks.{py,json}`, `critic-followup.{py,json}`,
`critic-readme-env.{ps1,mjs,log}`, `critic-occupancy.json` and the other
`critic-*.log` files. The initial link failure and initial document hashes remain
separate from the corrected follow-up.

## Supplied verification inspected

The implementer's `command-results.json` records nine exit-0 checks: dependency
consistency, offline pip dry-run against already installed requirements, npm's
installed dependency tree, backend/frontend current and foundation checks,
repository hygiene and a provider-free build to a separate output directory.
I inspected the command runner, results and relevant log output. The build retains
its large-chunk warning. These are supplied executions, apart from my separate
backend contract check described above.

The initial supplied smoke in `onboarding/result.json` failed at an incorrect
Alpha submenu assumption and initially failed service cleanup. It is not credited
as a completed pass. The implementer retained that failure and performed explicit
owned-process cleanup before retrying.

The corrected `onboarding-b/result.json` and runner establish a supplied
**headless onboarding pass** using the documented root Uvicorn/npm-dev commands
with an isolated database. It covers fixture loading via the proxy/WebSocket,
Command Picture/Profile, golden external START, mapped mission/Details,
HOLD/RESUME/ABORT, reload and recorded inspection. It records zero provider
attempts and page errors, closed browser context, stopped owned processes, free
ports and database deletion. I inspected this result and its cleanup assertions;
I did not operate the UI myself. It is not actual-foreground or pacing evidence.

No clean network reinstall was performed. Dependency checks validate the existing
environment, not future registry resolution or every supported platform. No
complete backend/frontend/browser regression, provider rendering, security test
or performance benchmark was rerun by this reviewer. The preceding cleanup's
562/486/126 passes remain attributed to that task and its reviewed source.

## Severity-ranked findings and follow-up

Critical and High: none identified within this documentation scope.

| ID / severity | Documentation and source location | Reproduction, impact and correction | Follow-up |
| --- | --- | --- | --- |
| D1 / Medium | Initial `README.md:7,50-52`; `frontend/src/renderers/providers.ts:11-29`; installed Vite `dist/node/chunks/node.js:5728-5730` | Execute the empty assignments in Windows PowerShell 5.1. The variables disappear, permitting existing `.env.local` values to win, contrary to the provider-free promise. Require the verified `pwsh` version or another demonstrably safe override. | **Corrected.** README now explicitly requires PowerShell 7.6.5; my exact-block Vite probe confirms all credentials resolve empty. |
| D2 / Low | Initial `docs/architecture.md:167-171,213-215`; `backend/app/commands/service.py:264-358`; `backend/app/simulation/service.py:159-185` | The interactive diagram routed rejection through accepted world publication, and the external diagram placed mapped-world construction before transaction 2. Compare the receipt-only rejection and in-transaction `sample_frame` calls. The diagrams could mislead transaction and blocking analysis. Show the rejected branch and adapter/validation work inside transaction 2. | **Corrected and reread** at architecture lines 168-176 and 218-224. Supporting prose distinguishes failures before the durable receipt boundary. |
| D3 / Low | Initial `docs/architecture.md:391`; `backend/app/domain/models.py:129,166`; `frontend/src/contracts/integrity.ts:19,54`; historical `phase5-simulation-compatibility/critic-round-3.md:66-95` | The open mixed-scale geometry finding was attributed to the resolver. The retained reproducer passes external Decimal validation and fails generic Polygon validation. Wrong ownership would direct future work to the wrong layer. Cite the actual generic validators and original review. | **Corrected and reread** in the P5-GEOMETRY row, now linked to R3-1. No product fix or phase closure is claimed. |
| D4 / Low | Initial `docs/architecture.md:374`, target `docs/d3/CONTRACT_DECISIONS.md` | Resolve the relative link: no such file exists. The decision trail was inaccessible. Replace it with an existing relevant version/compatibility record. | **Corrected.** The retained integrated version matrix resolves; all 213 follow-up local targets exist. |
| D5 / Low | Initial `docs/architecture.md:197`; `backend/app/commands/contracts.py:439-456`; `backend/app/recording/analytics.py:113-116` | The prose assigned both source and recording clocks to receipts. Receipts have `recordedAt` and optional accepted frame/sequence references; audit requests do not invent `effectiveAt`. Distinguish receipts from frames/events. | **Corrected and reread** at architecture line 202. |
| D6 / Low | Initial `README.md:7-9`; `backend/requirements-dev.txt:1-4`, `backend/requirements.txt:1-4` | Direct Python packages are pinned, but there is no complete transitive Python lock. Calling the environment reproducible without this qualification could overstate a fresh install guarantee. State direct pins and the scope of the existing-environment verification. | **Corrected and reread.** README lines 7-9 and architecture line 48 now distinguish the verified starting environment, direct pins and the absence of a full Python lock. No dependency or installation change was required. |

The architecture's clocks, recovery, security, query-cost, external-schema maxima
and altitude sections now reflect the traced source. Three diagrams were checked
for conceptual ordering and syntax by inspection; I do not claim a Mermaid
rendering test. The documentation separates requirements, implemented behavior,
historical measurements and open acceptance criteria without treating roadmap
items as completed features.

## Scores and acceptance limits

| Dimension | /10 | Basis |
| --- | ---: | --- |
| Factual accuracy | 9.4 | Direct source tracing, separate version/clock/datum domains and corrected transaction/receipt claims; no unqualified conformance or performance claim. |
| Completeness | 9.4 | Component map, principal flows, ownership, persistence/recovery, limits, security boundary, extension workflow and actionable open findings. |
| Onboarding | 9.1 | Concrete root commands and corrected shell requirement; independently checked flags/collection/env resolution plus supplied isolated smoke. Clean network installation is unexecuted. |
| Evidence | 9.3 | Exact source/doc hashes, personal versus supplied checks, failed attempt retained and historical open gates preserved; no independent foreground or performance claim. |
| Maintainability | 9.2 | Canonical architecture with source links, focused quick start and dated historical reports. Manual source/version links need rechecking when code changes. |
| **Overall documentation assessment** | **9.3** | **Accept the corrected documentation within these explicit limits.** |

Phase 5's mixed-scale valid-input failure, large-batch blocking and provisional
external policies remain open, with its **8.6/10** withheld acceptance. Phase 6's
combined-Profile pacing remains open, with **8.5/10** withheld acceptance. D7 strict
display and configured Video remain unresolved. This review neither upgrades
those ratings nor authorizes a new roadmap phase.

## Final reviewed identity and closeout boundary

I reread the completed verification ledger and its explicit installation,
headless-versus-foreground, failed-attempt and historical-test qualifications.
The supplied pre-closeout preservation result reports all 627 tested input hashes,
437 original database metadata records, three private environment records and 857
protected-tree hashes unchanged. Its 403-file / 16,423,608-byte isolated build
matches cleanup output. These are supplied preservation/build checks; my own
source-hash and smoke-resource checks are stated separately above.

`critic-final-readback.json` records the final reviewed SHA-256 values for
`README.md`, `docs/architecture.md`, `docs/README.md`, `backend/README.md` and
`frontend/README.md`, the final local-link results and this report's hash. It is
the sealing comparison for the reviewed canonical documents. Subsequent ledger
and archive receipts may record closeout without changing those documents; any
material canonical edit requires another review.

Raw evidence currently resides in ignored
`test-results/documentation-2026-09-21/`. Its assigned retained archive is
`C:/Archive/Coding/Sentinel3-archive/2026-09-22-project-documentation/`, preserving
the same `test-results/...` paths. The delivery owner must retain it there and
perform final source/data preservation and archive readback. I have not claimed
those later closeout operations as my own work. No product, operator database,
environment file, historical report or unrelated research was edited by me; no
commit or push was made.
