# Sentinel contracts

Current exports are in **[v1.13](v1.13/README.md)**. Runtime authority lives in `backend/app/`; the frontend consumes `frontend/src/contracts/generated.ts` and validates messages against the exported schemas.

The package number is not a universal wire version. World/stream 1.10, scenario 1.5 and earlier supported messages retain their own semantics. v1.13 permits 40 scenario units and at most 32 controlled units without changing command/execution bounds.

Earlier version directories are frozen compatibility contracts used by strict readers and regression tests. Do not delete or regenerate them because they are old.

## Current generation

From the repository root:

```powershell
backend/.venv/Scripts/python.exe scripts/export_contracts.py --check
npm --prefix frontend run contracts:check
```

Omit `--check` and use `contracts:generate` only for an intentional update to the current package.

## Frozen foundation record

Unversioned `world.schema.json`, `world.generated.d.ts` and `session-view.ts` preserve Phase 0. Their authority is `backend/drafts/domain.py`; these are not product runtime models. The separate external simulation contract and immutable specification checks remain in `contracts/simulation/` and `scripts/verify_phase0.py`.

```powershell
backend/.venv/Scripts/python.exe scripts/verify_phase0.py
npm --prefix frontend run contracts:foundation:check
```

To intentionally reproduce foundation exports, use `scripts/export_phase0_domain.py` and `node frontend/scripts/generate-foundation-contracts.mjs`. The old docking experiment is unnecessary. Historical package README links may name archived phase evidence; [the archive index](../../docs/ARCHIVE.md) explains its preservation.
