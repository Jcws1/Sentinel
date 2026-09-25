use async_trait::async_trait;
use chrono::{Duration, Utc};
use sentinel_interceptor_providers::{
    ApiKeyProvider, AuthorityProof, ConstraintSet, Correlation, DispatchContext, GateAttestation,
    GenericHttpAdapter, GenericHttpConfig, InterceptCommand, InterceptIntent, InterceptorProvider,
    PreDispatchTransportError, ProviderError, ProviderId, ProviderTransport, SecretValue,
    SubmitDisposition, TargetRef, TransportRequest, TransportResponse, TransportResult,
    WedgetailSandboxAdapter,
};
use serde_json::json;
use std::{
    collections::{BTreeSet, HashMap, VecDeque},
    sync::{Arc, Mutex},
};

type ScriptStep = Result<TransportResult, PreDispatchTransportError>;

#[derive(Clone, Default)]
struct ScriptedTransport {
    steps: Arc<Mutex<VecDeque<ScriptStep>>>,
    requests: Arc<Mutex<Vec<TransportRequest>>>,
}

impl ScriptedTransport {
    fn from_steps(steps: impl IntoIterator<Item = ScriptStep>) -> Self {
        Self {
            steps: Arc::new(Mutex::new(steps.into_iter().collect())),
            requests: Arc::default(),
        }
    }

    fn request_count(&self) -> usize {
        self.requests.lock().unwrap().len()
    }
}

#[async_trait]
impl ProviderTransport for ScriptedTransport {
    async fn send(
        &self,
        request: TransportRequest,
    ) -> Result<TransportResult, PreDispatchTransportError> {
        self.requests.lock().unwrap().push(request);
        self.steps
            .lock()
            .unwrap()
            .pop_front()
            .expect("test transport script exhausted")
    }
}

struct FixtureKey;

impl ApiKeyProvider for FixtureKey {
    fn api_key(&self) -> Result<SecretValue, ProviderError> {
        SecretValue::new("fixture-only-key".as_bytes().to_vec())
    }
}

fn command(provider: &str) -> (DispatchContext, InterceptCommand) {
    let now = Utc::now();
    (
        DispatchContext {
            scenario_id: "failure-matrix".into(),
            gate: GateAttestation {
                checked_at: now,
                authority_grant_id: "grant-fixture".into(),
                world_revision: 7,
            },
        },
        InterceptCommand {
            command_id: "cmd-fixture".into(),
            operation_id: "failure-matrix/cmd-fixture".into(),
            provider_id: ProviderId(provider.into()),
            interceptor_id: "interceptor-fixture".into(),
            launch_site_id: Some("box_1".into()),
            target_label: Some("Fixture1".into()),
            target: TargetRef {
                track_id: "track-fixture".into(),
                revision: 7,
                observed_at: now,
            },
            intent: InterceptIntent {
                azimuth_deg: Some(45.0),
                altitude_deg: Some(15.0),
                distance_m: Some(1_400.0),
                direction_deg: Some(90.0),
                altitude_m: None,
                speed_m_s: Some(80.0),
            },
            constraints: ConstraintSet {
                keep_in_area_ids: vec!["keep-in-fixture".into()],
                avoid_area_ids: vec!["avoid-fixture".into()],
                expires_at: now + Duration::minutes(1),
            },
            authority: AuthorityProof {
                grant_id: "grant-fixture".into(),
                revision: 1,
                valid_until: now + Duration::minutes(1),
                permits_intercept: true,
            },
            expected_world_epoch: "epoch-fixture".into(),
            expected_world_revision: 7,
            correlation: Correlation {
                correlation_id: "correlation-fixture".into(),
                causation_id: None,
                trace_id: Some("trace-fixture".into()),
            },
        },
    )
}

fn wedgetail(
    transport: ScriptedTransport,
) -> WedgetailSandboxAdapter<ScriptedTransport, FixtureKey> {
    WedgetailSandboxAdapter::new(
        FixtureKey,
        transport,
        BTreeSet::from(["box_1".into(), "box_2".into(), "box_3".into()]),
    )
    .unwrap()
}

async fn prepared_wedgetail(
    transport: ScriptedTransport,
) -> (
    WedgetailSandboxAdapter<ScriptedTransport, FixtureKey>,
    sentinel_interceptor_providers::PreparedOperation,
) {
    let adapter = wedgetail(transport);
    let (ctx, cmd) = command("wedgetail-sandbox");
    let operation = adapter.prepare(&ctx, &cmd).await.unwrap();
    (adapter, operation)
}

#[tokio::test]
async fn wedgetail_accepts_only_a_matching_success_echo() {
    let transport = ScriptedTransport::default();
    let (adapter, operation) = prepared_wedgetail(transport.clone()).await;
    transport
        .steps
        .lock()
        .unwrap()
        .push_back(Ok(TransportResult::Response(TransportResponse {
            status: 200,
            body: json!({"status": "ok", "received": operation.provider_request}),
        })));

    assert!(matches!(
        adapter.submit(&operation).await.unwrap(),
        SubmitDisposition::Accepted { .. }
    ));
    assert_eq!(transport.request_count(), 1);
}

#[tokio::test]
async fn wedgetail_malformed_2xx_is_ambiguous_and_not_retryable() {
    let transport =
        ScriptedTransport::from_steps([Ok(TransportResult::Response(TransportResponse {
            status: 200,
            body: json!({"status": "ok", "received": {"wrong": true}}),
        }))]);
    let (adapter, operation) = prepared_wedgetail(transport).await;

    assert_eq!(
        adapter.submit(&operation).await.unwrap(),
        SubmitDisposition::UnknownExternalOutcome {
            reason: "malformed_or_mismatched_success_response".into(),
            automatic_retry_allowed: false,
        }
    );
}

