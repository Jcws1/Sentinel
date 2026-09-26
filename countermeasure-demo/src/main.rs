use axum::{
    Json, Router,
    extract::State,
    http::StatusCode,
    response::{Html, IntoResponse},
    routing::{get, post},
};
use chrono::{Duration, Utc};
use rusqlite::{Connection, params};
use sentinel_interceptor_providers::{
    AuthorityProof, ConstraintSet, Correlation, DispatchContext, InterceptCommand, InterceptIntent,
    InterceptorProvider, LocalContactReport, LocalSimulatorAdapter, ProviderId, SafetyGateInput,
    SubmitDisposition, TargetRef, validate_safety_gate,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};
use uuid::Uuid;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Recommendation {
    id: String,
    code: &'static str,
    category: &'static str,
    summary: String,
    target_id: String,
    interceptor_id: String,
    evidence_ids: Vec<String>,
    requires_confirmation: bool,
    expires_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct DemoState {
    scenario_id: String,
    revision: u64,
    phase: &'static str,
    target: [f64; 3],
    interceptor: [f64; 3],
    recommendation: Recommendation,
    audit: Vec<Value>,
    path: Vec<Value>,
    outcome: Option<Value>,
}

impl DemoState {
    fn fresh() -> Self {
        let now = Utc::now();
        let scenario_id = format!("sim-{}", Uuid::new_v4());
        Self {
            scenario_id,
            revision: 1,
            phase: "recommendation_ready",
            target: [900.0, 180.0, 120.0],
            interceptor: [0.0, 0.0, 120.0],
            recommendation: Recommendation {
                id: format!("rec-{}", Uuid::new_v4()),
                code: "RESPOND",
                category: "Respond",
                summary: "Assign SIM-INTERCEPTOR-1 to the current inbound simulated track.".into(),
                target_id: "SIM-TARGET-1".into(),
                interceptor_id: "SIM-INTERCEPTOR-1".into(),
                evidence_ids: vec![
                    "track:SIM-TARGET-1@rev:1".into(),
                    "gate:keep-in-demo".into(),
                ],
                requires_confirmation: true,
                expires_at: (now + Duration::minutes(5)).to_rfc3339(),
            },
            audit: vec![
                json!({"event":"observation_ingested","revision":1,"at":now}),
                json!({"event":"recommendation_generated","source":"deterministic-safety-policy","at":now}),
            ],
            path: vec![],
            outcome: None,
        }
    }
}

struct AppState {
    demo: Mutex<DemoState>,
    provider: LocalSimulatorAdapter,
    journal: Mutex<Connection>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfirmRequest {
    recommendation_id: String,
    expected_revision: u64,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .init();
    let address = std::env::var("SENTINEL_DEMO_ADDR").unwrap_or_else(|_| "0.0.0.0:10000".into());
    let db_path = std::env::var("SENTINEL_DEMO_DB")
        .map(PathBuf::from)
        .unwrap_or_else(|_| std::env::temp_dir().join("sentinel-countermeasure-demo.sqlite3"));
    let connection = Connection::open(db_path).expect("open demo journal");
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS demo_events(
      id INTEGER PRIMARY KEY AUTOINCREMENT, scenario_id TEXT NOT NULL,
      event_type TEXT NOT NULL, payload TEXT NOT NULL, created_at TEXT NOT NULL);",
        )
        .expect("initialize demo journal");
    let state = Arc::new(AppState {
        demo: Mutex::new(DemoState::fresh()),
        provider: LocalSimulatorAdapter::default(),
        journal: Mutex::new(connection),
    });
    let app = Router::new()
        .route("/", get(index))
        .route("/healthz", get(health))
        .route("/api/state", get(current))
        .route("/api/reset", post(reset))
        .route("/api/confirm", post(confirm))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind(&address)
        .await
        .expect("bind demo");
    tracing::info!(%address, "simulation demo listening");
    axum::serve(listener, app).await.expect("serve demo");
}

async fn index() -> Html<&'static str> {
    Html(include_str!("index.html"))
}
async fn health() -> Json<Value> {
    Json(json!({"ready":true,"scope":"simulation-only","version":"0.1.0"}))
}
async fn current(State(state): State<Arc<AppState>>) -> Json<DemoState> {
    Json(state.demo.lock().unwrap().clone())
}
async fn reset(State(state): State<Arc<AppState>>) -> Json<DemoState> {
    let mut demo = state.demo.lock().unwrap();
    *demo = DemoState::fresh();
    Json(demo.clone())
}

