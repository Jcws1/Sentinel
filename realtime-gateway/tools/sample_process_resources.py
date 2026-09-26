#!/usr/bin/env python3
"""Sample one process and the gateway metrics endpoint during reliability runs.

The sampler deliberately stays outside the gateway process.  It can attach to a
PID or launch an already-built executable, writes bounded NDJSON samples, and
emits a compact JSON summary.  It uses only the Python standard library and
supports Windows and Linux.
"""

from __future__ import annotations

import argparse
import ctypes
import json
import math
import os
from pathlib import Path
import statistics
import subprocess
import sys
import time
from typing import Any
from urllib.error import URLError
from urllib.request import urlopen


def percentile(values: list[float], q: float) -> float | None:
    if not values:
        return None
    ordered = sorted(values)
    return ordered[math.ceil((len(ordered) - 1) * q)]


class ProcessReader:
    def sample(self) -> tuple[float, int, int | None]:
        """Return cumulative CPU seconds, resident bytes, private bytes."""
        raise NotImplementedError

    def close(self) -> None:
        pass


class WindowsProcessReader(ProcessReader):
    PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
    PROCESS_VM_READ = 0x0010

    class FILETIME(ctypes.Structure):
        _fields_ = [("low", ctypes.c_uint32), ("high", ctypes.c_uint32)]

    class PROCESS_MEMORY_COUNTERS_EX(ctypes.Structure):
        _fields_ = [
            ("cb", ctypes.c_uint32),
            ("page_fault_count", ctypes.c_uint32),
            ("peak_working_set_size", ctypes.c_size_t),
            ("working_set_size", ctypes.c_size_t),
            ("quota_peak_paged_pool_usage", ctypes.c_size_t),
            ("quota_paged_pool_usage", ctypes.c_size_t),
            ("quota_peak_non_paged_pool_usage", ctypes.c_size_t),
            ("quota_non_paged_pool_usage", ctypes.c_size_t),
            ("pagefile_usage", ctypes.c_size_t),
            ("peak_pagefile_usage", ctypes.c_size_t),
            ("private_usage", ctypes.c_size_t),
        ]

    def __init__(self, pid: int):
        self.kernel32 = ctypes.WinDLL("kernel32", use_last_error=True)
        self.psapi = ctypes.WinDLL("psapi", use_last_error=True)
        self.handle = self.kernel32.OpenProcess(
            self.PROCESS_QUERY_LIMITED_INFORMATION | self.PROCESS_VM_READ,
            False,
            pid,
        )
        if not self.handle:
            raise OSError(ctypes.get_last_error(), f"OpenProcess({pid}) failed")

    @staticmethod
    def _ticks(value: "WindowsProcessReader.FILETIME") -> int:
        return (value.high << 32) | value.low

    def sample(self) -> tuple[float, int, int | None]:
        creation = self.FILETIME()
        exit_time = self.FILETIME()
        kernel = self.FILETIME()
        user = self.FILETIME()
        if not self.kernel32.GetProcessTimes(
            self.handle,
            ctypes.byref(creation),
            ctypes.byref(exit_time),
            ctypes.byref(kernel),
            ctypes.byref(user),
        ):
            raise ProcessLookupError("process exited")
        memory = self.PROCESS_MEMORY_COUNTERS_EX()
        memory.cb = ctypes.sizeof(memory)
        if not self.psapi.GetProcessMemoryInfo(
            self.handle, ctypes.byref(memory), memory.cb
        ):
            raise ProcessLookupError("process exited")
        cpu_seconds = (self._ticks(kernel) + self._ticks(user)) / 10_000_000
        return cpu_seconds, int(memory.working_set_size), int(memory.private_usage)

    def close(self) -> None:
        if self.handle:
            self.kernel32.CloseHandle(self.handle)
            self.handle = None


class LinuxProcessReader(ProcessReader):
    def __init__(self, pid: int):
        self.pid = pid
        self.clock_ticks = os.sysconf("SC_CLK_TCK")
        self.page_size = os.sysconf("SC_PAGE_SIZE")

    def sample(self) -> tuple[float, int, int | None]:
        stat = Path(f"/proc/{self.pid}/stat").read_text(encoding="ascii").split()
        statm = Path(f"/proc/{self.pid}/statm").read_text(encoding="ascii").split()
        cpu_seconds = (int(stat[13]) + int(stat[14])) / self.clock_ticks
        return cpu_seconds, int(statm[1]) * self.page_size, None


def reader_for(pid: int) -> ProcessReader:
    if os.name == "nt":
        return WindowsProcessReader(pid)
    if sys.platform.startswith("linux"):
        return LinuxProcessReader(pid)
    raise RuntimeError(f"unsupported platform: {sys.platform}")


