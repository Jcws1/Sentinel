# Repository organization and GitHub preparation

Baseline: clean working tree at `60f6a0b` on branch `v3`, 637 tracked files (13.61 MiB). The user chose a private GitHub repository and an external local archive for historical evidence, with concise reports and reusable fixtures retained in source control.

1. Preserve the complete tracked baseline and hash-index historical documents, output, experiments and one-off review scripts before moving them to `../Sentinel3-archive/2026-09-19-repository-cleanup/`.
2. Keep all production frontend/backend modules: a conservative import traversal reaches every production module, including dynamic renderer imports and versioned compatibility readers. Keep frozen schemas, specifications, migrations and Phase-0 verification responsibilities.
3. Extract active test helpers, geometry/scenario fixtures, map-data license notices and the foundation type generator from historical folders. Organize reusable browser/performance tools and give generated results an ignored home outside documentation.
4. Archive superseded docking experiments, phase-specific capture/review scripts and raw historical evidence. Preserve operator databases, browser storage, credentials, recordings and canonical map assets. Historical test databases inside archived evidence travel with their evidence and sidecars; operator databases remain in place.
5. Replace blanket documentation ignoring with explicit generated/local-output ignores. Add current root/package documentation, a documentation index, test instructions, an archive index and a repository hygiene check. Do not invent an open-source license, rewrite Git history, commit or push.
6. Verify required fixture/license availability from a source-only copy, production-module/spec/schema hashes, unit/static/contract checks and relevant browser workflows. Repair stale test setup without weakening assertions. Record any remaining failures honestly.

The archive is a preservation move, not deletion of history. Each moved file is hash-verified. Raw evidence is not a runtime dependency. Future raw runs should use ignored `test-results/` or `.cache/` paths; reusable inputs must be tracked.