async fn confirm(
    State(state): State<Arc<AppState>>,
    Json(body): Json<ConfirmRequest>,
) -> impl IntoResponse {
    let (snapshot, now) = {
        let demo = state.demo.lock().unwrap();
        if demo.phase != "recommendation_ready" || body.recommendation_id != demo.recommendation.id
        {
            return (
                StatusCode::CONFLICT,
                Json(json!({"error":"recommendation_not_current"})),
            )
                .into_response();
        }
        if body.expected_revision != demo.revision {
            return (
                StatusCode::CONFLICT,
                Json(json!({"error":"world_revision_advanced"})),
            )
                .into_response();
        }
        (demo.clone(), Utc::now())
    };
    let operation_id = format!("op-{}", Uuid::new_v4());
    let command_id = format!("cmd-{}", Uuid::new_v4());
    let command = InterceptCommand {
        command_id: command_id.clone(),
        operation_id: operation_id.clone(),
        provider_id: ProviderId("local-simulator".into()),
        interceptor_id: snapshot.recommendation.interceptor_id.clone(),
        launch_site_id: None,
        target_label: Some("SIMULATION ONLY".into()),
        target: TargetRef {
            track_id: snapshot.recommendation.target_id.clone(),
            revision: snapshot.revision,
            observed_at: now,
        },
        intent: InterceptIntent {
            azimuth_deg: None,
            altitude_deg: None,
            distance_m: None,
            direction_deg: None,
            altitude_m: Some(120.0),
            speed_m_s: Some(80.0),
        },
        constraints: ConstraintSet {
            keep_in_area_ids: vec!["keep-in-demo".into()],
            avoid_area_ids: vec![],
            expires_at: now + Duration::seconds(30),
        },
        authority: AuthorityProof {
            grant_id: format!("operator-confirmation:{}", snapshot.recommendation.id),
            revision: snapshot.revision,
            valid_until: now + Duration::seconds(30),
            permits_intercept: true,
        },
        expected_world_epoch: snapshot.scenario_id.clone(),
        expected_world_revision: snapshot.revision,
        correlation: Correlation {
            correlation_id: snapshot.recommendation.id.clone(),
            causation_id: Some(snapshot.recommendation.id.clone()),
            trace_id: Some(snapshot.scenario_id.clone()),
        },
    };
    let gate_input = SafetyGateInput {
        now,
        current_world_epoch: snapshot.scenario_id.clone(),
        current_world_revision: snapshot.revision,
        max_observation_age_ms: 2_000,
        asset_available: true,
        asset_capable: true,
        inside_keep_in: true,
        outside_avoid: true,
    };
    let gate = match validate_safety_gate(&command, &gate_input) {
        Ok(gate) => gate,
        Err(error) => {
            return (
                StatusCode::CONFLICT,
                Json(json!({"error":format!("safety_gate:{error:?}")})),
            )
                .into_response();
        }
    };
    let context = DispatchContext {
        scenario_id: snapshot.scenario_id.clone(),
        gate,
    };
    let prepared = match state.provider.prepare(&context, &command).await {
        Ok(value) => value,
        Err(error) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error":format!("prepare:{error:?}")})),
            )
                .into_response();
        }
    };
    {
        let db = state.journal.lock().unwrap();
        db.execute("INSERT INTO demo_events(scenario_id,event_type,payload,created_at) VALUES(?1,'command_persisted',?2,?3)",
            params![snapshot.scenario_id, serde_json::to_string(&command).unwrap(), now.to_rfc3339()]).unwrap();
    }
    match state.provider.submit(&prepared).await {
        Ok(SubmitDisposition::Accepted { .. }) => {}
        other => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({"error":format!("dispatch:{other:?}")})),
            )
                .into_response();
        }
    }
    let mut interceptor = snapshot.interceptor;
    let mut target = snapshot.target;
    let mut path = Vec::new();
    for tick in 0..300 {
        target[0] -= 2.0;
        let delta = [
            target[0] - interceptor[0],
            target[1] - interceptor[1],
            target[2] - interceptor[2],
        ];
        let distance = (delta[0] * delta[0] + delta[1] * delta[1] + delta[2] * delta[2]).sqrt();
        let step = 8.0_f64.min(distance);
        for axis in 0..3 {
            interceptor[axis] += delta[axis] / distance.max(0.001) * step;
        }
        let separation = ((target[0] - interceptor[0]).powi(2)
            + (target[1] - interceptor[1]).powi(2)
            + (target[2] - interceptor[2]).powi(2))
        .sqrt();
        path.push(
            json!({"tick":tick,"target":target,"interceptor":interceptor,"separationM":separation}),
        );
        if separation <= 5.0 {
            break;
        }
    }
    let evidence_id = format!("sim-contact-{}", Uuid::new_v4());
    if let Err(error) = state.provider.report_contact(&LocalContactReport {
        operation_id: operation_id.clone(),
        evidence_id: evidence_id.clone(),
        observed_at: Utc::now(),
        interceptor_position_m: interceptor,
        target_position_m: target,
    }) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(json!({"error":format!("contact:{error:?}")})),
        )
            .into_response();
    }
    let outcome = state
        .provider
        .outcome(&operation_id)
        .await
        .unwrap()
        .unwrap();
    let mut demo = state.demo.lock().unwrap();
    demo.revision += 1;
    demo.phase = "intercepted";
    demo.interceptor = interceptor;
    demo.target = target;
    demo.path = path;
    demo.audit.extend([json!({"event":"operator_confirmed","recommendationId":body.recommendation_id,"at":now}),
                       json!({"event":"command_persisted","commandId":command_id,"operationId":operation_id}),
                       json!({"event":"simulator_dispatched","provider":"local-simulator"}),
                       json!({"event":"authoritative_simulated_outcome","evidenceId":evidence_id,"intercepted":outcome.intercepted})]);
    demo.outcome = Some(
        json!({"scope":"simulation-only","operationId":operation_id,"intercepted":outcome.intercepted,"evidenceIds":outcome.evidence_ids}),
    );
    {
        let db = state.journal.lock().unwrap();
        db.execute("INSERT INTO demo_events(scenario_id,event_type,payload,created_at) VALUES(?1,'authoritative_simulated_outcome',?2,?3)",
        params![demo.scenario_id, serde_json::to_string(&demo.outcome).unwrap(), Utc::now().to_rfc3339()]).unwrap();
    }
    Json(demo.clone()).into_response()
}
