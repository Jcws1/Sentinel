# Evidence and cleanup

Archive: `C:/Archive/Coding/Sentinel3-archive/2026-09-20-phase5-simulation-compatibility`.

Baseline and final source, complete successful/failed reports, browser audits,
all performance probes, critic evidence, screenshots and cleanup receipts retain
checkout-relative paths. Final source is under source-after. manifest.json lists
SHA-256/size per file; manifest.sha256 and readback-verification.json verify copying.
cleanup-summary.json is the final explicit disposal and preservation receipt.

Representative final foreground screenshots under the archive:
- frontend/test-results/phase5-simulation-compatibility/phase5-final-external-parent/remote/mapped-tracks.png
- frontend/test-results/phase5-simulation-compatibility/phase5-final-external-parent/exact-retry.png
- frontend/test-results/phase5-simulation-compatibility/phase5-final-external-parent/restart-recorded.png
- frontend/test-results/phase5-simulation-compatibility/phase5-final-external-parent/layout-760.png

preservation-final.json compares all 437 original database artifacts by size and
nanosecond mtime without opening another writer, frozen contracts/assets by hashes,
and baseline file presence. Unrelated research-brain work is excluded from Phase 5
attribution. Operator databases, credentials, preferences/drafts and pending
identities are preserved. Disposable critic/failed-run databases are task-only ZIP
evidence. Generated builds, live profiles and credentials are excluded.
No commit or push.
