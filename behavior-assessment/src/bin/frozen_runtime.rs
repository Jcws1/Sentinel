use chrono::{Duration as ChronoDuration, Utc};
use sentinel_behavior_assessment::*;
use serde::Serialize;
use std::{
    collections::HashMap,
    env, fs,
    sync::Arc,
    time::{Duration, Instant},
};

struct FixtureAuthority(HashMap<(String, String), CurrentTrackAuthority>);

impl AuthorityReader for FixtureAuthority {
    fn current(&self, mission_id: &str, track_id: &str) -> Option<CurrentTrackAuthority> {
        self.0
            .get(&(mission_id.to_owned(), track_id.to_owned()))
            .cloned()
    }
}

#[derive(Serialize)]
struct Profile {
    tracks: usize,
    required_updates_per_second: usize,
    runs_ms: Vec<f64>,
    p50_ms: f64,
    p95_ms: f64,
    p99_ms: f64,
    max_ms: f64,
    median_completion_rate_per_second: f64,
}

fn percentile(values: &[f64], q: f64) -> f64 {
    let mut ordered = values.to_vec();
    ordered.sort_by(f64::total_cmp);
    let index = ((ordered.len() as f64 * q).ceil() as usize)
        .saturating_sub(1)
        .min(ordered.len() - 1);
    ordered[index]
}

#[tokio::main]
async fn main() {
    let args: Vec<String> = env::args().collect();
    assert_eq!(
        args.len(),
        4,
        "usage: frozen_runtime FIXTURE ENDPOINT OUTPUT"
    );
    let fixture: Vec<AssessmentRequest> =
        serde_json::from_slice(&fs::read(&args[1]).unwrap()).unwrap();
    let endpoint = args[2].parse().unwrap();
    let authority = FixtureAuthority(
        fixture
            .iter()
            .map(|request| {
                (
                    (request.mission_id.clone(), request.track_id.clone()),
                    CurrentTrackAuthority {
                        mission_epoch: request.mission_epoch.clone(),
                        track_revision: request.track_revision,
                    },
                )
            })
            .collect(),
    );
    let worker = Arc::new(HttpInferenceWorker::new(endpoint).unwrap());
    let coordinator =
        AssessmentCoordinator::alpha2(worker, Arc::new(authority), Duration::from_secs(120));
    let mut profiles = Vec::new();
    for tracks in [3usize, 10, 30, 100] {
        let mut measured = Vec::new();
        for run in 0..13 {
            let now = Utc::now();
            let mut batch = fixture[..tracks].to_vec();
            for (index, request) in batch.iter_mut().enumerate() {
                request.request_id = format!("rust-{tracks}-{run}-{index}");
                request.captured_at = now;
                request.expires_at = now + ChronoDuration::minutes(5);
            }
            let started = Instant::now();
            let results = coordinator.assess_batch(batch).await;
            let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
            assert!(
                results
                    .iter()
                    .all(|result| matches!(result, AssessmentDisposition::Accepted(_)))
            );
            if run >= 3 {
                measured.push(elapsed_ms);
            }
        }
        let mut ordered = measured.clone();
        ordered.sort_by(f64::total_cmp);
        let p50 = (ordered[4] + ordered[5]) / 2.0;
        profiles.push(Profile {
            tracks,
            required_updates_per_second: tracks * 2,
            runs_ms: measured.clone(),
            p50_ms: p50,
            p95_ms: percentile(&measured, 0.95),
            p99_ms: percentile(&measured, 0.99),
            max_ms: measured.iter().copied().fold(0.0, f64::max),
            median_completion_rate_per_second: tracks as f64 / (p50 / 1000.0),
        });
    }
    let report = serde_json::json!({
        "schema": "sentinel.frozen-v1-runtime/v1",
        "candidate": "rust-coordinator-alpha2",
        "transport": "Rust reqwest loopback HTTP JSON batch plus response freshness validation",
        "warmups_per_profile": 3,
        "measurement_runs_per_profile": 10,
        "profiles": profiles,
    });
    fs::write(&args[3], serde_json::to_vec_pretty(&report).unwrap()).unwrap();
    println!("{}", serde_json::to_string_pretty(&report).unwrap());
}
