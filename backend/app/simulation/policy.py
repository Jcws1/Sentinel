"""Explicit local interpretation of unresolved external v1 contract questions.

The frozen specification/fixtures remain authoritative. This policy is not an
organiser approval or a physical effects model. See the Phase 5 decision ledger.
"""
POLICY_ID = "sentinel-simulation-v1-local-1"
NAMESPACE = "sentinel.simulation.v1"
WRITER_ID = "simulation-v1"
EARTH_RADIUS_M = 6_371_008.8

# C02/C03: idempotency is checked before consulting this complete local matrix.
TRANSITIONS = {
    None: {"START": "RUNNING", "HOLD": "RUN_NOT_STARTED", "RESUME": "RUN_NOT_HELD", "ABORT": "RUN_NOT_STARTED"},
    "RUNNING": {"START": "RUN_ALREADY_STARTED", "HOLD": "HELD", "RESUME": "RUN_NOT_HELD", "ABORT": "ABORTED"},
    "HELD": {"START": "RUN_ALREADY_STARTED", "HOLD": "HELD", "RESUME": "RUNNING", "ABORT": "ABORTED"},
    "ABORTED": {"START": "RUN_TERMINAL", "HOLD": "RUN_TERMINAL", "RESUME": "RUN_NOT_HELD", "ABORT": "RUN_TERMINAL"},
    "FAILED": {action: "RUN_TERMINAL" for action in ("START", "HOLD", "RESUME", "ABORT")},
}
