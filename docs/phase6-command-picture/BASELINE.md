# Source and data baseline

HEAD `30414540b89508193ea84c4f8e235362ebd61a37`; the uncommitted Phase 5 source and
unrelated research edits are part of this task's starting tree, not disposable work.
No applicable root/ancestor AGENTS.md was found. Research instructions are confined
to that unrelated subtree, which this task will not edit.

The task inventory records 721 source files, 437 database artifacts (metadata only;
none opened) and hashes of three local environment files without reading their
contents into evidence. Baseline manifest SHA-256:
`ba30047c7fd050b5e8a988afc14767ee528a7de2d70aa104b7e1aac52b61e9d8`.
Raw inventory, exact diff and source-before snapshot are in ignored
`test-results/phase6-command-picture/` pending external archival.

Owners: backend mission service/SQLite single writer; frontend application runtime
owns transport/presentation/selection/history; FlexLayout owns docking; renderer
pool owns maps and independent cameras. Observed history uses a committed frame,
sequence ceiling and recording/epoch identity. Its 5–300 second query limits,
1,000 frames and 2,000 points are retained. Existing event reads paginate by event
sequence but do not pin a recording cutoff. Command receipts and simulation journal
already retain retry identities. External objects stay in their typed module.

At baseline, the application had Command Picture and Vertical Profile placeholders.
ECharts was specified but absent from frontend dependencies. Existing source still
contains the reviewed MSL h≈H visual fallback; it cannot authorize datum mixing.

## Preservation checks during final verification

The preliminary check found all 437 original database artifacts unchanged by size
and nanosecond modification time, all three environment hashes unchanged, no
missing original source file, and all 263 protected historical contracts, fixtures,
reports and images unchanged. The current contract-version index README is an
intentional documentation update, not a frozen contract change.

Several `research-brain/` files changed independently during the task. This phase
does not edit or revert that subtree. Both its starting snapshot and current files
are retained with the source inventory; those unrelated changes are reported
separately rather than falsely described as byte-identical to the task baseline.
Final preservation and the exact tested/reviewed product inventory are checked
again after all task services stop.
