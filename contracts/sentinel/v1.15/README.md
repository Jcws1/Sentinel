# Sentinel contract package v1.15

Adds typed external-simulation module detail, run status and command summaries.
Existing world/stream, scenario and interactive wire versions retain their
semantics. Frozen external v1 request/response schemas stay separate, including
separate generated frontend module types. No raw external object is a core Entity.

The module uses schemaVersion1.0 and explicitly local policy identity
`sentinel-simulation-v1-local-1`. [Phase5 architecture](../../../docs/phase5-simulation-compatibility/ARCHITECTURE.md)
documents writer ownership, additive SQLite6, strict historical reads, pending
identities and the recording-before-evaluation boundary. Earlier packages remain
frozen; generate/check this package through `scripts/export_contracts.py`.
