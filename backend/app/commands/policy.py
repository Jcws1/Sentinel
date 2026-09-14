"""Admission and accepted-work guards; no movement engine or encounter resolver."""

TRANSITIONS = {("ready", "start"): "running", ("running", "pause"): "paused", ("paused", "resume"): "running",
               ("ready", "end"): "ended", ("running", "end"): "ended", ("paused", "end"): "ended"}


def accepted_work_state(*, run_state, accepted_epoch, current_epoch, accepted_grant_revision,
                        current_grant_revision, cancelled, deadline, now, started):
    """Lease is intentionally absent: expiry gates admission, not accepted work.

    Later handlers use this result inside the same mission transaction. Deadlines
    are initial execution/evaluation deadlines, not maximum execution durations.
    """
    if accepted_epoch != current_epoch:
        return "Interrupted"
    if cancelled or accepted_grant_revision != current_grant_revision or run_state == "ended":
        return "Cancelled"
    if not started and now >= deadline:
        return "Expired"
    return "Suspended" if run_state != "running" else "Eligible"
