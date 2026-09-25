"""Python control for the isolated Rust keyed-partition benchmark.

This is deliberately independent of Sentinel's application backend. It runs the
same deterministic workload and state/hash rules as realtime-core so language
and runtime overhead can be compared without comparing different products.
"""

from __future__ import annotations

import argparse
import json
import queue
import struct
import threading
import time
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True, slots=True)
class Measurement:
    track_id: int
    sequence: int
    source_time_ns: int
    x_mm: int
    y_mm: int
    vx_mm_s: int
    vy_mm_s: int


@dataclass(frozen=True, slots=True)
class TrackState:
    sequence: int
    source_time_ns: int
    x_mm: int
    y_mm: int
    vx_mm_s: int
    vy_mm_s: int


def stable_partition(track_id: int, partitions: int) -> int:
    value = track_id & 0xFFFFFFFFFFFFFFFF
    value ^= value >> 16
    value = value * 0x7FEB352D & 0xFFFFFFFFFFFFFFFF
    value ^= value >> 15
    value = value * 0x846CA68B & 0xFFFFFFFFFFFFFFFF
    value ^= value >> 16
    return value % partitions


def generate(track_id: int, sequence: int, hz: int) -> Measurement:
    phase = track_id * 17
    return Measurement(
        track_id=track_id,
        sequence=sequence,
        source_time_ns=sequence * 1_000_000_000 // hz,
        x_mm=phase * 1_000 + sequence * (700 + track_id),
        y_mm=phase * -500 + sequence * (350 - track_id),
        vx_mm_s=700 + track_id,
        vy_mm_s=350 - track_id,
    )


def worker(inbox: queue.Queue, revisions: queue.Queue) -> None:
    tracks: dict[int, TrackState] = {}
    while True:
        message = inbox.get()
        kind = message[0]
        if kind == "measurement":
            item: Measurement = message[1]
            current = tracks.get(item.track_id)
            if current is None or item.sequence > current.sequence:
                current = TrackState(
                    sequence=item.sequence,
                    source_time_ns=item.source_time_ns,
                    x_mm=item.x_mm,
                    y_mm=item.y_mm,
                    vx_mm_s=item.vx_mm_s,
                    vy_mm_s=item.vy_mm_s,
                )
                tracks[item.track_id] = current
            revisions.put((item.track_id, current.sequence))
        elif kind == "snapshot":
            message[1].put(list(tracks.items()))
        else:
            return


def canonical_hash(snapshots: list[tuple[int, TrackState]]) -> str:
    value = 0xCBF29CE484222325
    for track_id, state in sorted(snapshots):
        fields = (
            struct.pack("<I", track_id),
            struct.pack("<Q", state.sequence),
            struct.pack("<Q", state.source_time_ns),
            struct.pack("<q", state.x_mm),
            struct.pack("<q", state.y_mm),
            struct.pack("<i", state.vx_mm_s),
            struct.pack("<i", state.vy_mm_s),
        )
        for field in fields:
            for byte in field:
                value ^= byte
                value = value * 0x100000001B3 & 0xFFFFFFFFFFFFFFFF
    return f"{value:016x}"


def percentile(values: list[float], fraction: float) -> float:
    index = int((len(values) - 1) * fraction)
    if index < (len(values) - 1) * fraction:
        index += 1
    return values[index]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--drones", type=int, default=3)
    parser.add_argument("--hz", type=int, default=10)
    parser.add_argument("--seconds", type=int, default=10)
    parser.add_argument("--partitions", type=int, default=4)
    parser.add_argument("--warmup-ticks", type=int, default=20)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    if min(args.drones, args.hz, args.seconds, args.partitions) <= 0:
        raise SystemExit("drones, hz, seconds and partitions must be positive")

    revisions: queue.Queue = queue.Queue()
    inboxes = [queue.Queue() for _ in range(args.partitions)]
    threads = [threading.Thread(target=worker, args=(inbox, revisions)) for inbox in inboxes]
    for thread in threads:
        thread.start()

    for sequence in range(1, args.warmup_ticks + 1):
        for track_id in range(1, args.drones + 1):
            item = generate(track_id, sequence, args.hz)
            inboxes[stable_partition(track_id, args.partitions)].put(("measurement", item))
        for _ in range(args.drones):
            revisions.get()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    log_path = args.output.with_suffix(".events.bin")
    ticks = args.hz * args.seconds
    latencies: list[float] = []
    start_sequence = args.warmup_ticks + 1
    run_start = time.perf_counter()
    with log_path.open("wb", buffering=1024 * 1024) as event_log:
        for offset in range(ticks):
            sequence = start_sequence + offset
            tick_start = time.perf_counter()
            for track_id in range(1, args.drones + 1):
                item = generate(track_id, sequence, args.hz)
                inboxes[stable_partition(track_id, args.partitions)].put(("measurement", item))
                event_log.write(
                    struct.pack("<IQQqq", track_id, sequence, item.source_time_ns, item.x_mm, item.y_mm)
                )
            for _ in range(args.drones):
                revisions.get()
            if sequence % args.hz == 0:
                event_log.flush()
            latencies.append((time.perf_counter() - tick_start) * 1000)
    elapsed = time.perf_counter() - run_start

    snapshots: list[tuple[int, TrackState]] = []
    for inbox in inboxes:
        reply: queue.Queue = queue.Queue()
        inbox.put(("snapshot", reply))
        snapshots.extend(reply.get())
        inbox.put(("shutdown",))
    for thread in threads:
        thread.join()

    latencies.sort()
    measurements = ticks * args.drones
    result = {
        "implementation": "python-threaded-keyed-partitions",
        "drones": args.drones,
        "hzPerDrone": args.hz,
        "seconds": args.seconds,
        "partitions": args.partitions,
        "ticks": ticks,
        "measurements": measurements,
        "elapsedMs": elapsed * 1000,
        "measurementsPerSecond": measurements / elapsed,
        "tickLatencyMs": {
            "median": percentile(latencies, 0.50),
            "p95": percentile(latencies, 0.95),
            "p99": percentile(latencies, 0.99),
            "max": max(latencies),
        },
        "finalTrackCount": len(snapshots),
        "finalSequence": start_sequence + ticks - 1,
        "canonicalStateHash": canonical_hash(snapshots),
        "eventLogBytes": log_path.stat().st_size,
    }
    args.output.write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result))


if __name__ == "__main__":
    main()

