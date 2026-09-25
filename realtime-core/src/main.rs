use std::collections::BTreeMap;
use std::env;
use std::fs::{self, File};
use std::io::{BufWriter, Write};
use std::path::PathBuf;
use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::{Duration, Instant};

#[derive(Clone, Copy, Debug)]
struct Measurement {
    track_id: u32,
    sequence: u64,
    source_time_ns: u64,
    x_mm: i64,
    y_mm: i64,
    vx_mm_s: i32,
    vy_mm_s: i32,
}

#[derive(Clone, Copy, Debug, Default)]
struct TrackState {
    sequence: u64,
    source_time_ns: u64,
    x_mm: i64,
    y_mm: i64,
    vx_mm_s: i32,
    vy_mm_s: i32,
}

enum WorkerMessage {
    Measurement(Measurement),
    Snapshot(Sender<Vec<(u32, TrackState)>>),
    Shutdown,
}

#[derive(Clone, Debug)]
struct Config {
    drones: u32,
    hz: u32,
    seconds: u32,
    partitions: usize,
    warmup_ticks: u32,
    output: PathBuf,
}

impl Config {
    fn parse() -> Result<Self, String> {
        let mut config = Self {
            drones: 3,
            hz: 10,
            seconds: 10,
            partitions: 4,
            warmup_ticks: 20,
            output: PathBuf::from("target/realtime-benchmark.json"),
        };
        let mut args = env::args().skip(1);
        while let Some(flag) = args.next() {
            let value = args
                .next()
                .ok_or_else(|| format!("missing value for {flag}"))?;
            match flag.as_str() {
                "--drones" => config.drones = parse(&flag, &value)?,
                "--hz" => config.hz = parse(&flag, &value)?,
                "--seconds" => config.seconds = parse(&flag, &value)?,
                "--partitions" => config.partitions = parse(&flag, &value)?,
                "--warmup-ticks" => config.warmup_ticks = parse(&flag, &value)?,
                "--output" => config.output = PathBuf::from(value),
                _ => return Err(format!("unknown argument {flag}")),
            }
        }
        if config.drones == 0 || config.hz == 0 || config.seconds == 0 || config.partitions == 0 {
            return Err("drones, hz, seconds and partitions must be positive".into());
        }
        Ok(config)
    }
}

fn parse<T: std::str::FromStr>(flag: &str, value: &str) -> Result<T, String> {
    value
        .parse()
        .map_err(|_| format!("invalid value for {flag}: {value}"))
}

fn worker(receiver: Receiver<WorkerMessage>, revision_sender: Sender<(u32, u64)>) {
    let mut tracks: BTreeMap<u32, TrackState> = BTreeMap::new();
    while let Ok(message) = receiver.recv() {
        match message {
            WorkerMessage::Measurement(measurement) => {
                let current = tracks.entry(measurement.track_id).or_default();
                if measurement.sequence > current.sequence {
                    *current = TrackState {
                        sequence: measurement.sequence,
                        source_time_ns: measurement.source_time_ns,
                        x_mm: measurement.x_mm,
                        y_mm: measurement.y_mm,
                        vx_mm_s: measurement.vx_mm_s,
                        vy_mm_s: measurement.vy_mm_s,
                    };
                }
                revision_sender
                    .send((measurement.track_id, current.sequence))
                    .expect("aggregator remains alive");
            }
            WorkerMessage::Snapshot(reply) => {
                reply
                    .send(tracks.iter().map(|(id, state)| (*id, *state)).collect())
                    .expect("snapshot requester remains alive");
            }
            WorkerMessage::Shutdown => break,
        }
    }
}

fn stable_partition(track_id: u32, partitions: usize) -> usize {
    let mut value = track_id as u64;
    value ^= value >> 16;
    value = value.wrapping_mul(0x7feb_352d);
    value ^= value >> 15;
    value = value.wrapping_mul(0x846c_a68b);
    value ^= value >> 16;
    value as usize % partitions
}

fn measurement(track_id: u32, sequence: u64, hz: u32) -> Measurement {
    let source_time_ns = sequence * 1_000_000_000 / hz as u64;
    let phase = track_id as i64 * 17;
    Measurement {
        track_id,
        sequence,
        source_time_ns,
        x_mm: phase * 1_000 + sequence as i64 * (700 + track_id as i64),
        y_mm: phase * -500 + sequence as i64 * (350 - track_id as i64),
        vx_mm_s: 700 + track_id as i32,
        vy_mm_s: 350 - track_id as i32,
    }
}

fn percentile(values: &[f64], percentile: f64) -> f64 {
    let index = ((values.len() - 1) as f64 * percentile).ceil() as usize;
    values[index]
}

