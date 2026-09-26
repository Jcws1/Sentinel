use chrono::{Duration as ChronoDuration, Utc};
use sentinel_behavior_assessment::*;
use std::{sync::Arc, time::Duration};

struct FixedAuthority;

impl AuthorityReader for FixedAuthority {
    fn current(&self, mission_id: &str, track_id: &str) -> Option<CurrentTrackAuthority> {
        (mission_id == "mission-live" && track_id == "track-live").then(|| CurrentTrackAuthority {
            mission_epoch: "epoch-live".into(),
            track_revision: 30,
        })
    }
}

#[tokio::test]
#[ignore = "requires the local Alpha.2 worker"]
async fn rust_contract_accepts_fresh_real_alpha2_response() {
    let endpoint = std::env::var("SENTINEL_ALPHA2_ENDPOINT")
        .unwrap_or_else(|_| "http://127.0.0.1:8091/v1/infer".into())
        .parse()
        .unwrap();
    let worker = Arc::new(HttpInferenceWorker::new(endpoint).unwrap());
    let coordinator =
        AssessmentCoordinator::alpha2(worker, Arc::new(FixedAuthority), Duration::from_secs(10));
    let captured_at = Utc::now();
    let history = (0..30)
        .map(|index| ObservationFeature {
            timestamp_s: index as f64 * 0.5,
            x_m: 200.0 - index as f64 * 2.0,
            y_m: 10.0,
            z_m: 80.0,
            vx_mps: -4.0,
            vy_mps: 0.0,
            vz_mps: 0.0,
            speed_mps: 4.0,
            heading_deg: 270.0,
            track_confidence: 0.91,
            identity_confidence: 0.82,
            sensor_age_s: 0.12,
        })
        .collect();
    let request = AssessmentRequest {
        contract_version: CONTRACT_VERSION.into(),
        feature_contract_version: FEATURE_CONTRACT_VERSION.into(),
        request_id: "rust-live-request".into(),
        mission_id: "mission-live".into(),
        mission_epoch: "epoch-live".into(),
        track_id: "track-live".into(),
        track_revision: 30,
        captured_at,
        expires_at: captured_at + ChronoDuration::seconds(10),
        history,
        assets: vec![ProtectedAsset {
            asset_id: "asset-live".into(),
            x_m: 0.0,
            y_m: 0.0,
            protected_radius_m: 25.0,
            monitoring_radius_m: 750.0,
        }],
    };
    let AssessmentDisposition::Accepted(response) = coordinator.assess(request).await else {
        panic!("fresh Alpha.2 response was not accepted")
    };
    assert_eq!(response.model_version, ALPHA2_MODEL_VERSION);
    assert_eq!(response.authority, "non_authoritative_decision_support");
    assert_eq!(response.coordination["status"], "EXPERIMENTAL_DISABLED");
}
