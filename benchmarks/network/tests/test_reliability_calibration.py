import importlib.util
import sys
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).parents[1] / "reliability_calibration.py"
SPEC = importlib.util.spec_from_file_location("reliability_calibration", MODULE_PATH)
assert SPEC and SPEC.loader
calibration = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = calibration
SPEC.loader.exec_module(calibration)


def summary() -> dict:
    clients = [
        {"converged": True, "gaps_detected": 0, "fault_drops": 0}
        for _ in range(5)
    ]
    clients[4].update({"gaps_detected": 1, "fault_drops": 1})
    return {
        "producer": {"intended": 100, "accepted": 100, "rejected": 0,
                     "target_rate_per_second": 100, "accepted_rate_per_second": 90},
        "gateway_metrics": {"max_client_queue_depth": 2, "slow_client_disconnects": 1,
                            "observation_latency_us_p99": 100},
        "http_rtt_by_endpoint": {"observation": {"p99_ms": 10}},
        "process_resources": {"samples": 3}, "clients": clients,
        "run": {"forced_disconnects": 1},
    }


class ReliabilityGateTests(unittest.TestCase):
    def test_disabled_disconnect_fault_fails(self):
        item = summary()
        item["run"]["forced_disconnects"] = 0
        checks = calibration.evaluate_scenario(
            item, {"required_fault": "disconnect", "gap_fault": True}
        )
        self.assertFalse(checks["forced_disconnect_occurred_once"])

    def test_missing_slow_reader_overflow_fails(self):
        item = summary()
        item["gateway_metrics"]["slow_client_disconnects"] = 0
        checks = calibration.evaluate_scenario(
            item, {"required_fault": "slow_reader_overflow", "slow_client": 3,
                   "gap_fault": True, "queue_capacity": 8}
        )
        self.assertFalse(checks["server_slow_reader_overflow_occurred"])

    def test_under_delivered_rate_fails(self):
        item = summary()
        item["producer"]["accepted_rate_per_second"] = 40
        checks = calibration.evaluate_scenario(item, {"gap_fault": True})
        self.assertFalse(checks["achieved_rate_at_least_80_percent"])

    def test_missing_queue_metric_fails(self):
        item = summary()
        del item["gateway_metrics"]["max_client_queue_depth"]
        checks = calibration.evaluate_scenario(item, {"gap_fault": True})
        self.assertFalse(checks["queue_high_water_within_capacity"])

    def test_enabled_faults_and_thresholds_pass(self):
        checks = calibration.evaluate_scenario(
            summary(), {"required_fault": "disconnect", "gap_fault": True}
        )
        self.assertTrue(all(checks.values()))


if __name__ == "__main__":
    unittest.main()