fn canonical_hash(snapshots: &mut Vec<(u32, TrackState)>) -> u64 {
    snapshots.sort_by_key(|(track_id, _)| *track_id);
    let mut hash = 0xcbf2_9ce4_8422_2325_u64;
    for (track_id, state) in snapshots {
        for bytes in [
            track_id.to_le_bytes().as_slice(),
            state.sequence.to_le_bytes().as_slice(),
            state.source_time_ns.to_le_bytes().as_slice(),
            state.x_mm.to_le_bytes().as_slice(),
            state.y_mm.to_le_bytes().as_slice(),
            state.vx_mm_s.to_le_bytes().as_slice(),
            state.vy_mm_s.to_le_bytes().as_slice(),
        ] {
            for byte in bytes {
                hash ^= *byte as u64;
                hash = hash.wrapping_mul(0x100_0000_01b3);
            }
        }
    }
    hash
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let config = Config::parse().map_err(|error| format!("argument error: {error}"))?;
    if let Some(parent) = config.output.parent() {
        fs::create_dir_all(parent)?;
    }

    let (revision_sender, revision_receiver) = mpsc::channel::<(u32, u64)>();
    let mut worker_senders = Vec::with_capacity(config.partitions);
    let mut worker_handles = Vec::with_capacity(config.partitions);
    for _ in 0..config.partitions {
        let (sender, receiver) = mpsc::channel();
        let revisions = revision_sender.clone();
        worker_senders.push(sender);
        worker_handles.push(thread::spawn(move || worker(receiver, revisions)));
    }
    drop(revision_sender);

    for sequence in 1..=config.warmup_ticks as u64 {
        for track_id in 1..=config.drones {
            let item = measurement(track_id, sequence, config.hz);
            worker_senders[stable_partition(track_id, config.partitions)]
                .send(WorkerMessage::Measurement(item))?;
        }
        for _ in 0..config.drones {
            revision_receiver.recv()?;
        }
    }

    let tick_count = config.hz * config.seconds;
    let start_sequence = config.warmup_ticks as u64 + 1;
    let mut tick_latencies_ms = Vec::with_capacity(tick_count as usize);
    let log_path = config.output.with_extension("events.bin");
    let mut log = BufWriter::with_capacity(1024 * 1024, File::create(&log_path)?);
    let run_start = Instant::now();

    for offset in 0..tick_count as u64 {
        let sequence = start_sequence + offset;
        let tick_start = Instant::now();
        for track_id in 1..=config.drones {
            let item = measurement(track_id, sequence, config.hz);
            worker_senders[stable_partition(track_id, config.partitions)]
                .send(WorkerMessage::Measurement(item))?;
            log.write_all(&track_id.to_le_bytes())?;
            log.write_all(&sequence.to_le_bytes())?;
            log.write_all(&item.source_time_ns.to_le_bytes())?;
            log.write_all(&item.x_mm.to_le_bytes())?;
            log.write_all(&item.y_mm.to_le_bytes())?;
        }
        for _ in 0..config.drones {
            revision_receiver.recv()?;
        }
        if sequence.is_multiple_of(config.hz as u64) {
            log.flush()?;
        }
        tick_latencies_ms.push(tick_start.elapsed().as_secs_f64() * 1000.0);
    }
    log.flush()?;
    let elapsed = run_start.elapsed();

    let mut snapshots = Vec::with_capacity(config.drones as usize);
    for sender in &worker_senders {
        let (reply_sender, reply_receiver) = mpsc::channel();
        sender.send(WorkerMessage::Snapshot(reply_sender))?;
        snapshots.extend(reply_receiver.recv()?);
    }
    let state_hash = canonical_hash(&mut snapshots);
    for sender in &worker_senders {
        sender.send(WorkerMessage::Shutdown)?;
    }
    for handle in worker_handles {
        handle.join().expect("worker did not panic");
    }

    tick_latencies_ms.sort_by(f64::total_cmp);
    let total_measurements = tick_count as u64 * config.drones as u64;
    let elapsed_seconds = elapsed
        .as_secs_f64()
        .max(Duration::from_nanos(1).as_secs_f64());
    let median = percentile(&tick_latencies_ms, 0.50);
    let p95 = percentile(&tick_latencies_ms, 0.95);
    let p99 = percentile(&tick_latencies_ms, 0.99);
    let maximum = *tick_latencies_ms.last().expect("positive tick count");
    let result = format!(
        concat!(
            "{{\n",
            "  \"implementation\": \"rust-std-keyed-partitions\",\n",
            "  \"drones\": {},\n",
            "  \"hzPerDrone\": {},\n",
            "  \"seconds\": {},\n",
            "  \"partitions\": {},\n",
            "  \"ticks\": {},\n",
            "  \"measurements\": {},\n",
            "  \"elapsedMs\": {:.6},\n",
            "  \"measurementsPerSecond\": {:.3},\n",
            "  \"tickLatencyMs\": {{\"median\": {:.6}, \"p95\": {:.6}, \"p99\": {:.6}, \"max\": {:.6}}},\n",
            "  \"finalTrackCount\": {},\n",
            "  \"finalSequence\": {},\n",
            "  \"canonicalStateHash\": \"{:016x}\",\n",
            "  \"eventLogBytes\": {}\n",
            "}}\n"
        ),
        config.drones,
        config.hz,
        config.seconds,
        config.partitions,
        tick_count,
        total_measurements,
        elapsed.as_secs_f64() * 1000.0,
        total_measurements as f64 / elapsed_seconds,
        median,
        p95,
        p99,
        maximum,
        snapshots.len(),
        start_sequence + tick_count as u64 - 1,
        state_hash,
        fs::metadata(&log_path)?.len(),
    );
    fs::write(&config.output, &result)?;
    print!("{result}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stable_partition_is_repeatable_and_bounded() {
        for track_id in 1..=10_000 {
            let first = stable_partition(track_id, 7);
            assert_eq!(first, stable_partition(track_id, 7));
            assert!(first < 7);
        }
    }

    #[test]
    fn canonical_hash_does_not_depend_on_partition_order() {
        let a = TrackState {
            sequence: 2,
            source_time_ns: 4,
            x_mm: 6,
            y_mm: 8,
            vx_mm_s: 10,
            vy_mm_s: 12,
        };
        let b = TrackState {
            sequence: 3,
            source_time_ns: 5,
            x_mm: 7,
            y_mm: 9,
            vx_mm_s: 11,
            vy_mm_s: 13,
        };
        assert_eq!(
            canonical_hash(&mut vec![(1, a), (2, b)]),
            canonical_hash(&mut vec![(2, b), (1, a)])
        );
    }
}
