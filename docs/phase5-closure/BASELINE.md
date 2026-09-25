# Baseline — recorded starting state

Captured 2026-09-24 00:09:50–00:38:30 UTC on the untouched HEAD. Every check
except the optional browser suite finished before the first edit (00:31:06).
The browser suite (00:23:47–00:38:30) overlapped the first edits (new,
not-yet-imported files and a `frontend/src/contracts/integrity.ts` change at
00:36:32), but it served the `-p5c-baseline` bundles built from HEAD at
00:23:35–00:23:42, its specs import no module that uses `integrity.ts`, and no
backend module changed until 00:38:37. These results describe HEAD; they are
not closure evidence.

## Source and preservation identity

| Item | Value |
| --- | --- |
| HEAD / branch | `f98de4f183b27df947fb914893deb2e688b598b0` / `v3` |
| Working tree | Clean (`git status --porcelain=v1 -uall` empty); stash list empty |
| Source inventory | 793 tracked + unignored files: 240 product, 167 test, 207 frozen/contract, 20 build-config, 15 tooling, 108 documentation, 3 user documents, 33 research |
| Candidate inventory | 649 non-documentation files; digest `b6f6a967e878e8607b63e289267bdfa925dc822b883fad74fe38bb76abfe52f6` |
| Database artifacts | 437 (432 `frontend/.cache`, 4 `backend/data`, 1 `backend/backend`), recorded by path/size/mtime only, never opened |
| Environment files | 2 (`frontend/.env`, `frontend/.env.local`), SHA-256 and metadata only; values never printed |
| Protected ignored content | 2,230 files hashed under `research-brain/`, `output/`, `tmp/`, configured `frontend/dist/`, the map pack, `backend/drafts/`, `backend/backend/`, `.claude/`; `node_modules`/`.venv`/caches summarized by count, bytes and newest mtime |
| Ignored top-level paths | `.cache/`, `.claude/`, `backend/{.pytest_cache,.venv,data,backend}/`, `__pycache__/` trees, `frontend/{.cache,.env,.env.local,dist,node_modules,public/edge-map}`, `output/`, parts of `research-brain/`, `scripts/__pycache__/`, `test-results/`, `tmp/` |

User-added `docs/review.md`, `docs/DIAGRAMS.md` and `Sentinel_Diagrams.md` are
tracked and preserved. README user edits (`<FILL IN>` project structure and the
root-level `npm run dev` line) are preserved unchanged.

**Toolchain deviation:** PowerShell 7 (`pwsh`) is not installed on this machine
now; Claude Code's PowerShell tool is Windows PowerShell 5.1. All README commands
ran through Git Bash, which handles empty `VITE_*` overrides correctly. Python
3.10.11, Node 24.20.0, npm 11.19.0 and Edge match the verified set. `PYTHONUTF8`
is unset.

## Baseline checks

| Check | Result |
| --- | --- |
| Frozen guards `verify_phase0.py` | 43 passed, exit 0; tracked `contracts/phase0-verification.json` byte-identical after the run |
| Complete backend suite | **562 passed**, 2 existing Starlette/anyio deprecation warnings, 88.7 s, exit 0 |
| Complete frontend unit suite (`--maxWorkers=2`) | **485 passed / 1 failed** of 486 in 49 files, exit 1 |
| Failure | `requestRecovery.test.ts` › "preserves the callback through actual SDK child-resource cloning": 5 s test timeout after 20.1 s while importing the Cesium SDK under two-worker contention. The file alone passes in 1.6 s (diagnostic only). Known pre-existing flake (see Phase 5 VERIFICATION and Phase 6 REGRESSION); out of Phase 5 scope; retained |
| typecheck, lint, format:check, contracts:check, contracts:foundation:check, `export_contracts.py --check`, `check_repository.py` | All exit 0 |
| `build:test` (suffix `-p5c-baseline`) | Exit 0 |
| Complete browser suite (optional baseline run) | **126/126 expected**, 0 skipped/unexpected/flaky, no retries or root errors, 878 s, exit 0; runner deleted its task database |

## P5-GEOMETRY reproduction through real uvicorn

Task-owned port 8311, disposable database under `.cache/phase5-closure/`, no
demo/fixtures, removed afterwards (port verified free).

| Request (golden body, polygon replaced) | HTTP | Run committed |
| --- | ---: | --- |
| Golden control | 200 | Yes (MUTUAL_EFFECT) |
| R3-1 `[[0,0],[2e-170,2e-170],[1e-170,0],[1,0],[1,1],[0,1],[0,0]]`, drones at 0.5, 0.5 | **500** | No — rollback verified |
| New: `[[0,0],[0.6000000000000001,2],[0.30000000000000004,1],[-1,1],[0,0]]`, drones at -0.2, 0.8 | **500** | No — rollback verified |
| New: ring `[[-170,-80],[170.3,80.7],[-170,80],[-170,-80]]`, drones at (-3.991293408785402, -1.6056445806400745) | 200 | Yes — MUTUAL_EFFECT for a point exactly **outside** the ring |

The failure is raised in `SimulationService._prepare` → `commit_locked` when the
core `WorldFrame` rejects the zone (`polygon adjacent edges overlap`). The second
500 is not an underflow case: the validator decided on `Decimal(str(v))` at
28-digit precision while the core decided on binary doubles. The containment
error comes from float ray crossing near a long edge. These findings led to the
pre-start numeric-basis decision in [PLAN](PLAN.md).

Raw evidence: `test-results/phase5-closure/baseline/` (`inventory/`, `checks/`,
`api-repro/`, `browser/`), archived at delivery.
