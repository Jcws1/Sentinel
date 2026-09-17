# Contract package 1.6 — D1b additive scenario review

This package archives the complete current API export with the new read-only `POST /api/scenarios/validate` operation. **The world/stream wire version remains 1.5**, stored definitions remain 1.0 and SQLite remains 4. Interactive/status 1.3 and command receipts 1.2 are unchanged. Published v1.5 exports remain byte-identical; no recording migration or rewrite occurs.

`scenario-review.schema.json` adds a separate review schema 1.0. Input is an exact saved definition ID/revision/hash. Output includes the same reference, name, server check time, category/control counts, the actual server motion preset and actionable blockers. Missing/hash-mismatched references fail explicitly. Empty definitions, disabled controls and an existing active run block startup. This endpoint is read-only: it creates no receipt, revision, run, recording, checkpoint or lease, and grants no execution authority.

The operator reviews before Run. The unchanged run endpoint independently resolves the pinned revision and rechecks current admission under the existing creation lock; another run created after validation still blocks it. Browser edits or context changes invalidate the advisory review. No validation token is supplied as command authority. Lost run responses retain the original D1a reconciliation behavior.

Scenario copying uses the existing creation API with remapped placement IDs generated once before persisting its exact pending request. No new stored definition fields or vehicle presets are introduced.

Generate/check with `scripts/export_contracts.py` and the frontend `contracts:generate` / `contracts:check` commands. World/definition consumers may continue using the archived identical v1.5 shapes; the current generated type package includes the new review types. Backend/frontend deploy together for the new endpoint.
