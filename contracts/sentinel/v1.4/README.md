# Sentinel internal contracts 1.4

Deploy the matching backend and frontend together. Strict world/stream 1.3 clients cannot decode this version. Archived `v1`, `v1.1`, `v1.2` and `v1.3` directories remain unchanged.

| Boundary | Current version | Change |
| --- | --- | --- |
| World / stream | 1.4 | New interactive profile and execution-speed values |
| Interactive module / status | 1.3 | `singapore-local-v1` or `singapore-local-v2`; speed must match the run |
| Execution read | 1.2 | Executions retain their persisted profile speed |
| Demo entry | 1.1 | New creations advertise `singapore-local-v2` |
| Receipt | 1.2 | Unchanged; original receipts remain immutable |
| SQLite | 3 | Unchanged tables and original recording bytes |

New demos use a constant horizontal speed of 155 / 3.6 m/s (155 km/h). Explicit legacy-template creation and existing v1 runs retain 20 m/s. The execution field accepts these two exact values, and semantic validation ties the value to the run's template. Fixed-step progress reads the persisted execution value. New v2 missions record `sting-reference-v1` and the selected cruise speed in the existing mission-extension namespace.

The bounded movement geometry, 5 Hz source, supplied WGS84 ellipsoid height, authority, direct-map partial admission/replacement, ordering and receipt reconciliation are unchanged. Published aircraft data is reference metadata; the simulator does not enforce range/endurance, model vertical flight or implement a real aircraft.

Reading an archived world validates its original strict model before adapting it in memory through the existing version chain. `LegacyRtsWorldFrame` and `legacy_rts.py` preserve the 1.3 boundary. A mutable checkpoint adopts interactive 1.3 on its next committed update; journal frames and receipts are never rewritten. Restart still interrupts unfinished execution and restores committed positions in a paused run.

Generate with `backend/.venv/Scripts/python.exe scripts/export_contracts.py` and `npm run contracts:generate` in `frontend`. Runtime schema/semantic validation and contract drift checks consume this directory. External Phase 5 contracts remain independent and unchanged. [Refinement decisions](../../../docs/compact-demo/DECISIONS.md).
