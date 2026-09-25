use async_trait::async_trait;
use chrono::{DateTime, Utc};
use percent_encoding::{NON_ALPHANUMERIC, utf8_percent_encode};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeSet, HashMap},
    sync::{Arc, Mutex},
};
use url::Url;

pub type Fields = serde_json::Map<String, Value>;

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ProviderId(pub String);

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum CommandKind {
    Intercept,
    Hold,
    Return,
    Cancel,
    Reassign,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
pub enum TargetingMode {
    TrackId,
    Position,
    Bearing,
    Azimuth,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "mode", rename_all = "snake_case")]
pub enum IdempotencyMode {
    NativeKey { field: String },
    StatusLookupOnly { lookup_field: String },
    None,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct LifecycleCapabilities {
    pub cancel: bool,
    pub status_lookup: bool,
    pub telemetry: bool,
    pub authoritative_outcome: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct ProviderCapabilities {
    pub provider_id: ProviderId,
    pub command_kinds: BTreeSet<CommandKind>,
    pub targeting: BTreeSet<TargetingMode>,
    pub lifecycle: LifecycleCapabilities,
    pub idempotency: IdempotencyMode,
    pub max_concurrent: Option<u32>,
    pub version: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Correlation {
    pub correlation_id: String,
    pub causation_id: Option<String>,
    pub trace_id: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TargetRef {
    pub track_id: String,
    pub revision: u64,
    pub observed_at: DateTime<Utc>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct InterceptIntent {
    pub azimuth_deg: Option<f64>,
    pub altitude_deg: Option<f64>,
    pub distance_m: Option<f64>,
    pub direction_deg: Option<f64>,
    pub altitude_m: Option<f64>,
    pub speed_m_s: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ConstraintSet {
    pub keep_in_area_ids: Vec<String>,
    pub avoid_area_ids: Vec<String>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthorityProof {
    pub grant_id: String,
    pub revision: u64,
    pub valid_until: DateTime<Utc>,
    pub permits_intercept: bool,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct InterceptCommand {
    pub command_id: String,
    pub operation_id: String,
    pub provider_id: ProviderId,
    pub interceptor_id: String,
    /// Provider-neutral launch site. For Wedgetail this is the documented `box_id`,
    /// not an interceptor/drone identity.
    pub launch_site_id: Option<String>,
    pub target_label: Option<String>,
    pub target: TargetRef,
    pub intent: InterceptIntent,
    pub constraints: ConstraintSet,
    pub authority: AuthorityProof,
    pub expected_world_epoch: String,
    pub expected_world_revision: u64,
    pub correlation: Correlation,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct SafetyGateInput {
    pub now: DateTime<Utc>,
    pub current_world_epoch: String,
    pub current_world_revision: u64,
    pub max_observation_age_ms: i64,
    pub asset_available: bool,
    pub asset_capable: bool,
    pub inside_keep_in: bool,
    pub outside_avoid: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct GateAttestation {
    pub checked_at: DateTime<Utc>,
    pub authority_grant_id: String,
    pub world_revision: u64,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum GateRejection {
    Authority,
    Expired,
    StaleTarget,
    WrongEpoch,
    FutureRevision,
    AssetUnavailable,
    AssetIncapable,
    OutsideKeepIn,
    InsideAvoid,
}

pub fn validate_safety_gate(
    cmd: &InterceptCommand,
    gate: &SafetyGateInput,
) -> Result<GateAttestation, GateRejection> {
    if !cmd.authority.permits_intercept || cmd.authority.valid_until <= gate.now {
        return Err(GateRejection::Authority);
    }
    if cmd.constraints.expires_at <= gate.now {
        return Err(GateRejection::Expired);
    }
    if gate
        .now
        .signed_duration_since(cmd.target.observed_at)
        .num_milliseconds()
        > gate.max_observation_age_ms
    {
        return Err(GateRejection::StaleTarget);
    }
    if cmd.target.observed_at > gate.now + chrono::Duration::seconds(5) {
        return Err(GateRejection::StaleTarget);
    }
    if cmd.expected_world_epoch != gate.current_world_epoch {
        return Err(GateRejection::WrongEpoch);
    }
    if cmd.expected_world_revision > gate.current_world_revision {
        return Err(GateRejection::FutureRevision);
    }
    if !gate.asset_available {
        return Err(GateRejection::AssetUnavailable);
    }
    if !gate.asset_capable {
        return Err(GateRejection::AssetIncapable);
    }
    if !gate.inside_keep_in {
        return Err(GateRejection::OutsideKeepIn);
    }
    if !gate.outside_avoid {
        return Err(GateRejection::InsideAvoid);
    }
    Ok(GateAttestation {
        checked_at: gate.now,
        authority_grant_id: cmd.authority.grant_id.clone(),
        world_revision: gate.current_world_revision,
    })
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DispatchContext {
    pub scenario_id: String,
    pub gate: GateAttestation,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PreparedOperation {
    pub operation_id: String,
    pub command_fingerprint: String,
    pub provider_id: ProviderId,
    pub provider_request: Value,
    pub idempotency: IdempotencyMode,
    pub expires_at: DateTime<Utc>,
    pub capability_version: String,
    pub gate: GateAttestation,
}

#[derive(Serialize)]
struct WedgetailAddTarget {
    azimuth_d: f64,
    altitude_d: f64,
    distance_m: f64,
    speed_m_s: f64,
    direction_d: f64,
    unix_timestamp: i64,
    box_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    label: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct Submission {
    pub provider_operation_id: Option<String>,
    pub accepted_at: DateTime<Utc>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "disposition", rename_all = "snake_case")]
pub enum SubmitDisposition {
    Accepted {
        submission: Submission,
    },
    Rejected {
        code: String,
        reason: String,
    },
    UnknownExternalOutcome {
        reason: String,
        automatic_retry_allowed: bool,
    },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "state", rename_all = "snake_case")]
pub enum ExternalOperationState {
    Submitted,
    InProgress,
    Succeeded,
    Failed {
        code: String,
    },
    Cancelled,
    Rejected {
        code: String,
    },
    UnknownExternalOutcome {
        reason: String,
        manual_reconciliation_required: bool,
    },
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct TelemetrySample {
    pub operation_id: String,
    pub source_time: DateTime<Utc>,
    pub fields: Fields,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct AuthoritativeOutcome {
    pub operation_id: String,
    pub intercepted: bool,
    pub evidence_ids: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct ReconciliationReport {
    pub state: ExternalOperationState,
    pub telemetry: Vec<TelemetrySample>,
    pub outcome: Option<AuthoritativeOutcome>,
    pub checked_at: DateTime<Utc>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum CancelDisposition {
    Cancelled,
    AlreadyTerminal,
    Unsupported,
    Unknown,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ProviderError {
    Unsupported(&'static str),
    Invalid(String),
    Conflict(String),
    Transport(String),
    NotFound,
}

#[async_trait]
pub trait InterceptorProvider: Send + Sync {
    fn provider_id(&self) -> &ProviderId;
    fn capabilities(&self) -> ProviderCapabilities;
    async fn prepare(
        &self,
        ctx: &DispatchContext,
        cmd: &InterceptCommand,
    ) -> Result<PreparedOperation, ProviderError>;
    async fn submit(&self, op: &PreparedOperation) -> Result<SubmitDisposition, ProviderError>;
    async fn status(&self, operation_id: &str) -> Result<ExternalOperationState, ProviderError>;
    async fn telemetry(&self, operation_id: &str) -> Result<Vec<TelemetrySample>, ProviderError>;
    async fn outcome(
        &self,
        operation_id: &str,
    ) -> Result<Option<AuthoritativeOutcome>, ProviderError>;
    async fn reconcile(&self, operation_id: &str) -> Result<ReconciliationReport, ProviderError> {
        Ok(ReconciliationReport {
            state: self.status(operation_id).await?,
            telemetry: self.telemetry(operation_id).await?,
            outcome: self.outcome(operation_id).await?,
            checked_at: Utc::now(),
        })
    }
    async fn cancel(&self, operation_id: &str) -> Result<CancelDisposition, ProviderError>;
}

fn fingerprint(value: &Value) -> String {
    format!(
        "sha256:{:x}",
        Sha256::digest(serde_json::to_vec(value).expect("serializable"))
    )
}

#[derive(Clone)]
struct LocalRecord {
    fingerprint: String,
    accepted_at: DateTime<Utc>,
    state: ExternalOperationState,
    telemetry: Vec<TelemetrySample>,
    outcome: Option<AuthoritativeOutcome>,
}

pub struct LocalSimulatorAdapter {
    id: ProviderId,
    records: Mutex<HashMap<String, LocalRecord>>,
}

impl Default for LocalSimulatorAdapter {
    fn default() -> Self {
        Self {
            id: ProviderId("local-simulator".into()),
            records: Mutex::new(HashMap::new()),
        }
    }
}

impl LocalSimulatorAdapter {
    pub fn complete_interception(
        &self,
        operation_id: &str,
        evidence_id: &str,
    ) -> Result<(), ProviderError> {
        let mut records = self.records.lock().unwrap();
        let record = records
            .get_mut(operation_id)
            .ok_or(ProviderError::NotFound)?;
        if !matches!(record.state, ExternalOperationState::InProgress) {
            return Err(ProviderError::Conflict("operation_not_in_progress".into()));
        }
        record.state = ExternalOperationState::Succeeded;
        record.outcome = Some(AuthoritativeOutcome {
            operation_id: operation_id.into(),
            intercepted: true,
            evidence_ids: vec![evidence_id.into()],
        });
        Ok(())
    }
}

#[async_trait]
impl InterceptorProvider for LocalSimulatorAdapter {
    fn provider_id(&self) -> &ProviderId {
        &self.id
    }
    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            provider_id: self.id.clone(),
            command_kinds: [CommandKind::Intercept, CommandKind::Cancel].into(),
            targeting: [TargetingMode::TrackId, TargetingMode::Position].into(),
            lifecycle: LifecycleCapabilities {
                cancel: true,
                status_lookup: true,
                telemetry: true,
                authoritative_outcome: true,
            },
            idempotency: IdempotencyMode::NativeKey {
                field: "operation_id".into(),
            },
            max_concurrent: Some(30),
            version: "local/v1".into(),
        }
    }
    async fn prepare(
        &self,
        ctx: &DispatchContext,
        cmd: &InterceptCommand,
    ) -> Result<PreparedOperation, ProviderError> {
        prepare_from_command(
            ctx,
            cmd,
            &self.capabilities(),
            json!({"interceptor_id":cmd.interceptor_id,"target_track_id":cmd.target.track_id}),
        )
    }
    async fn submit(&self, op: &PreparedOperation) -> Result<SubmitDisposition, ProviderError> {
        let mut records = self.records.lock().unwrap();
        if let Some(old) = records.get(&op.operation_id) {
            if old.fingerprint != op.command_fingerprint {
                return Err(ProviderError::Conflict("operation_id_reused".into()));
            }
            return Ok(SubmitDisposition::Accepted {
                submission: Submission {
                    provider_operation_id: Some(op.operation_id.clone()),
                    accepted_at: old.accepted_at,
                },
            });
        }
        if records
            .values()
            .filter(|r| {
                matches!(
                    r.state,
                    ExternalOperationState::InProgress | ExternalOperationState::Submitted
                )
            })
            .count()
            >= 30
        {
            return Ok(SubmitDisposition::Rejected {
                code: "capacity".into(),
                reason: "local_simulator_max_concurrent_30".into(),
            });
        }
        let accepted_at = Utc::now();
        let mut telemetry_fields = Fields::new();
        telemetry_fields.insert("phase".into(), json!("dispatched"));
        records.insert(
            op.operation_id.clone(),
            LocalRecord {
                fingerprint: op.command_fingerprint.clone(),
                accepted_at,
                state: ExternalOperationState::InProgress,
                telemetry: vec![TelemetrySample {
                    operation_id: op.operation_id.clone(),
                    source_time: Utc::now(),
                    fields: telemetry_fields,
                }],
                outcome: None,
            },
        );
        Ok(SubmitDisposition::Accepted {
            submission: Submission {
                provider_operation_id: Some(op.operation_id.clone()),
                accepted_at,
            },
        })
    }
    async fn status(&self, id: &str) -> Result<ExternalOperationState, ProviderError> {
        Ok(self
            .records
            .lock()
            .unwrap()
            .get(id)
            .ok_or(ProviderError::NotFound)?
            .state
            .clone())
    }
    async fn telemetry(&self, id: &str) -> Result<Vec<TelemetrySample>, ProviderError> {
        Ok(self
            .records
            .lock()
            .unwrap()
            .get(id)
            .ok_or(ProviderError::NotFound)?
            .telemetry
            .clone())
    }
    async fn outcome(&self, id: &str) -> Result<Option<AuthoritativeOutcome>, ProviderError> {
        Ok(self
            .records
            .lock()
            .unwrap()
            .get(id)
            .ok_or(ProviderError::NotFound)?
            .outcome
            .clone())
    }
    async fn cancel(&self, id: &str) -> Result<CancelDisposition, ProviderError> {
        let mut r = self.records.lock().unwrap();
        let x = r.get_mut(id).ok_or(ProviderError::NotFound)?;
        if matches!(
            x.state,
            ExternalOperationState::Succeeded
                | ExternalOperationState::Failed { .. }
                | ExternalOperationState::Cancelled
        ) {
            return Ok(CancelDisposition::AlreadyTerminal);
        }
        x.state = ExternalOperationState::Cancelled;
        Ok(CancelDisposition::Cancelled)
    }
}

fn prepare_from_command(
    ctx: &DispatchContext,
    cmd: &InterceptCommand,
    caps: &ProviderCapabilities,
    provider_request: Value,
) -> Result<PreparedOperation, ProviderError> {
    if cmd.provider_id != caps.provider_id {
        return Err(ProviderError::Invalid("wrong_provider".into()));
    }
    if !caps.command_kinds.contains(&CommandKind::Intercept) {
        return Err(ProviderError::Unsupported("intercept"));
    }
    let fp =
        fingerprint(&serde_json::to_value(cmd).map_err(|e| ProviderError::Invalid(e.to_string()))?);
    Ok(PreparedOperation {
        operation_id: cmd.operation_id.clone(),
        command_fingerprint: fp,
        provider_id: caps.provider_id.clone(),
        provider_request,
        idempotency: caps.idempotency.clone(),
        expires_at: cmd.constraints.expires_at,
        capability_version: caps.version.clone(),
        gate: ctx.gate.clone(),
    })
}

#[derive(Clone, PartialEq, Eq)]
pub struct SecretValue(Vec<u8>);
impl SecretValue {
    pub fn new(value: impl Into<Vec<u8>>) -> Result<Self, ProviderError> {
        let value = value.into();
        if value.is_empty() || value.contains(&b'\r') || value.contains(&b'\n') {
            return Err(ProviderError::Invalid("invalid_secret".into()));
        }
        Ok(Self(value))
    }
    pub fn expose(&self) -> &[u8] {
        &self.0
    }
}
impl std::fmt::Debug for SecretValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("[REDACTED]")
    }
}

pub trait ApiKeyProvider: Send + Sync {
    fn api_key(&self) -> Result<SecretValue, ProviderError>;
}

#[derive(Clone, PartialEq, Eq)]
pub struct SecretHeader {
    pub name: String,
    pub value: SecretValue,
}
impl std::fmt::Debug for SecretHeader {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SecretHeader")
            .field("name", &self.name)
            .field("value", &"[REDACTED]")
            .finish()
    }
}

#[derive(Clone, PartialEq)]
pub struct TransportRequest {
    pub method: String,
    pub url: String,
    pub headers: HashMap<String, String>,
    pub secret_headers: Vec<SecretHeader>,
    pub body: Value,
}
#[derive(Clone, Debug, PartialEq)]
pub struct TransportResponse {
    pub status: u16,
    pub body: Value,
}
#[derive(Clone, Debug, PartialEq)]
pub enum TransportResult {
    Response(TransportResponse),
    NotDispatched(String),
    AmbiguousAfterDispatch(String),
}

/// A transport error returned through this type proves that no request bytes
/// were dispatched. Once dispatch may have occurred, transports MUST return
/// `TransportResult::AmbiguousAfterDispatch` instead.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreDispatchTransportError(pub String);

#[async_trait]
pub trait ProviderTransport: Send + Sync {
    async fn send(
        &self,
        request: TransportRequest,
    ) -> Result<TransportResult, PreDispatchTransportError>;
}

pub struct WedgetailSandboxAdapter<T: ProviderTransport, A: ApiKeyProvider> {
    id: ProviderId,
    transport: T,
    auth: A,
    allowed_box_ids: BTreeSet<String>,
}
impl<T: ProviderTransport, A: ApiKeyProvider> WedgetailSandboxAdapter<T, A> {
    pub fn new(
        auth: A,
        transport: T,
        allowed_box_ids: BTreeSet<String>,
    ) -> Result<Self, ProviderError> {
        if allowed_box_ids.is_empty() {
            return Err(ProviderError::Invalid("allowed_box_ids_empty".into()));
        }
        Ok(Self {
            id: ProviderId("wedgetail-sandbox".into()),
            transport,
            auth,
            allowed_box_ids,
        })
    }
}

#[async_trait]
impl<T: ProviderTransport, A: ApiKeyProvider> InterceptorProvider
    for WedgetailSandboxAdapter<T, A>
{
    fn provider_id(&self) -> &ProviderId {
        &self.id
    }
    fn capabilities(&self) -> ProviderCapabilities {
        ProviderCapabilities {
            provider_id: self.id.clone(),
            command_kinds: [CommandKind::Intercept].into(),
            targeting: [TargetingMode::Azimuth].into(),
            lifecycle: LifecycleCapabilities {
                cancel: false,
                status_lookup: false,
                telemetry: false,
                authoritative_outcome: false,
            },
            idempotency: IdempotencyMode::None,
            max_concurrent: None,
            version: "sandbox-observed/v1".into(),
        }
    }
    async fn prepare(
        &self,
        ctx: &DispatchContext,
        cmd: &InterceptCommand,
    ) -> Result<PreparedOperation, ProviderError> {
        let required = |v: Option<f64>, name: &str| {
            v.filter(|x| x.is_finite())
                .ok_or_else(|| ProviderError::Invalid(format!("{name}_required_finite")))
        };
        let az = required(cmd.intent.azimuth_deg, "azimuth_d")?;
        let altitude = required(cmd.intent.altitude_deg, "altitude_d")?;
        let distance = required(cmd.intent.distance_m, "distance_m")?;
        let speed = required(cmd.intent.speed_m_s, "speed_m_s")?;
        let direction = required(cmd.intent.direction_deg, "direction_d")?;
        if !(0.0..=360.0).contains(&az)
            || !(0.0..=90.0).contains(&altitude)
            || distance <= 0.0
            || speed <= 0.0
            || !(0.0..=360.0).contains(&direction)
        {
            return Err(ProviderError::Invalid(
                "wedgetail_field_out_of_range".into(),
            ));
        }
        let box_id = cmd.launch_site_id.clone().unwrap_or_else(|| "box_1".into());
        if !self.allowed_box_ids.contains(&box_id) {
            return Err(ProviderError::Invalid("unknown_box_id".into()));
        }
        if let Some(label) = &cmd.target_label
            && (label.is_empty()
                || label.len() > 20
                || !label.chars().all(|c| c.is_ascii_alphanumeric()))
        {
            return Err(ProviderError::Invalid("invalid_label".into()));
        }
        if (ctx.gate.checked_at - cmd.target.observed_at)
            .num_seconds()
            .abs()
            > 300
        {
            return Err(ProviderError::Invalid(
                "unix_timestamp_outside_five_minute_window".into(),
            ));
        }
        let body = serde_json::to_value(WedgetailAddTarget {
            azimuth_d: az,
            altitude_d: altitude,
            distance_m: distance,
            speed_m_s: speed,
            direction_d: direction,
            unix_timestamp: cmd.target.observed_at.timestamp(),
            box_id,
            label: cmd.target_label.clone(),
        })
        .map_err(|e| ProviderError::Invalid(e.to_string()))?;
        prepare_from_command(ctx, cmd, &self.capabilities(), body)
    }
    async fn submit(&self, op: &PreparedOperation) -> Result<SubmitDisposition, ProviderError> {
        let request = TransportRequest {
            method: "POST".into(),
            url: "https://wedgetail-dynamics.com/sandbox/addtarget".into(),
            headers: [("Content-Type".into(), "application/json".into())].into(),
            secret_headers: vec![SecretHeader {
                name: "X-API-Key".into(),
                value: self.auth.api_key()?,
            }],
            body: op.provider_request.clone(),
        };
        match self.transport.send(request).await {
            Err(e) => Ok(SubmitDisposition::Rejected {
                code: "not_dispatched".into(),
                reason: e.0,
            }),
            Ok(result) => match result {
                TransportResult::AmbiguousAfterDispatch(reason) => {
                    Ok(SubmitDisposition::UnknownExternalOutcome {
                        reason,
                        automatic_retry_allowed: false,
                    })
                }
                TransportResult::NotDispatched(reason) => Ok(SubmitDisposition::Rejected {
                    code: "not_dispatched".into(),
                    reason,
                }),
                TransportResult::Response(r) if (200..300).contains(&r.status) => {
                    if r.body.get("status").and_then(Value::as_str) != Some("ok")
                        || r.body.get("received") != Some(&op.provider_request)
                    {
                        return Ok(SubmitDisposition::UnknownExternalOutcome {
                            reason: "malformed_or_mismatched_success_response".into(),
                            automatic_retry_allowed: false,
                        });
                    }
                    Ok(SubmitDisposition::Accepted {
                        submission: Submission {
                            provider_operation_id: None,
                            accepted_at: Utc::now(),
                        },
                    })
                }
                TransportResult::Response(r) if [400, 401, 415, 429].contains(&r.status) => {
                    Ok(SubmitDisposition::Rejected {
                        code: format!("http_{}", r.status),
                        reason: "sandbox_rejected_request".into(),
                    })
                }
                TransportResult::Response(r) => Ok(SubmitDisposition::UnknownExternalOutcome {
                    reason: format!("unclassified_http_{}", r.status),
                    automatic_retry_allowed: false,
                }),
            },
        }
    }
    async fn status(&self, _: &str) -> Result<ExternalOperationState, ProviderError> {
        Err(ProviderError::Unsupported("status"))
    }
    async fn telemetry(&self, _: &str) -> Result<Vec<TelemetrySample>, ProviderError> {
        Err(ProviderError::Unsupported("telemetry"))
    }
    async fn outcome(&self, _: &str) -> Result<Option<AuthoritativeOutcome>, ProviderError> {
        Err(ProviderError::Unsupported("authoritative_outcome"))
    }
    async fn reconcile(&self, id: &str) -> Result<ReconciliationReport, ProviderError> {
        Ok(ReconciliationReport {
            state: ExternalOperationState::UnknownExternalOutcome {
                reason: format!("provider_has_no_status_or_outcome_lookup:{id}"),
                manual_reconciliation_required: true,
            },
            telemetry: vec![],
            outcome: None,
            checked_at: Utc::now(),
        })
    }
    async fn cancel(&self, _: &str) -> Result<CancelDisposition, ProviderError> {
        Ok(CancelDisposition::Unsupported)
    }
}

#[derive(Clone, Debug)]
pub struct GenericOutcomeMapping {
    pub succeeded_state: String,
    pub intercepted_field: String,
    pub evidence_ids_field: String,
}

#[derive(Clone, Debug)]
pub struct GenericHttpConfig {
    pub provider_id: ProviderId,
    pub submit_url: String,
    pub status_url_template: Option<String>,
    pub cancel_url_template: Option<String>,
    pub allowlisted_origins: BTreeSet<String>,
    pub idempotency_header: Option<String>,
    /// Present only when the provider's response schema and the semantics of
    /// these fields have been verified as an authoritative terminal outcome.
    pub outcome_mapping: Option<GenericOutcomeMapping>,
}

pub struct GenericHttpAdapter<T: ProviderTransport> {
    config: GenericHttpConfig,
    transport: T,
    caps: ProviderCapabilities,
}
impl<T: ProviderTransport> GenericHttpAdapter<T> {
    pub fn new(config: GenericHttpConfig, transport: T) -> Result<Self, ProviderError> {
        validate_allowlisted(&config.submit_url, &config.allowlisted_origins)?;
        if let Some(u) = &config.status_url_template {
            validate_allowlisted(
                &u.replace("{operation_id}", "probe"),
                &config.allowlisted_origins,
            )?;
        }
        if let Some(u) = &config.cancel_url_template {
            validate_allowlisted(
                &u.replace("{operation_id}", "probe"),
                &config.allowlisted_origins,
            )?;
        }
        let idempotency = if let Some(h) = &config.idempotency_header {
            IdempotencyMode::NativeKey { field: h.clone() }
        } else if config.status_url_template.is_some() {
            IdempotencyMode::StatusLookupOnly {
                lookup_field: "operation_id".into(),
            }
        } else {
            IdempotencyMode::None
        };
        let caps = ProviderCapabilities {
            provider_id: config.provider_id.clone(),
            command_kinds: [CommandKind::Intercept].into(),
            targeting: [TargetingMode::TrackId, TargetingMode::Position].into(),
            lifecycle: LifecycleCapabilities {
                cancel: config.cancel_url_template.is_some(),
                status_lookup: config.status_url_template.is_some(),
                telemetry: false,
                authoritative_outcome: config.outcome_mapping.is_some(),
            },
            idempotency,
            max_concurrent: None,
            version: "generic-http/v1".into(),
        };
        Ok(Self {
            config,
            transport,
            caps,
        })
    }
}
fn validate_allowlisted(raw: &str, allow: &BTreeSet<String>) -> Result<(), ProviderError> {
    let url = Url::parse(raw).map_err(|e| ProviderError::Invalid(e.to_string()))?;
    if url.scheme() != "https" {
        return Err(ProviderError::Invalid("https_required".into()));
    }
    let origin = url.origin().ascii_serialization();
    if !allow.contains(&origin) {
        return Err(ProviderError::Invalid(format!(
            "origin_not_allowlisted:{origin}"
        )));
    }
    Ok(())
}

#[async_trait]
impl<T: ProviderTransport> InterceptorProvider for GenericHttpAdapter<T> {
    fn provider_id(&self) -> &ProviderId {
        &self.config.provider_id
    }
    fn capabilities(&self) -> ProviderCapabilities {
        self.caps.clone()
    }
    async fn prepare(
        &self,
        ctx: &DispatchContext,
        cmd: &InterceptCommand,
    ) -> Result<PreparedOperation, ProviderError> {
        prepare_from_command(
            ctx,
            cmd,
            &self.caps,
            json!({"operation_id":cmd.operation_id,"interceptor_id":cmd.interceptor_id,"target":cmd.target,"intent":cmd.intent}),
        )
    }
    async fn submit(&self, op: &PreparedOperation) -> Result<SubmitDisposition, ProviderError> {
        let mut headers = HashMap::new();
        if let Some(h) = &self.config.idempotency_header {
            headers.insert(h.clone(), op.operation_id.clone());
        }
        let result = match self
            .transport
            .send(TransportRequest {
                method: "POST".into(),
                url: self.config.submit_url.clone(),
                headers,
                secret_headers: vec![],
                body: op.provider_request.clone(),
            })
            .await
        {
            Ok(result) => result,
            Err(error) => {
                return Ok(SubmitDisposition::Rejected {
                    code: "not_dispatched".into(),
                    reason: error.0,
                });
            }
        };
        match result {
            TransportResult::AmbiguousAfterDispatch(reason) => {
                Ok(SubmitDisposition::UnknownExternalOutcome {
                    reason,
                    automatic_retry_allowed: matches!(
                        self.caps.idempotency,
                        IdempotencyMode::NativeKey { .. }
                    ),
                })
            }
            TransportResult::NotDispatched(reason) => Ok(SubmitDisposition::Rejected {
                code: "not_dispatched".into(),
                reason,
            }),
            TransportResult::Response(r) if (200..300).contains(&r.status) => {
                Ok(SubmitDisposition::Accepted {
                    submission: Submission {
                        provider_operation_id: r
                            .body
                            .get("operation_id")
                            .and_then(Value::as_str)
                            .map(str::to_owned),
                        accepted_at: Utc::now(),
                    },
                })
            }
            TransportResult::Response(r) if r.status < 500 => Ok(SubmitDisposition::Rejected {
                code: format!("http_{}", r.status),
                reason: "provider_rejected_request".into(),
            }),
            TransportResult::Response(r) => Ok(SubmitDisposition::UnknownExternalOutcome {
                reason: format!("unverified_http_{}", r.status),
                automatic_retry_allowed: false,
            }),
        }
    }
    async fn status(&self, id: &str) -> Result<ExternalOperationState, ProviderError> {
        let t = self
            .config
            .status_url_template
            .as_ref()
            .ok_or(ProviderError::Unsupported("status"))?;
        let url = t.replace(
            "{operation_id}",
            &utf8_percent_encode(id, NON_ALPHANUMERIC).to_string(),
        );
        let r = self
            .transport
            .send(TransportRequest {
                method: "GET".into(),
                url,
                headers: HashMap::new(),
                secret_headers: vec![],
                body: Value::Null,
            })
            .await
            .map_err(|e| ProviderError::Transport(format!("pre_dispatch:{}", e.0)))?;
        match r {
            TransportResult::AmbiguousAfterDispatch(s) | TransportResult::NotDispatched(s) => {
                Ok(ExternalOperationState::UnknownExternalOutcome {
                    reason: s,
                    manual_reconciliation_required: true,
                })
            }
            TransportResult::Response(x) => parse_state(&x.body),
        }
    }
    async fn telemetry(&self, _: &str) -> Result<Vec<TelemetrySample>, ProviderError> {
        Err(ProviderError::Unsupported("telemetry"))
    }
    async fn outcome(&self, id: &str) -> Result<Option<AuthoritativeOutcome>, ProviderError> {
        let mapping = self
            .config
            .outcome_mapping
            .as_ref()
            .ok_or(ProviderError::Unsupported("authoritative_outcome"))?;
        let body = self.status_body(id).await?;
        if body.get("state").and_then(Value::as_str) != Some(mapping.succeeded_state.as_str()) {
            return Ok(None);
        }
        let intercepted = body
            .get(&mapping.intercepted_field)
            .and_then(Value::as_bool)
            .ok_or_else(|| {
                ProviderError::Invalid("missing_authoritative_intercepted_field".into())
            })?;
        let evidence_ids = body
            .get(&mapping.evidence_ids_field)
            .and_then(Value::as_array)
            .ok_or_else(|| ProviderError::Invalid("missing_authoritative_evidence_ids".into()))?
            .iter()
            .map(|v| {
                v.as_str()
                    .map(str::to_owned)
                    .ok_or_else(|| ProviderError::Invalid("invalid_evidence_id".into()))
            })
            .collect::<Result<Vec<_>, _>>()?;
        if evidence_ids.is_empty() {
            return Err(ProviderError::Invalid(
                "authoritative_outcome_without_evidence".into(),
            ));
        }
        Ok(Some(AuthoritativeOutcome {
            operation_id: id.into(),
            intercepted,
            evidence_ids,
        }))
    }
    async fn reconcile(&self, id: &str) -> Result<ReconciliationReport, ProviderError> {
        if self.config.status_url_template.is_none() {
            return Ok(ReconciliationReport {
                state: ExternalOperationState::UnknownExternalOutcome {
                    reason: "status_lookup_not_configured".into(),
                    manual_reconciliation_required: true,
                },
                telemetry: vec![],
                outcome: None,
                checked_at: Utc::now(),
            });
        }
        let state = self.status(id).await?;
        // Outcome retrieval is intentionally separate; callers can request it
        // when an explicit authoritative mapping is configured.
        Ok(ReconciliationReport {
            state,
            telemetry: vec![],
            outcome: None,
            checked_at: Utc::now(),
        })
    }
    async fn cancel(&self, id: &str) -> Result<CancelDisposition, ProviderError> {
        let t = match &self.config.cancel_url_template {
            Some(v) => v,
            None => return Ok(CancelDisposition::Unsupported),
        };
        match self
            .transport
            .send(TransportRequest {
                method: "POST".into(),
                url: t.replace(
                    "{operation_id}",
                    &utf8_percent_encode(id, NON_ALPHANUMERIC).to_string(),
                ),
                headers: HashMap::new(),
                secret_headers: vec![],
                body: Value::Null,
            })
            .await
            .map_err(|e| ProviderError::Transport(format!("pre_dispatch:{}", e.0)))?
        {
            TransportResult::Response(r) if (200..300).contains(&r.status) => {
                Ok(CancelDisposition::Cancelled)
            }
            TransportResult::Response(_) => Ok(CancelDisposition::Unknown),
            TransportResult::AmbiguousAfterDispatch(_) | TransportResult::NotDispatched(_) => {
                Ok(CancelDisposition::Unknown)
            }
        }
    }
}

impl<T: ProviderTransport> GenericHttpAdapter<T> {
    async fn status_body(&self, id: &str) -> Result<Value, ProviderError> {
        let t = self
            .config
            .status_url_template
            .as_ref()
            .ok_or(ProviderError::Unsupported("status"))?;
        let url = t.replace(
            "{operation_id}",
            &utf8_percent_encode(id, NON_ALPHANUMERIC).to_string(),
        );
        match self
            .transport
            .send(TransportRequest {
                method: "GET".into(),
                url,
                headers: HashMap::new(),
                secret_headers: vec![],
                body: Value::Null,
            })
            .await
            .map_err(|e| ProviderError::Transport(format!("pre_dispatch:{}", e.0)))?
        {
            TransportResult::Response(r) if (200..300).contains(&r.status) => Ok(r.body),
            TransportResult::Response(r) => Err(ProviderError::Transport(format!(
                "status_http_{}",
                r.status
            ))),
            TransportResult::NotDispatched(s) | TransportResult::AmbiguousAfterDispatch(s) => {
                Err(ProviderError::Transport(s))
            }
        }
    }
}

fn parse_state(v: &Value) -> Result<ExternalOperationState, ProviderError> {
    match v.get("state").and_then(Value::as_str) {
        Some("submitted") => Ok(ExternalOperationState::Submitted),
        Some("in_progress") => Ok(ExternalOperationState::InProgress),
        Some("succeeded") => Ok(ExternalOperationState::Succeeded),
        Some("cancelled") => Ok(ExternalOperationState::Cancelled),
        Some(x) => Err(ProviderError::Invalid(format!("unknown_state:{x}"))),
        None => Err(ProviderError::Invalid("missing_state".into())),
    }
}

#[derive(Default)]
pub struct CapabilityRouter {
    providers: HashMap<ProviderId, Arc<dyn InterceptorProvider>>,
}
impl CapabilityRouter {
    pub fn register(&mut self, p: Arc<dyn InterceptorProvider>) -> Result<(), ProviderError> {
        let id = p.provider_id().clone();
        if self.providers.insert(id.clone(), p).is_some() {
            return Err(ProviderError::Conflict(format!(
                "duplicate_provider:{}",
                id.0
            )));
        }
        Ok(())
    }
    pub fn get(&self, id: &ProviderId) -> Result<Arc<dyn InterceptorProvider>, ProviderError> {
        self.providers
            .get(id)
            .cloned()
            .ok_or(ProviderError::NotFound)
    }
    pub fn select(
        &self,
        kind: CommandKind,
        targeting: TargetingMode,
        needs_status: bool,
        needs_outcome: bool,
    ) -> Vec<ProviderId> {
        let mut x: Vec<_> = self
            .providers
            .values()
            .filter(|p| {
                let c = p.capabilities();
                c.command_kinds.contains(&kind)
                    && c.targeting.contains(&targeting)
                    && (!needs_status || c.lifecycle.status_lookup)
                    && (!needs_outcome || c.lifecycle.authoritative_outcome)
            })
            .map(|p| p.provider_id().clone())
            .collect();
        x.sort_by(|a, b| a.0.cmp(&b.0));
        x
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[derive(Clone)]
    struct FakeTransport {
        result: Arc<Mutex<Option<TransportResult>>>,
        requests: Arc<Mutex<Vec<TransportRequest>>>,
    }
    impl FakeTransport {
        fn new(r: TransportResult) -> Self {
            Self {
                result: Arc::new(Mutex::new(Some(r))),
                requests: Arc::new(Mutex::new(vec![])),
            }
        }
    }
    struct StaticKey;
    impl ApiKeyProvider for StaticKey {
        fn api_key(&self) -> Result<SecretValue, ProviderError> {
            SecretValue::new(b"test-secret".to_vec())
        }
    }
    #[async_trait]
    impl ProviderTransport for FakeTransport {
        async fn send(
            &self,
            r: TransportRequest,
        ) -> Result<TransportResult, PreDispatchTransportError> {
            self.requests.lock().unwrap().push(r);
            self.result
                .lock()
                .unwrap()
                .clone()
                .ok_or_else(|| PreDispatchTransportError("no_fixture".into()))
        }
    }
    fn command(provider: &str) -> (DispatchContext, InterceptCommand) {
        let now = Utc::now();
        let gate = GateAttestation {
            checked_at: now,
            authority_grant_id: "grant-1".into(),
            world_revision: 2,
        };
        (
            DispatchContext {
                scenario_id: "scenario-1".into(),
                gate: gate.clone(),
            },
            InterceptCommand {
                command_id: "cmd-1".into(),
                operation_id: "scenario-1/cmd-1".into(),
                provider_id: ProviderId(provider.into()),
                interceptor_id: "i-1".into(),
                launch_site_id: Some("box_2".into()),
                target_label: Some("TestDrone1".into()),
                target: TargetRef {
                    track_id: "t-1".into(),
                    revision: 2,
                    observed_at: now,
                },
                intent: InterceptIntent {
                    azimuth_deg: Some(45.0),
                    altitude_deg: Some(15.0),
                    distance_m: Some(1400.0),
                    direction_deg: Some(0.0),
                    altitude_m: None,
                    speed_m_s: Some(100.0),
                },
                constraints: ConstraintSet {
                    keep_in_area_ids: vec![],
                    avoid_area_ids: vec![],
                    expires_at: now + chrono::Duration::minutes(1),
                },
                authority: AuthorityProof {
                    grant_id: "grant-1".into(),
                    revision: 1,
                    valid_until: now + chrono::Duration::minutes(1),
                    permits_intercept: true,
                },
                expected_world_epoch: "epoch-1".into(),
                expected_world_revision: 2,
                correlation: Correlation {
                    correlation_id: "c-1".into(),
                    causation_id: None,
                    trace_id: None,
                },
            },
        )
    }
    #[tokio::test]
    async fn local_is_idempotent_and_has_authoritative_outcome() {
        let a = LocalSimulatorAdapter::default();
        let (c, cmd) = command("local-simulator");
        let op = a.prepare(&c, &cmd).await.unwrap();
        assert_eq!(a.submit(&op).await.unwrap(), a.submit(&op).await.unwrap());
        a.complete_interception(&op.operation_id, "contact-1")
            .unwrap();
        let r = a.reconcile(&op.operation_id).await.unwrap();
        assert_eq!(r.state, ExternalOperationState::Succeeded);
        assert!(r.outcome.unwrap().intercepted);
    }
    #[tokio::test]
    async fn wedgetail_ambiguous_is_unknown_and_never_blind_retries() {
        let t = FakeTransport::new(TransportResult::AmbiguousAfterDispatch(
            "timeout_after_send".into(),
        ));
        let a = WedgetailSandboxAdapter::new(
            StaticKey,
            t.clone(),
            ["box_1".into(), "box_2".into(), "box_3".into()].into(),
        )
        .unwrap();
        let (c, cmd) = command("wedgetail-sandbox");
        let op = a.prepare(&c, &cmd).await.unwrap();
        assert!(matches!(
            a.submit(&op).await.unwrap(),
            SubmitDisposition::UnknownExternalOutcome {
                automatic_retry_allowed: false,
                ..
            }
        ));
        {
            let requests = t.requests.lock().unwrap();
            let request = &requests[0];
            assert_eq!(request.method, "POST");
            assert_eq!(
                request.url,
                "https://wedgetail-dynamics.com/sandbox/addtarget"
            );
            assert_eq!(
                request.headers.get("Content-Type").map(String::as_str),
                Some("application/json")
            );
            assert_eq!(request.secret_headers[0].name, "X-API-Key");
            assert_eq!(request.secret_headers[0].value.expose(), b"test-secret");
            assert_eq!(
                format!("{:?}", request.secret_headers[0]),
                "SecretHeader { name: \"X-API-Key\", value: \"[REDACTED]\" }"
            );
            assert_eq!(
                request.body,
                json!({"azimuth_d":45.0,"altitude_d":15.0,"distance_m":1400.0,
                "speed_m_s":100.0,"direction_d":0.0,"unix_timestamp":cmd.target.observed_at.timestamp(),
                "box_id":"box_2","label":"TestDrone1"})
            );
        }
        assert!(matches!(
            a.reconcile(&op.operation_id).await.unwrap().state,
            ExternalOperationState::UnknownExternalOutcome { .. }
        ));
    }
    #[tokio::test]
    async fn wedgetail_omits_optional_label_instead_of_sending_null() {
        let t = FakeTransport::new(TransportResult::NotDispatched("offline_fixture".into()));
        let a = WedgetailSandboxAdapter::new(StaticKey, t, ["box_2".into()].into()).unwrap();
        let (c, mut cmd) = command("wedgetail-sandbox");
        cmd.target_label = None;
        let op = a.prepare(&c, &cmd).await.unwrap();
        assert!(
            !op.provider_request
                .as_object()
                .unwrap()
                .contains_key("label")
        );
    }
    #[test]
    fn gate_fails_closed() {
        let (_, cmd) = command("local-simulator");
        let mut g = SafetyGateInput {
            now: Utc::now(),
            current_world_epoch: "epoch-1".into(),
            current_world_revision: 2,
            max_observation_age_ms: 10_000,
            asset_available: true,
            asset_capable: true,
            inside_keep_in: true,
            outside_avoid: true,
        };
        assert!(validate_safety_gate(&cmd, &g).is_ok());
        g.outside_avoid = false;
        assert_eq!(
            validate_safety_gate(&cmd, &g),
            Err(GateRejection::InsideAvoid)
        );
        let (_, mut future) = command("local-simulator");
        future.target.observed_at = g.now + chrono::Duration::seconds(6);
        g.outside_avoid = true;
        assert_eq!(
            validate_safety_gate(&future, &g),
            Err(GateRejection::StaleTarget)
        );
    }
    #[tokio::test]
    async fn generic_requires_allowlist_and_sets_native_key() {
        let cfg = GenericHttpConfig {
            provider_id: ProviderId("other".into()),
            submit_url: "https://provider.example/commands".into(),
            status_url_template: Some("https://provider.example/commands/{operation_id}".into()),
            cancel_url_template: None,
            allowlisted_origins: ["https://provider.example".into()].into(),
            idempotency_header: Some("Idempotency-Key".into()),
            outcome_mapping: Some(GenericOutcomeMapping {
                succeeded_state: "succeeded".into(),
                intercepted_field: "intercepted".into(),
                evidence_ids_field: "evidence_ids".into(),
            }),
        };
        let t = FakeTransport::new(TransportResult::Response(TransportResponse {
            status: 202,
            body: json!({"operation_id":"external-1"}),
        }));
        let a = GenericHttpAdapter::new(cfg, t).unwrap();
        assert!(matches!(
            a.capabilities().idempotency,
            IdempotencyMode::NativeKey { .. }
        ));
        let (c, cmd) = command("other");
        let op = a.prepare(&c, &cmd).await.unwrap();
        assert!(matches!(
            a.submit(&op).await.unwrap(),
            SubmitDisposition::Accepted { .. }
        ));
    }

    #[tokio::test]
    async fn generic_without_native_key_does_not_allow_blind_retry() {
        let cfg = GenericHttpConfig {
            provider_id: ProviderId("other".into()),
            submit_url: "https://provider.example/commands".into(),
            status_url_template: Some("https://provider.example/commands/{operation_id}".into()),
            cancel_url_template: None,
            allowlisted_origins: ["https://provider.example".into()].into(),
            idempotency_header: None,
            outcome_mapping: None,
        };
        let a = GenericHttpAdapter::new(
            cfg,
            FakeTransport::new(TransportResult::AmbiguousAfterDispatch(
                "timeout_after_send".into(),
            )),
        )
        .unwrap();
        assert!(matches!(
            a.capabilities().idempotency,
            IdempotencyMode::StatusLookupOnly { .. }
        ));
        let (c, cmd) = command("other");
        let op = a.prepare(&c, &cmd).await.unwrap();
        assert!(matches!(
            a.submit(&op).await.unwrap(),
            SubmitDisposition::UnknownExternalOutcome {
                automatic_retry_allowed: false,
                ..
            }
        ));
    }
    #[test]
    fn generic_rejects_unlisted_origin() {
        let cfg = GenericHttpConfig {
            provider_id: ProviderId("other".into()),
            submit_url: "https://evil.example/commands".into(),
            status_url_template: None,
            cancel_url_template: None,
            allowlisted_origins: ["https://provider.example".into()].into(),
            idempotency_header: None,
            outcome_mapping: None,
        };
        assert!(matches!(
            GenericHttpAdapter::new(
                cfg,
                FakeTransport::new(TransportResult::AmbiguousAfterDispatch("x".into()))
            ),
            Err(ProviderError::Invalid(_))
        ));
    }
    #[test]
    fn router_selects_by_capability() {
        let mut r = CapabilityRouter::default();
        r.register(Arc::new(LocalSimulatorAdapter::default()))
            .unwrap();
        r.register(Arc::new(
            WedgetailSandboxAdapter::new(
                StaticKey,
                FakeTransport::new(TransportResult::AmbiguousAfterDispatch("x".into())),
                ["box_1".into()].into(),
            )
            .unwrap(),
        ))
        .unwrap();
        assert_eq!(
            r.select(CommandKind::Intercept, TargetingMode::TrackId, true, true),
            vec![ProviderId("local-simulator".into())]
        );
    }
}