#[tokio::test]
async fn wedgetail_429_is_a_definite_rejection() {
    let transport =
        ScriptedTransport::from_steps([Ok(TransportResult::Response(TransportResponse {
            status: 429,
            body: json!({"detail": "sandbox capacity reached"}),
        }))]);
    let (adapter, operation) = prepared_wedgetail(transport).await;

    assert_eq!(
        adapter.submit(&operation).await.unwrap(),
        SubmitDisposition::Rejected {
            code: "http_429".into(),
            reason: "sandbox_rejected_request".into(),
        }
    );
}

#[tokio::test]
async fn wedgetail_500_is_ambiguous_and_not_retryable() {
    let transport =
        ScriptedTransport::from_steps([Ok(TransportResult::Response(TransportResponse {
            status: 500,
            body: json!({"error": "fixture"}),
        }))]);
    let (adapter, operation) = prepared_wedgetail(transport).await;

    assert_eq!(
        adapter.submit(&operation).await.unwrap(),
        SubmitDisposition::UnknownExternalOutcome {
            reason: "unclassified_http_500".into(),
            automatic_retry_allowed: false,
        }
    );
}

#[tokio::test]
async fn wedgetail_pre_dispatch_failure_is_a_safe_rejection() {
    let transport = ScriptedTransport::from_steps([Err(PreDispatchTransportError(
        "dns_failed_before_connect".into(),
    ))]);
    let (adapter, operation) = prepared_wedgetail(transport).await;

    assert_eq!(
        adapter.submit(&operation).await.unwrap(),
        SubmitDisposition::Rejected {
            code: "not_dispatched".into(),
            reason: "dns_failed_before_connect".into(),
        }
    );
}

#[tokio::test]
async fn wedgetail_lost_response_is_ambiguous_and_not_retryable() {
    let transport = ScriptedTransport::from_steps([Ok(TransportResult::AmbiguousAfterDispatch(
        "connection_lost_after_body_sent".into(),
    ))]);
    let (adapter, operation) = prepared_wedgetail(transport).await;

    assert_eq!(
        adapter.submit(&operation).await.unwrap(),
        SubmitDisposition::UnknownExternalOutcome {
            reason: "connection_lost_after_body_sent".into(),
            automatic_retry_allowed: false,
        }
    );
}

#[derive(Clone, Default)]
struct DurableIdempotentProvider {
    state: Arc<Mutex<DurableProviderState>>,
}

#[derive(Default)]
struct DurableProviderState {
    operation_by_key: HashMap<String, String>,
    submission_attempts: usize,
    external_effects: usize,
}

#[async_trait]
impl ProviderTransport for DurableIdempotentProvider {
    async fn send(
        &self,
        request: TransportRequest,
    ) -> Result<TransportResult, PreDispatchTransportError> {
        let key = request
            .headers
            .get("Idempotency-Key")
            .cloned()
            .expect("generic adapter must send its configured idempotency key");
        let mut state = self.state.lock().unwrap();
        state.submission_attempts += 1;
        let operation_id = if let Some(existing) = state.operation_by_key.get(&key) {
            existing.clone()
        } else {
            let created = format!("provider-operation-{}", state.external_effects + 1);
            state.external_effects += 1;
            state.operation_by_key.insert(key, created.clone());
            created
        };
        Ok(TransportResult::Response(TransportResponse {
            status: 202,
            body: json!({"operation_id": operation_id}),
        }))
    }
}

fn generic(transport: DurableIdempotentProvider) -> GenericHttpAdapter<DurableIdempotentProvider> {
    GenericHttpAdapter::new(
        GenericHttpConfig {
            provider_id: ProviderId("fixture-http".into()),
            submit_url: "https://fixture-provider.invalid/intercepts".into(),
            status_url_template: None,
            cancel_url_template: None,
            allowlisted_origins: BTreeSet::from(["https://fixture-provider.invalid".into()]),
            idempotency_header: Some("Idempotency-Key".into()),
            outcome_mapping: None,
        },
        transport,
    )
    .unwrap()
}

fn provider_operation_id(disposition: SubmitDisposition) -> Option<String> {
    match disposition {
        SubmitDisposition::Accepted { submission } => submission.provider_operation_id,
        other => panic!("expected accepted disposition, got {other:?}"),
    }
}

#[tokio::test]
async fn adapter_restart_reuses_stable_key_and_provider_prevents_duplicate_effect() {
    let durable_provider = DurableIdempotentProvider::default();
    let (ctx, cmd) = command("fixture-http");

    let first_adapter = generic(durable_provider.clone());
    let first_operation = first_adapter.prepare(&ctx, &cmd).await.unwrap();
    let first_id = provider_operation_id(first_adapter.submit(&first_operation).await.unwrap());

    // Rebuild the adapter to simulate a process restart. The external provider's
    // idempotency state survives, while Sentinel reconstructs the operation from
    // its durable command record and therefore sends the same operation ID key.
    let restarted_adapter = generic(durable_provider.clone());
    let reconstructed = restarted_adapter.prepare(&ctx, &cmd).await.unwrap();
    let second_id = provider_operation_id(restarted_adapter.submit(&reconstructed).await.unwrap());

    assert_eq!(first_operation.operation_id, reconstructed.operation_id);
    assert_eq!(first_id, second_id);
    let state = durable_provider.state.lock().unwrap();
    assert_eq!(state.submission_attempts, 2);
    assert_eq!(state.external_effects, 1);
}