def fetch_metrics(url: str | None, timeout_s: float) -> tuple[dict[str, Any] | None, str | None]:
    if not url:
        return None, None
    try:
        with urlopen(url, timeout=timeout_s) as response:
            return json.load(response), None
    except (OSError, URLError, ValueError) as error:
        return None, type(error).__name__


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--pid", type=int)
    target.add_argument("--command", nargs=argparse.REMAINDER)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--summary", type=Path, required=True)
    parser.add_argument("--metrics-url", default="http://127.0.0.1:8090/metrics")
    parser.add_argument("--interval-ms", type=int, default=250)
    parser.add_argument("--duration-s", type=float)
    parser.add_argument("--max-samples", type=int, default=100_000)
    args = parser.parse_args()
    if args.interval_ms < 10 or args.max_samples < 1:
        parser.error("interval-ms must be >= 10 and max-samples must be positive")
    if args.duration_s is not None and args.duration_s <= 0:
        parser.error("duration-s must be positive")
    if args.command == []:
        parser.error("--command requires an executable")
    return args


def main() -> int:
    args = parse_args()
    child: subprocess.Popen[bytes] | None = None
    if args.command is not None:
        child = subprocess.Popen(args.command)
        pid = child.pid
    else:
        pid = args.pid

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.summary.parent.mkdir(parents=True, exist_ok=True)
    started_wall = time.time()
    started_mono = time.perf_counter()
    previous_cpu: float | None = None
    previous_mono: float | None = None
    samples: list[dict[str, Any]] = []
    metrics_errors = 0
    stop_reason = "max_samples"
    child_terminated_by_sampler = False
    reader = reader_for(pid)
    try:
        with args.output.open("w", encoding="utf-8", newline="\n") as output:
            while len(samples) < args.max_samples:
                now_mono = time.perf_counter()
                elapsed = now_mono - started_mono
                if args.duration_s is not None and elapsed > args.duration_s:
                    stop_reason = "duration_elapsed"
                    break
                if child is not None and child.poll() is not None:
                    stop_reason = "child_exited"
                    break
                try:
                    cpu_seconds, rss_bytes, private_bytes = reader.sample()
                except (OSError, ProcessLookupError, FileNotFoundError):
                    stop_reason = "process_unavailable"
                    break
                cpu_percent = None
                if previous_cpu is not None and previous_mono is not None:
                    wall_delta = now_mono - previous_mono
                    if wall_delta > 0:
                        # 100% means one fully occupied logical CPU, matching
                        # common process-monitor conventions.
                        cpu_percent = 100.0 * (cpu_seconds - previous_cpu) / wall_delta
                previous_cpu, previous_mono = cpu_seconds, now_mono
                gateway, metrics_error = fetch_metrics(
                    args.metrics_url or None,
                    max(0.05, args.interval_ms / 2000),
                )
                if metrics_error:
                    metrics_errors += 1
                sample = {
                    "elapsed_ms": round(elapsed * 1000, 3),
                    "unix_time_ms": round(time.time() * 1000),
                    "pid": pid,
                    "cpu_percent_one_core": None if cpu_percent is None else round(cpu_percent, 3),
                    "rss_bytes": rss_bytes,
                    "private_bytes": private_bytes,
                    "gateway_metrics": gateway,
                    "metrics_error": metrics_error,
                }
                output.write(json.dumps(sample, separators=(",", ":")) + "\n")
                output.flush()
                samples.append(sample)
                remaining = args.interval_ms / 1000 - (time.perf_counter() - now_mono)
                if remaining > 0:
                    time.sleep(remaining)
    finally:
        reader.close()
        if child is not None and child.poll() is None:
            child_terminated_by_sampler = True
            child.terminate()
            try:
                child.wait(timeout=5)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()

    cpus = [s["cpu_percent_one_core"] for s in samples if s["cpu_percent_one_core"] is not None]
    rss = [s["rss_bytes"] for s in samples]
    private = [s["private_bytes"] for s in samples if s["private_bytes"] is not None]
    summary = {
        "schema_version": "sentinel-resource-sample/v1",
        "pid": pid,
        "started_unix_time_ms": round(started_wall * 1000),
        "duration_ms": round((time.perf_counter() - started_mono) * 1000, 3),
        "interval_ms": args.interval_ms,
        "sample_count": len(samples),
        "stop_reason": stop_reason,
        "metrics_fetch_errors": metrics_errors,
        "cpu_percent_one_core": {
            "mean": None if not cpus else round(statistics.fmean(cpus), 3),
            "p95": percentile(cpus, 0.95),
            "max": None if not cpus else max(cpus),
        },
        "rss_bytes": {
            "p95": percentile(rss, 0.95),
            "max": None if not rss else max(rss),
        },
        "private_bytes": {
            "p95": percentile(private, 0.95),
            "max": None if not private else max(private),
        },
        "last_gateway_metrics": next(
            (s["gateway_metrics"] for s in reversed(samples) if s["gateway_metrics"] is not None),
            None,
        ),
        "child_exit_code": None if child is None else child.returncode,
        "child_terminated_by_sampler": child_terminated_by_sampler,
    }
    args.summary.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(summary, indent=2))
    return 0 if samples else 2


if __name__ == "__main__":
    raise SystemExit(main())
