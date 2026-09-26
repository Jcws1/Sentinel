use async_trait::async_trait;
use chrono::{Duration as ChronoDuration, Utc};
use sentinel_behavior_assessment::*;
use serde_json::json;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::Duration,
};

#[derive(Default)]
struct Authority(Mutex<HashMap<(String, String), CurrentTrackAuthority>>);

impl AuthorityReader for Authority {
    fn current(&self, mission_id: &str, track_id: &str) -> Option<CurrentTrackAuthority> {
        self.0
            .lock()
            .unwrap()
            .get(&(mission_id.to_owned(), track_id.to_owned()))
            .cloned()
    }
}

#[derive(Clone)]
struct Worker {
    delay: Duration,
    failure: bool,
}

#[async_trait]
impl InferenceWorker for Worker {
    async fn infer(
        &self,
        request: AssessmentRequest,
    ) -> Result<AssessmentResponse, InferenceError> {
        tokio::time::sleep(self.delay).await;
        if self.failure {
            return Err(InferenceError::Unavailable("synthetic outage".into()));
        }
        Ok(response(&request))
    }
}

fn request() -> AssessmentRequest {
    let captured = Utc::now();
    AssessmentRequest {
        contract_version: CONTRACT_VERSION.into(),
        feature_contract_version: FEATURE_CONTRACT_VERSION.into(),
        request_id: "request-1".into(),
        mission_id: "mission-1".into(),
        mission_epoch: "epoch-1".into(),
        track_id: "track-1".into(),
        track_revision: 7,
        captured_at: captured,
        expires_at: captured + ChronoDuration::seconds(5),
        history: vec![ObservationFeature {
            timestamp_s: 1.0,
            x_m: 1.0,
            y_m: 2.0,
            z_m: 3.0,
            vx_mps: 4.0,
            vy_mps: 5.0,
            vz_mps: 0.0,
            speed_mps: 6.4,
            heading_deg: 51.0,
            track_confidence: 0.9,
            identity_confidence: 0.8,
            sensor_age_s: 0.1,
        }],
        assets: vec![],
    }
}

fn response(request: &AssessmentRequest) -> AssessmentResponse {
    AssessmentResponse {
        contract_version: CONTRACT_VERSION.into(),
        feature_contract_version: FEATURE_CONTRACT_VERSION.into(),
        request_id: request.request_id.clone(),
        mission_id: request.mission_id.clone(),
        mission_epoch: request.mission_epoch.clone(),
        track_id: request.track_id.clone(),
        track_revision: request.track_revision,
        captured_at: request.captured_at,
        expires_at: request.expires_at,
        produced_at: Utc::now(),
        model_version: ALPHA2_MODEL_VERSION.into(),
        artifact_sha256: "00".repeat(32),
        authority: "non_authoritative_decision_support".into(),
        motion: json!({"label":"transiting","confidence":0.8}),
        asset_relations: vec![],
        coordination: json!({"status":"EXPERIMENTAL_DISABLED"}),
        timing_ms: json!({"worker_total":1.0}),
    }
}

fn configured(
    delay: Duration,
    failure: bool,
) -> (AssessmentCoordinator<Worker, Authority>, Arc<Authority>) {
    let authority = Arc::new(Authority::default());
    authority.0.lock().unwrap().insert(
        ("mission-1".into(), "track-1".into()),
        CurrentTrackAuthority {
            mission_epoch: "epoch-1".into(),
            track_revision: 7,
        },
    );
    (
        AssessmentCoordinator::alpha2(
            Arc::new(Worker { delay, failure }),
            authority.clone(),
            Duration::from_millis(100),
        ),
        authority,
    )
}

#[tokio::test]
async fn accepts_only_current_allowlisted_non_authoritative_response() {
    let (coordinator, _) = configured(Duration::ZERO, false);
    assert!(matches!(
        coordinator.assess(request()).await,
        AssessmentDisposition::Accepted(_)
    ));
}

#[tokio::test]
async fn rejects_track_revision_that_advanced_while_worker_ran() {
    let (coordinator, authority) = configured(Duration::from_millis(30), false);
    let handle = coordinator.submit(request());
    authority
        .0
        .lock()
        .unwrap()
        .get_mut(&("mission-1".into(), "track-1".into()))
        .unwrap()
        .track_revision = 8;
    assert_eq!(
        handle.await.unwrap(),
        AssessmentDisposition::Rejected {
            reason: "track_revision_advanced"
        }
    );
}

#[tokio::test]
async fn rejects_epoch_change_expiry_contract_and_model_mismatch() {
    let (coordinator, authority) = configured(Duration::ZERO, false);
    let base = request();

    authority
        .0
        .lock()
        .unwrap()
        .get_mut(&("mission-1".into(), "track-1".into()))
        .unwrap()
        .mission_epoch = "epoch-2".into();
    assert_eq!(
        coordinator.validate(&base, response(&base), Utc::now()),
        AssessmentDisposition::Rejected {
            reason: "mission_epoch_advanced"
        }
    );

    let (coordinator, _) = configured(Duration::ZERO, false);
    assert_eq!(
        coordinator.validate(
            &base,
            response(&base),
            base.expires_at + ChronoDuration::milliseconds(1),
        ),
        AssessmentDisposition::Rejected {
            reason: "assessment_expired"
        }
    );
    let mut wrong_contract = response(&base);
    wrong_contract.feature_contract_version = "unsupported".into();
    assert_eq!(
        coordinator.validate(&base, wrong_contract, Utc::now()),
        AssessmentDisposition::Rejected {
            reason: "unsupported_response_contract"
        }
    );
    let mut wrong_model = response(&base);
    wrong_model.model_version = "3.0.0-alpha.1".into();
    assert_eq!(
        coordinator.validate(&base, wrong_model, Utc::now()),
        AssessmentDisposition::Rejected {
            reason: "model_version_not_allowed"
        }
    );
}

#[tokio::test]
async fn worker_failure_and_timeout_are_isolated_from_authoritative_state() {
    let (failed, authority) = configured(Duration::ZERO, true);
    assert!(matches!(
        failed.assess(request()).await,
        AssessmentDisposition::Unavailable { .. }
    ));
    assert_eq!(
        authority
            .current("mission-1", "track-1")
            .unwrap()
            .track_revision,
        7
    );

    let (slow, authority) = configured(Duration::from_secs(1), false);
    let handle = slow.submit(request());
    authority
        .0
        .lock()
        .unwrap()
        .get_mut(&("mission-1".into(), "track-1".into()))
        .unwrap()
        .track_revision = 8;
    assert!(matches!(
        handle.await.unwrap(),
        AssessmentDisposition::Unavailable { .. }
    ));
    assert_eq!(
        authority
            .current("mission-1", "track-1")
            .unwrap()
            .track_revision,
        8
    );
}
