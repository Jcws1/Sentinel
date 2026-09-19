# Capacity package v1.13

The current scenario writer accepts at most 40 total placements and 32 Sentinel-controlled placements. A saved revision with more than 32 placements uses scenario schemaVersion 1.5; its review uses 1.5 as well. Smaller revisions retain their existing content-derived version and hashes. The 20 Friendly / 20 Hostile workload uses 20 controlled Friendly actors and 20 scripted observation-only Hostile actors.

World/stream version 1.10, interactive versions, control batches (32), execution limits (64) and script-action limit (128) are unchanged. This package introduces no new movement or combat semantics. Archived contract packages remain unchanged and are still used by strict versioned readers.

Regenerate with `backend/.venv/Scripts/python.exe scripts/export_contracts.py`, then run `npm run contracts:generate` in `frontend`.
