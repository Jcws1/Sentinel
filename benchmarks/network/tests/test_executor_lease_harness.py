import importlib.util
import sys
import unittest
from pathlib import Path


NETWORK_DIR = Path(__file__).parents[1]
sys.path.insert(0, str(NETWORK_DIR))
MODULE_PATH = NETWORK_DIR / "executor_lease_harness.py"
SPEC = importlib.util.spec_from_file_location("executor_lease_harness", MODULE_PATH)
assert SPEC and SPEC.loader
lease = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = lease
SPEC.loader.exec_module(lease)


class ExecutorLeaseHarnessTests(unittest.TestCase):
    def test_completion_is_bound_to_worker_and_token(self):
        command = lease.net.command_fixture("epoch", 1, "lease-1")
        result = lease.completion_body(
            command, {"worker_id": "worker-a", "lease_token": "token-a"}
        )
        self.assertEqual(result["worker_id"], "worker-a")
        self.assertEqual(result["lease_token"], "token-a")
        self.assertEqual(result["outcome_id"], "harness-outcome-lease-1")

    def test_evaluate_accepts_single_winner_reclaim_and_restart(self):
        outcome = {"outcome_id": "harness-outcome-lease-1", "status": "succeeded"}
        checks = lease.evaluate(
            [
                {"http_status": 200, "body": {"claim": {
                    "lease_token": "old", "worker_id": "a", "attempt_count": 1
                }}},
                {"http_status": 204, "body": {}},
            ],
            {"http_status": 200, "body": {"claim": {
                "lease_token": "new", "worker_id": "c", "attempt_count": 2
            }}},
            {"http_status": 409, "body": {"error": "lease_not_current"}},
            {"http_status": 201, "body": outcome},
            {"http_status": 200, "body": outcome},
            {"http_status": 200, "body": {"outcome": outcome}},
            {"http_status": 200, "body": {"outcome": outcome}},
            {"http_status": 204, "body": {}},
        )
        self.assertTrue(checks["passed"])

    def test_evaluate_rejects_two_race_winners(self):
        winner = {"http_status": 200, "body": {"claim": {
            "lease_token": "t", "worker_id": "a", "attempt_count": 1
        }}}
        checks = lease.evaluate(
            [winner, winner], winner,
            {"http_status": 409, "body": {"error": "lease_not_current"}},
            {"http_status": 201, "body": {}}, {"http_status": 200, "body": {}},
            {"http_status": 200, "body": {"outcome": {}}},
            {"http_status": 200, "body": {"outcome": {}}},
            {"http_status": 204, "body": {}},
        )
        self.assertFalse(checks["race_has_exactly_one_winner"])
        self.assertFalse(checks["passed"])


if __name__ == "__main__":
    unittest.main()
