use std::{env, fs, path::PathBuf};

use chrono::{DateTime, Duration, Utc};
use sentinel_interceptor_providers::{
    AuthorityProof, ConstraintSet, Correlation, DispatchContext, ExternalOperationState,
    InterceptCommand, InterceptIntent, InterceptorProvider, LocalContactReport,
    LocalSimulatorAdapter, ProviderId, SafetyGateInput, SubmitDisposition, TargetRef,
    validate_safety_gate,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};

fn input(name: &str) -> PathBuf {
    PathBuf::from(env::var(name).unwrap_or_else(|_| panic!("{name} must name an evidence file")))
}

fn read_json(name: &str) -> Value {
    serde_json::from_slice(&fs::read(input(name)).expect("read evidence file"))
        .expect("parse evidence JSON")
}

fn sha256(path: &PathBuf) -> String {
    format!(
        "{:x}",
        Sha256::digest(fs::read(path).expect("hash evidence file"))
    )
}

fn cited_ids(assessment: &Value) -> Vec<&str> {
    assessment["observations"]
        .as_array()
        .into_iter()
        .flatten()
        .chain(assessment["orientation"].as_array().into_iter().flatten())
        .flat_map(|finding| {
            finding["evidenceIds"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(Value::as_str)
        })
        .collect()
}

/// Deterministic local kinematics used only after the hosted NLP recommendation
/// and explicit operator confirmation. Success is reported to the provider only
/// when the simulated positions satisfy the contact radius.
fn run_contact_simulation(operation_id: &str, start: DateTime<Utc>) -> (LocalContactReport, Value) {
    let dt_s = 0.25;
    let interceptor_speed_m_s = 80.0;
    let target_velocity_m_s = [15.0, 4.0, 0.0];
    let mut interceptor = [0.0, 0.0, 150.0];
    let mut target = [1_000.0, 100.0, 150.0];
    let contact_radius_m = 5.0;
    let mut samples = Vec::new();

    for tick in 1..=2_400_u64 {
        for axis in 0..3 {
            target[axis] += target_velocity_m_s[axis] * dt_s;
        }
        let delta = [
            target[0] - interceptor[0],
            target[1] - interceptor[1],
            target[2] - interceptor[2],
        ];
        let distance = delta.iter().map(|value| value * value).sum::<f64>().sqrt();
        let step = (interceptor_speed_m_s * dt_s).min(distance);
        if distance > 0.0 {
            for axis in 0..3 {
                interceptor[axis] += delta[axis] / distance * step;
            }
        }
        let separation_m = interceptor
            .iter()
            .zip(target.iter())
            .map(|(a, b)| (a - b).powi(2))
            .sum::<f64>()
            .sqrt();
        samples.push(json!({
            "tick": tick,
            "elapsedSeconds": tick as f64 * dt_s,
            "interceptorPositionM": interceptor,
            "targetPositionM": target,
            "separationM": separation_m
        }));
        if separation_m <= contact_radius_m {
            let evidence_id = format!("local-simulator:contact:{operation_id}:tick:{tick}");
            let report = LocalContactReport {
                operation_id: operation_id.into(),
                evidence_id,
                observed_at: start + Duration::milliseconds((tick as f64 * dt_s * 1_000.0) as i64),
                interceptor_position_m: interceptor,
                target_position_m: target,
            };
            return (
                report,
                json!({
                    "model": "deterministic-pursuit-v1",
                    "dtSeconds": dt_s,
                    "interceptorSpeedMps": interceptor_speed_m_s,
                    "targetVelocityMps": target_velocity_m_s,
                    "contactRadiusM": contact_radius_m,
                    "samples": samples
                }),
            );
        }
    }
    panic!("simulated interceptor did not reach contact");
}

#[tokio::test]
#[ignore = "requires fresh hosted NLP evidence and explicit operator confirmation"]
async fn grounded_nlp_recommendation_confirmed_command_reaches_simulated_contact() {
    let world_path = input("SENTINEL_PROOF_WORLD");
    let request_path = input("SENTINEL_PROOF_REQUEST");
    let assessment_path = input("SENTINEL_PROOF_ASSESSMENT");
    let recommendation_path = input("SENTINEL_PROOF_RECOMMENDATION");
    let confirmation_path = input("SENTINEL_PROOF_CONFIRMATION");
    let manifest = read_json("SENTINEL_PROOF_MANIFEST");
    let world: Value = serde_json::from_slice(&fs::read(&world_path).unwrap()).unwrap();
    let assessment: Value = serde_json::from_slice(&fs::read(&assessment_path).unwrap()).unwrap();
    let recommendation: Value =
        serde_json::from_slice(&fs::read(&recommendation_path).unwrap()).unwrap();
    let confirmation: Value =
        serde_json::from_slice(&fs::read(&confirmation_path).unwrap()).unwrap();
    let output = input("SENTINEL_PROOF_TRACE");

    assert!(
        manifest["baseUrl"]
            .as_str()
            .unwrap()
            .starts_with("https://")
    );
    assert_eq!(manifest["frameId"], world["frameId"]);
    for (field, path) in [
        ("worldSha256", &world_path),
        ("requestSha256", &request_path),
        ("assessmentSha256", &assessment_path),
        ("recommendationSha256", &recommendation_path),
        ("confirmationSha256", &confirmation_path),
    ] {
        assert_eq!(manifest["hashes"][field].as_str().unwrap(), sha256(path));
    }

    let mission_id = world["mission"]["id"].as_str().expect("mission id");
    let frame_id = world["frameId"].as_str().expect("frame id");
    let target_entity_id = recommendation["targetEntityId"].as_str().unwrap();
    let target_track_id = recommendation["targetTrackId"].as_str().unwrap();
    assert_eq!(assessment["missionId"], mission_id);
    assert_eq!(assessment["frameId"], frame_id);
    assert_eq!(recommendation["code"], "RESPOND");
    assert_eq!(recommendation["executable"], false);
    let statement = recommendation["statement"].as_str().unwrap();
    assert!(statement.starts_with("Recommendation: RESPOND"));
    let recommendation_evidence: Vec<&str> = recommendation["evidenceIds"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(Value::as_str)
        .collect();
    assert_eq!(
        world["entities"][target_entity_id]["affiliation"],
        "hostile"
    );
    assert_eq!(
        world["entities"][target_entity_id]["condition"],
        "operational"
    );
    assert_eq!(
        world["tracks"][target_track_id]["entityId"],
        target_entity_id
    );
    let cited = cited_ids(&assessment);
    assert!(cited.contains(&target_entity_id));
    assert!(cited.contains(&target_track_id));
    assert!(recommendation_evidence.contains(&target_entity_id));
    assert!(recommendation_evidence.contains(&target_track_id));
    assert!(
        assessment["orientation"]
            .as_array()
            .unwrap()
            .iter()
            .any(|finding| {
                finding["statement"] == statement
                    && finding["evidenceIds"] == recommendation["evidenceIds"]
            })
    );

    assert_eq!(
        confirmation["recommendationId"],
        recommendation["recommendationId"]
    );
    assert_eq!(confirmation["confirmed"], true);
    assert_eq!(confirmation["targetEntityId"], target_entity_id);
    assert_eq!(confirmation["targetTrackId"], target_track_id);

    let observed_at: DateTime<Utc> = world["tracks"][target_track_id]["latest"]["timestamp"]
        .as_str()
        .expect("track timestamp")
        .parse()
        .expect("RFC3339 timestamp");
    let gate_time = observed_at + Duration::seconds(1);
    let operation_id = format!("local-proof:{frame_id}:{target_track_id}");
    let command = InterceptCommand {
        command_id: format!("command:{frame_id}:{target_track_id}"),
        operation_id: operation_id.clone(),
        provider_id: ProviderId("local-simulator".into()),
        interceptor_id: confirmation["interceptorId"].as_str().unwrap().into(),
        launch_site_id: None,
        target_label: world["entities"][target_entity_id]["label"]
            .as_str()
            .map(str::to_owned),
        target: TargetRef {
            track_id: target_track_id.into(),
            revision: world["sequence"].as_u64().unwrap(),
            observed_at,
        },
        intent: InterceptIntent {
            azimuth_deg: None,
            altitude_deg: None,
            distance_m: None,
            direction_deg: None,
            altitude_m: None,
            speed_m_s: Some(80.0),
        },
        constraints: ConstraintSet {
            keep_in_area_ids: vec![],
            avoid_area_ids: vec![],
            expires_at: gate_time + Duration::minutes(10),
        },
        authority: AuthorityProof {
            grant_id: confirmation["confirmationId"].as_str().unwrap().into(),
            revision: 1,
            valid_until: gate_time + Duration::minutes(10),
            permits_intercept: true,
        },
        expected_world_epoch: world["streamEpoch"].as_str().unwrap().into(),
        expected_world_revision: world["sequence"].as_u64().unwrap(),
        correlation: Correlation {
            correlation_id: recommendation["recommendationId"].as_str().unwrap().into(),
            causation_id: Some(confirmation["confirmationId"].as_str().unwrap().into()),
            trace_id: Some(format!("hosted-nlp-to-local:{frame_id}")),
        },
    };
    let gate = SafetyGateInput {
        now: gate_time,
        current_world_epoch: command.expected_world_epoch.clone(),
        current_world_revision: command.expected_world_revision,
        max_observation_age_ms: 5_000,
        asset_available: true,
        asset_capable: true,
        inside_keep_in: true,
        outside_avoid: true,
    };
    let context = DispatchContext {
        scenario_id: mission_id.into(),
        gate: validate_safety_gate(&command, &gate).expect("safety gate"),
    };
    let adapter = LocalSimulatorAdapter::default();
    let prepared = adapter.prepare(&context, &command).await.expect("prepare");
    let submission = adapter.submit(&prepared).await.expect("submit");
    assert!(matches!(submission, SubmitDisposition::Accepted { .. }));
    assert_eq!(
        adapter.status(&operation_id).await.unwrap(),
        ExternalOperationState::InProgress
    );

    let (contact, simulation) = run_contact_simulation(&operation_id, gate_time);
    adapter
        .report_contact(&contact)
        .expect("validated simulated contact");
    let report = adapter.reconcile(&operation_id).await.expect("reconcile");
    assert_eq!(report.state, ExternalOperationState::Succeeded);
    let outcome = report
        .outcome
        .as_ref()
        .expect("authoritative local outcome");
    assert!(outcome.intercepted);
    assert_eq!(outcome.evidence_ids, vec![contact.evidence_id.clone()]);

    let trace = json!({
        "schemaVersion": "2.0",
        "boundary": "hosted-nlp-recommendation-to-authoritative-local-simulator-contact",
        "captureManifest": manifest,
        "hostedAssessment": assessment,
        "normalizedRecommendation": recommendation,
        "operatorConfirmation": confirmation,
        "providerNeutralCommand": command,
        "preparedOperation": prepared,
        "submission": submission,
        "localSimulation": simulation,
        "validatedContact": contact,
        "reconciliation": report,
        "authoritativeOutcome": outcome,
        "claims": {
            "hostedInferenceWasAdvisory": true,
            "operatorConfirmationRequired": true,
            "outcomeAuthority": "LocalSimulatorAdapter validated contact",
            "wedgetailOutcomeClaimed": false
        },
        "limitations": [
            "The hosted frame is historical; the safety clock is anchored to its recorded timestamp for deterministic replay.",
            "The local pursuit is deterministic simulated kinematics, not physical flight or a Wedgetail dispatch."
        ]
    });
    fs::write(&output, serde_json::to_vec_pretty(&trace).unwrap()).expect("write trace");
    println!("proof_trace={}", output.display());
}
