# Sentinel contract package 1.12 — rules-based Suggestions

Coordinated backend/frontend deployment required. Archived v1.11 and earlier packages remain unchanged.

New advisory request/response schema 1.0 is served by read-only `POST /api/interactive/{mission_id}/recommendations`. A bounded selected-entity list is evaluated against a consistent committed frame/checkpoint. It does not acquire authority or write simulation/recording state. Sets expire after 15 backend elapsed seconds and are held in a bounded process-local cache.

Ordinary intent requests may include a typed `recommendation` reference. The server validates the exact cached action, identities, relevant-state fingerprint and expiry, then includes immutable `RecommendationAudit` evidence in its issued intent. Apply uses the existing command endpoint, source-bound authority, ordering and validators. The full proposal/input reference is retained in the ordinary immutable command request journal; its command ID correlates the existing receipt. Duplicate receipt lookup still precedes admission/expiry/restart checks. Unapplied suggestions are not recorded. No new execution operation or capability exists.

Unchanged surfaces: world/stream 1.10, interactive/run/status 1.7, receipts 1.6, execution reads 1.3, checkpoint 1.7, typed scenario/review 1.4, SQLite 4. Old commands without the optional recommendation remain valid; historical request/receipt/frame bytes are not rewritten. No dependency or table migration.

Generate/check with `backend/.venv/Scripts/python.exe scripts/export_contracts.py [--check]` and `npm run contracts:generate` / `npm run contracts:check` in frontend. See the current D6 decisions and verification under `docs/d6`.
