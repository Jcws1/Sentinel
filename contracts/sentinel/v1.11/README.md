# Sentinel contract package 1.11 — D4 refinement

Coordinated backend/frontend deployment required. Published v1.10 and earlier packages remain unchanged.

| Surface | Version |
| --- | --- |
| World / stream | 1.10 |
| Interactive run / status | 1.7 |
| Command receipt | 1.6 |
| Movement execution read | 1.3 |
| Checkpoint | 1.7 |
| Typed scenario / review | 1.4 |
| SQLite | 4 (unchanged JSON storage) |

New runs use `local-fleet-v2`: persisted configurable 700 m horizontal proximity acquisition, one active pursuer per target, deterministic concurrent allocation, and moving unassigned members. `movementExecutionId` links an unfinished ordinary destination to its stance; `suspendedBy` identifies the pursuit that temporarily owns steering. Switching to Manual or losing a target resumes that destination from its current committed position. Stop disarms and terminates it. The existing `demo-mutual-loss-v1` contact/outcome rule is unchanged.

Optional authoring `profileId` selects one immutable unit profile. World/status `unitProfiles` freezes per-entity identity, speeds, source, variant and reference date. Profile presence does not grant command authority. STING ordinary/pursuit speeds are 170/280 km/h. Untyped units preserve the legacy template speed. Typed revisions/reviews are 1.4; untyped revisions retain their existing version and hash.

Strict legacy frame, scenario, schedule, checkpoint and receipt readers validate their original shapes before in-memory adaptation. A recorded `local-fleet-v1` remains the old clicked-area/held-reserve rule; it is never silently upgraded. Immutable receipts and original recorded bytes are retained. Recovery pauses, advances epoch, clears credentials and interrupts unfinished work without rearming.

Aggregate checks additionally enforce source/binding reservations, destination/pursuit ownership, profile speeds and preserved outcome positions. Visual interpolation is presentation-only and adds no wire observations or stored history samples.

Generate/check: `backend/.venv/Scripts/python.exe scripts/export_contracts.py [--check]`, then `npm run contracts:generate` / `npm run contracts:check` in frontend. Detailed decisions and verification: [D4 refinement](../../../docs/d4-refinement/CONTRACT_DECISIONS.md).
