use axum::{
    Json, Router,
    extract::{
        DefaultBodyLimit, Path, Query, State, WebSocketUpgrade,
        ws::{Message, WebSocket},
    },
    http::{HeaderValue, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use chrono::{SecondsFormat, Utc};
use flate2::{Compression, write::GzEncoder};
use futures_util::{Sink, SinkExt, StreamExt};
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use sentinel_interceptor_providers::{
    DispatchContext, ExternalOperationState, InterceptCommand, InterceptorProvider, ProviderError,
    SafetyGateInput, SubmitDisposition, validate_safety_gate,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::path::Path as FsPath;
use std::{
    collections::{BTreeMap, HashMap, VecDeque},
    io::Write,
    sync::{
        Arc, Mutex, RwLock,
        atomic::{AtomicU64, AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};
use tokio::sync::{mpsc, watch};
use tower_http::timeout::TimeoutLayer;
use uuid::Uuid;

const VERSION: &str = "realtime/v1";
const STREAM_ID: &str = "sentinel-tracks";
const COMMAND_STREAM_ID: &str = "sentinel-commands";
const OBSERVATION_STREAM_WRITE_TIMEOUT: Duration = Duration::from_secs(5);
const OBSERVATION_STREAM_READ_IDLE_TIMEOUT: Duration = Duration::from_secs(15 * 60);
const OBSERVER_HEARTBEAT_INTERVAL: Duration = Duration::from_secs(1);
// Keep batches deliberately small: this amortizes WebSocket/TCP framing without
// creating a large loss-retransmission unit or adding visible observer latency.
// A live subscriber normally receives only a few deltas per 5 ms batch.  The
// larger ceiling matters after brief TCP head-of-line stalls: it lets the
// writer drain its already-bounded queue efficiently instead of turning a
// recoverable cloud-network pause into a snapshot cycle.
const DELTA_BATCH_MAX_COUNT: usize = 64;
const DELTA_BATCH_MAX_WAIT: Duration = Duration::from_millis(5);
const DELTA_BATCH_MAX_DECOMPRESSED_BYTES: usize = 1024 * 1024;
const GZIP_BATCH_MAGIC: &[u8; 4] = b"SDG1";
const DEFAULT_OBSERVATION_IDEMPOTENCY_RETENTION: usize = 100_000;
const OBSERVATION_LATENCY_SAMPLE_RETENTION: usize = 100_000;
const DEFAULT_MAX_TRACKS: usize = 30;
const DEFAULT_MAX_SOURCE_TRACK_IDENTITIES: usize = 120;
const MAX_COMMAND_ATTEMPTS: i64 = 5;

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Correlation {
    pub correlation_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub causation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trace_id: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Position {
    pub x_mm: i64,
    pub y_mm: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub z_mm: Option<i64>,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct Velocity {
    pub x_mm_s: i64,
    pub y_mm_s: i64,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub z_mm_s: Option<i64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Observation {
    pub schema_version: String,
    pub message_type: String,
    pub message_id: String,
    pub stream_id: String,
    pub stream_sequence: u64,
    pub emitted_at: String,
    pub correlation: Correlation,
    pub observation_id: String,
    pub track_id: String,
    pub source_id: String,
    pub source_sequence: u64,
    pub source_time: String,
    pub position: Position,
    pub velocity: Velocity,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct TrackState {
    pub track_id: String,
    pub revision: u64,
    pub source_time: String,
    pub position: Position,
    pub velocity: Velocity,
}

#[derive(Clone, Debug, Serialize)]
pub struct TrackDelta {
    schema_version: &'static str,
    message_type: &'static str,
    message_id: String,
    stream_id: &'static str,
    stream_sequence: u64,
    emitted_at: String,
    correlation: Correlation,
    track: TrackState,
    previous_revision: u64,
}

// The idempotency window is much larger than the replay suffix. Keep only the
// non-derivable delta fields there: the wire message ID and protocol constants
// can be reconstructed from the sequence on the uncommon duplicate path.
struct CompactTrackDelta {
    stream_sequence: u64,
    emitted_at: String,
    correlation: Correlation,
    track: TrackState,
    previous_revision: u64,
}

impl From<&TrackDelta> for CompactTrackDelta {
    fn from(delta: &TrackDelta) -> Self {
        Self {
            stream_sequence: delta.stream_sequence,
            emitted_at: delta.emitted_at.clone(),
            correlation: delta.correlation.clone(),
            track: delta.track.clone(),
            previous_revision: delta.previous_revision,
        }
    }
}

impl CompactTrackDelta {
    fn expand(&self) -> TrackDelta {
        TrackDelta {
            schema_version: VERSION,
            message_type: "track_delta",
            message_id: format!("delta-{}", self.stream_sequence),
            stream_id: STREAM_ID,
            stream_sequence: self.stream_sequence,
            emitted_at: self.emitted_at.clone(),
            correlation: self.correlation.clone(),
            track: self.track.clone(),
            previous_revision: self.previous_revision,
        }
    }
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Command {
    pub schema_version: String,
    pub message_type: String,
    pub message_id: String,
    pub stream_id: String,
    pub stream_sequence: u64,
    pub emitted_at: String,
    pub correlation: Correlation,
    pub command_id: String,
    pub command_name: String,
    pub target_id: String,
    pub idempotency_key: String,
    pub parameters: serde_json::Map<String, Value>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct CommandReceipt {
    schema_version: String,
    message_type: String,
    message_id: String,
    stream_id: String,
    stream_sequence: u64,
    emitted_at: String,
    correlation: Correlation,
    command_id: String,
    receipt_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(deny_unknown_fields)]
pub struct CommandOutcomeRequest {
    pub worker_id: String,
    pub lease_token: String,
    pub outcome_id: String,
    pub status: String,
    pub emitted_at: String,
    pub correlation: Correlation,
    #[serde(default)]
    pub details: serde_json::Map<String, Value>,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ClaimRequest {
    pub worker_id: String,
    pub lease_duration_ms: u64,
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct LeaseRequest {
    pub worker_id: String,
    pub lease_token: String,
    #[serde(default)]
    pub lease_duration_ms: Option<u64>,
    #[serde(default)]
    pub retry_after_ms: Option<u64>,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProviderExecutionRequest {
    pub worker_id: String,
    pub lease_token: String,
    pub retry_after_ms: u64,
    pub scenario_id: String,
    pub command: InterceptCommand,
    /// Worker-supplied evidence evaluated by the gateway. This prototype does
    /// not yet own authoritative asset availability or geofence state.
    pub worker_gate_evidence: SafetyGateInput,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderExecutionState {
    Accepted,
    Rejected,
    RetryableNotDispatched,
    UnknownExternalOutcome,
}

#[derive(Clone, Debug, Serialize)]
pub struct ProviderExecutionResult {
    pub command_id: String,
    pub attempt_id: String,
    pub state: ProviderExecutionState,
    pub automatic_retry_allowed: bool,
    pub reason: Option<String>,
}

#[derive(Clone, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ReconciliationState {
    AwaitingReconciliation,
    AuthoritativeSucceeded,
    AuthoritativeFailed,
    ManualUnverifiable,
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct CommandOutcome {
    command_id: String,
    outcome_id: String,
    status: String,
    emitted_at: String,
    correlation: Correlation,
    details: serde_json::Map<String, Value>,
}

struct StoredObservation {
    fingerprint: [u8; 32],
    delta: CompactTrackDelta,
}

struct ObservationCache {
    // Sharing each key with the FIFO avoids a second allocation and copy of
    // every observation ID while retaining O(1) lookup and eviction.
    entries: HashMap<Arc<str>, StoredObservation>,
    insertion_order: VecDeque<Arc<str>>,
    capacity: usize,
}

impl ObservationCache {
    fn new(capacity: usize) -> Self {
        assert!(capacity > 0);
        Self {
            entries: HashMap::with_capacity(capacity.min(16_384)),
            insertion_order: VecDeque::with_capacity(capacity.min(16_384)),
            capacity,
        }
    }

    fn insert(&mut self, id: String, observation: StoredObservation) -> usize {
        let id: Arc<str> = id.into();
        self.entries.insert(id.clone(), observation);
        self.insertion_order.push_back(id);
        let mut evicted = 0;
        while self.entries.len() > self.capacity {
            if let Some(oldest) = self.insertion_order.pop_front()
                && self.entries.remove(&oldest).is_some()
            {
                evicted += 1;
            }
        }
        evicted
    }
}

#[derive(Debug, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct GatewayCommandRequest {
    pub transport_version: String,
    pub expected_epoch: String,
    pub expected_revision: u64,
    pub command: Command,
}

#[derive(Default)]
pub struct Metrics {
    observations: AtomicU64,
    commands_accepted: AtomicU64,
    command_duplicates: AtomicU64,
    command_conflicts: AtomicU64,
    ws_connected: AtomicUsize,
    slow_disconnects: AtomicU64,
    deltas_published: AtomicU64,
    delta_batches_sent: AtomicU64,
    deltas_sent_in_batches: AtomicU64,
    delta_batch_compressed_bytes: AtomicU64,
    delta_batch_uncompressed_bytes: AtomicU64,
    observation_latency_us: Mutex<VecDeque<u64>>,
    observation_idempotency_evictions: AtomicU64,
    track_capacity_rejections: AtomicU64,
    source_track_identity_capacity_rejections: AtomicU64,
    max_client_queue_depth: AtomicUsize,
    observation_streams_connected: AtomicUsize,
    observation_stream_accepted: AtomicU64,
    observation_stream_rejected: AtomicU64,
    observation_stream_backpressure_disconnects: AtomicU64,
    max_observation_ack_queue_depth: AtomicUsize,
}

#[derive(Serialize)]
struct MetricsView {
    observations: u64,
    commands_accepted: u64,
    command_duplicates: u64,
    command_conflicts: u64,
    ws_connected: usize,
    slow_client_disconnects: u64,
    deltas_published: u64,
    delta_batches_sent: u64,
    deltas_sent_in_batches: u64,
    delta_batch_compressed_bytes: u64,
    delta_batch_uncompressed_bytes: u64,
    max_client_queue_depth: usize,
    observation_latency_us_p50: u64,
    observation_latency_us_p95: u64,
    observation_latency_us_p99: u64,
    observation_latency_sample_count: usize,
    observation_latency_sample_capacity: usize,
    ingress_to_publish_us_p50: u64,
    ingress_to_publish_us_p95: u64,
    ingress_to_publish_us_p99: u64,
    observation_idempotency_entries: usize,
    observation_idempotency_capacity: usize,
    observation_idempotency_evictions: u64,
    track_entries: usize,
    track_capacity: usize,
    track_capacity_rejections: u64,
    source_track_identity_entries: usize,
    source_track_identity_capacity: usize,
    source_track_identity_capacity_rejections: u64,
    observation_streams_connected: usize,
    observation_stream_accepted: u64,
    observation_stream_rejected: u64,
    observation_stream_backpressure_disconnects: u64,
    max_observation_ack_queue_depth: usize,
}

#[derive(Debug, Serialize)]
struct ObservationStreamAck {
    transport_version: &'static str,
    message_type: &'static str,
    server_epoch: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    message_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    observation_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    correlation_id: Option<String>,
    accepted: bool,
    duplicate: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    result_sequence: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<&'static str>,
}

struct Subscriber {
    tx: mpsc::Sender<String>,
    stop: watch::Sender<Option<String>>,
}

#[derive(Clone)]
struct RetainedDelta {
    sequence: u64,
    payload: String,
}

struct Subscription {
    id: u64,
    rx: mpsc::Receiver<String>,
    stop: watch::Receiver<Option<String>>,
    suffix: Vec<String>,
    cursor: u64,
}

#[derive(Default)]
struct Hub {
    next_id: u64,
    clients: HashMap<u64, Subscriber>,
    retained: VecDeque<RetainedDelta>,
    retention: usize,
}

impl Hub {
    fn new(retention: usize) -> Self {
        Self {
            retention,
            ..Self::default()
        }
    }

    fn subscribe(&mut self, capacity: usize, after: u64) -> Result<Subscription, &'static str> {
        let current = self.retained.back().map_or(0, |d| d.sequence);
        let earliest = self
            .retained
            .front()
            .map_or(current.saturating_add(1), |d| d.sequence);
        if after > current {
            return Err("cursor_ahead_of_stream");
        }
        if after < current && after.saturating_add(1) < earliest {
            return Err("retained_suffix_unavailable");
        }
        self.next_id += 1;
        let (tx, rx) = mpsc::channel(capacity);
        let (stop, stop_rx) = watch::channel(None);
        self.clients.insert(self.next_id, Subscriber { tx, stop });
        let suffix = self
            .retained
            .iter()
            .filter(|d| d.sequence > after)
            .map(|d| d.payload.clone())
            .collect();
        Ok(Subscription {
            id: self.next_id,
            rx,
            stop: stop_rx,
            suffix,
            cursor: current,
        })
    }

    fn publish(&mut self, sequence: u64, payload: &str, metrics: &Metrics) {
        self.retained.push_back(RetainedDelta {
            sequence,
            payload: payload.to_owned(),
        });
        while self.retained.len() > self.retention {
            self.retained.pop_front();
        }
        let mut remove = Vec::new();
        for (&id, client) in &self.clients {
            match client.tx.try_send(payload.to_owned()) {
                Ok(()) => {
                    let depth = client.tx.max_capacity() - client.tx.capacity();
                    metrics
                        .max_client_queue_depth
                        .fetch_max(depth, Ordering::Relaxed);
                }
                Err(mpsc::error::TrySendError::Full(_)) => {
                    let _ = client
                        .stop
                        .send(Some("slow_client_snapshot_required".into()));
                    metrics.slow_disconnects.fetch_add(1, Ordering::Relaxed);
                    remove.push(id);
                }
                Err(mpsc::error::TrySendError::Closed(_)) => remove.push(id),
            }
        }
        for id in remove {
            self.clients.remove(&id);
        }
    }
}

#[derive(Clone)]
pub struct AppState {
    epoch: Arc<String>,
    delta_sequence: Arc<AtomicU64>,
    command_sequence: Arc<AtomicU64>,
    tracks: Arc<RwLock<BTreeMap<String, TrackState>>>,
    source_sequences: Arc<Mutex<HashMap<(String, String), u64>>>,
    observations: Arc<Mutex<ObservationCache>>,
    ingestion_lock: Arc<Mutex<()>>,
    command_db: Arc<Mutex<Connection>>,
    hub: Arc<Mutex<Hub>>,
    pub metrics: Arc<Metrics>,
    client_queue_capacity: usize,
    observation_ack_send_delay: Duration,
    max_tracks: usize,
    max_source_track_identities: usize,
}

impl AppState {
    pub fn new(client_queue_capacity: usize) -> Self {
        Self::with_retention(client_queue_capacity, 4096)
    }

    pub fn with_retention(client_queue_capacity: usize, delta_retention: usize) -> Self {
        Self::with_database(client_queue_capacity, delta_retention, ":memory:")
            .expect("initialize in-memory command database")
    }

    pub fn with_database(
        client_queue_capacity: usize,
        delta_retention: usize,
        path: impl AsRef<FsPath>,
    ) -> rusqlite::Result<Self> {
        Self::with_database_and_limits(
            client_queue_capacity,
            delta_retention,
            DEFAULT_OBSERVATION_IDEMPOTENCY_RETENTION,
            path,
        )
    }

    pub fn with_database_and_limits(
        client_queue_capacity: usize,
        delta_retention: usize,
        observation_idempotency_retention: usize,
        path: impl AsRef<FsPath>,
    ) -> rusqlite::Result<Self> {
        Self::with_database_and_admission_limits(
            client_queue_capacity,
            delta_retention,
            observation_idempotency_retention,
            DEFAULT_MAX_TRACKS,
            DEFAULT_MAX_SOURCE_TRACK_IDENTITIES,
            path,
        )
    }

    pub fn with_database_and_admission_limits(
        client_queue_capacity: usize,
        delta_retention: usize,
        observation_idempotency_retention: usize,
        max_tracks: usize,
        max_source_track_identities: usize,
        path: impl AsRef<FsPath>,
    ) -> rusqlite::Result<Self> {
        assert!(client_queue_capacity > 0);
        assert!(delta_retention > 0);
        assert!(observation_idempotency_retention > 0);
        assert!(max_tracks > 0);
        assert!(max_source_track_identities >= max_tracks);
        let connection = Connection::open(path)?;
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "synchronous", "FULL")?;
        let user_version: u32 =
            connection.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if user_version > 4 {
            return Err(rusqlite::Error::InvalidQuery);
        }
        if user_version == 0 {
            let existing_tables: u64 = connection.query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
                [], |r| r.get(0),
            )?;
            if existing_tables != 0 {
                // Refuse to guess how to migrate an unversioned command journal.
                return Err(rusqlite::Error::InvalidQuery);
            }
        }
        if user_version == 0 {
            connection.execute_batch(
                "CREATE TABLE IF NOT EXISTS commands (
                command_id TEXT PRIMARY KEY,
                idempotency_key TEXT NOT NULL UNIQUE,
                fingerprint TEXT NOT NULL,
                command_json TEXT NOT NULL,
                receipt_json TEXT NOT NULL,
                execution_state TEXT NOT NULL DEFAULT 'pending'
                    CHECK(execution_state IN ('pending','terminal')),
                created_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS command_outcomes (
                command_id TEXT PRIMARY KEY REFERENCES commands(command_id) ON DELETE CASCADE,
                outcome_id TEXT NOT NULL UNIQUE,
                fingerprint TEXT NOT NULL,
                outcome_json TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(command_id) REFERENCES commands(command_id)
             );
             PRAGMA user_version=1;",
            )?;
        }
        if user_version < 2 {
            connection.execute_batch(
                "ALTER TABLE commands ADD COLUMN worker_id TEXT;
                 ALTER TABLE commands ADD COLUMN lease_token TEXT;
                 ALTER TABLE commands ADD COLUMN lease_expires_at_ms INTEGER;
                 ALTER TABLE commands ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
                 ALTER TABLE commands ADD COLUMN next_attempt_at_ms INTEGER NOT NULL DEFAULT 0;
                 ALTER TABLE commands ADD COLUMN last_error TEXT;
                 ALTER TABLE command_outcomes ADD COLUMN completed_worker_id TEXT;
                 ALTER TABLE command_outcomes ADD COLUMN completed_lease_token TEXT;
                 CREATE INDEX IF NOT EXISTS commands_outbox_eligible
                   ON commands(execution_state,next_attempt_at_ms,lease_expires_at_ms,created_at);
                 PRAGMA user_version=2;",
            )?;
        }
        if user_version < 3 {
            connection.execute_batch(
                "CREATE TABLE IF NOT EXISTS provider_dispatch_attempts (
                    attempt_id TEXT PRIMARY KEY,
                    command_id TEXT NOT NULL REFERENCES commands(command_id) ON DELETE CASCADE,
                    worker_id TEXT NOT NULL,
                    lease_token TEXT NOT NULL,
                    provider_id TEXT NOT NULL,
                    operation_id TEXT NOT NULL,
                    request_fingerprint TEXT NOT NULL,
                    state TEXT NOT NULL CHECK(state IN
                      ('prepared','sending','accepted','rejected','retryable_not_dispatched','unknown_external_outcome')),
                    automatic_retry_allowed INTEGER NOT NULL DEFAULT 0,
                    reason TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                 );
                 CREATE INDEX IF NOT EXISTS provider_attempts_command
                   ON provider_dispatch_attempts(command_id,created_at);
                 PRAGMA user_version=3;",
            )?;
        }
        if user_version < 4 {
            connection.execute_batch(
                "BEGIN IMMEDIATE;
                 ALTER TABLE provider_dispatch_attempts RENAME TO provider_dispatch_attempts_v3;
                 CREATE TABLE provider_dispatch_attempts (
                    attempt_id TEXT PRIMARY KEY,
                    command_id TEXT NOT NULL REFERENCES commands(command_id) ON DELETE CASCADE,
                    worker_id TEXT NOT NULL,
                    lease_token TEXT NOT NULL,
                    provider_id TEXT NOT NULL,
                    operation_id TEXT NOT NULL,
                    request_fingerprint TEXT NOT NULL,
                    state TEXT NOT NULL CHECK(state IN
                      ('prepared','sending','awaiting_reconciliation','reconciling',
                       'authoritative_succeeded','authoritative_failed','manual_unverifiable',
                       'rejected','retryable_not_dispatched','unknown_external_outcome')),
                    automatic_retry_allowed INTEGER NOT NULL DEFAULT 0,
                    reason TEXT,
                    external_operation_id TEXT,
                    provider_accepted_at TEXT,
                    reconciliation_worker_id TEXT,
                    reconciliation_token TEXT,
                    reconciliation_lease_expires_at_ms INTEGER,
                    reconciliation_outcome_json TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                 );
                 INSERT INTO provider_dispatch_attempts
                   SELECT attempt_id,command_id,worker_id,lease_token,provider_id,operation_id,
                          request_fingerprint,
                          CASE WHEN state='accepted' THEN 'awaiting_reconciliation' ELSE state END,
                          automatic_retry_allowed,reason,NULL,NULL,NULL,NULL,NULL,NULL,created_at,updated_at
                   FROM provider_dispatch_attempts_v3;
                 DROP TABLE provider_dispatch_attempts_v3;
                 CREATE INDEX provider_attempts_command
                   ON provider_dispatch_attempts(command_id,created_at);
                 PRAGMA user_version=4;
                 COMMIT;",
            )?;
        }
        // A process that died after recording `sending` may have reached the
        // provider. Never reclaim and blindly resend such an operation.
        connection.execute(
            "UPDATE commands SET execution_state='terminal',worker_id=NULL,lease_token=NULL,
             lease_expires_at_ms=NULL,last_error='unknown_external_outcome:gateway_restarted_during_send'
             WHERE command_id IN (SELECT command_id FROM provider_dispatch_attempts
                                  WHERE state='sending')",
            [],
        )?;
        connection.execute(
            "UPDATE provider_dispatch_attempts SET state='unknown_external_outcome',
             automatic_retry_allowed=0, reason='gateway_restarted_during_send', updated_at=?1
             WHERE state='sending'",
            [now()],
        )?;
        connection.execute(
            "UPDATE provider_dispatch_attempts SET state='awaiting_reconciliation',
             reconciliation_worker_id=NULL,reconciliation_token=NULL,
             reconciliation_lease_expires_at_ms=NULL,
             reason='gateway_restarted_during_reconciliation',updated_at=?1
             WHERE state='reconciling'",
            [now()],
        )?;
        let integrity: String = connection.query_row("PRAGMA quick_check", [], |r| r.get(0))?;
        if integrity != "ok" {
            return Err(rusqlite::Error::InvalidQuery);
        }
        let max_sequence: u64 = connection.query_row(
            "SELECT COALESCE(MAX(CAST(json_extract(receipt_json, '$.stream_sequence') AS INTEGER)), 0) FROM commands",
            [], |row| row.get(0),
        )?;
        Ok(Self {
            epoch: Arc::new(format!(
                "epoch-{}-{}",
                Utc::now().timestamp_nanos_opt().unwrap_or_default(),
                std::process::id()
            )),
            delta_sequence: Arc::new(AtomicU64::new(0)),
            command_sequence: Arc::new(AtomicU64::new(max_sequence)),
            tracks: Default::default(),
            source_sequences: Default::default(),
            observations: Arc::new(Mutex::new(ObservationCache::new(
                observation_idempotency_retention,
            ))),
            ingestion_lock: Default::default(),
            command_db: Arc::new(Mutex::new(connection)),
            hub: Arc::new(Mutex::new(Hub::new(delta_retention))),
            metrics: Default::default(),
            client_queue_capacity,
            observation_ack_send_delay: Duration::ZERO,
            max_tracks,
            max_source_track_identities,
        })
    }
    fn next_delta_sequence(&self) -> u64 {
        self.delta_sequence.fetch_add(1, Ordering::SeqCst) + 1
    }
    fn next_command_sequence(&self) -> u64 {
        self.command_sequence.fetch_add(1, Ordering::SeqCst) + 1
    }

    /// Execute a currently leased command through an injected provider.
    ///
    /// The durable `sending` transition is committed before `submit` is
    /// invoked. Once that boundary is crossed, an ambiguous transport result
    /// is fenced as `unknown_external_outcome` and is never automatically
    /// reclaimed.
    pub async fn execute_provider_claim(
        &self,
        request: ProviderExecutionRequest,
        provider: &dyn InterceptorProvider,
    ) -> Result<ProviderExecutionResult, String> {
        if !valid_id(&request.worker_id)
            || !valid_id(&request.lease_token)
            || request.command.command_id.is_empty()
            || request.retry_after_ms > 86_400_000
        {
            return Err("invalid_provider_execution_request".into());
        }
        let command_id = request.command.command_id.clone();
        let attempt_id = Uuid::new_v4().to_string();
        // Bind every safety-critical provider field to the immutable command
        // envelope admitted into the durable journal. A lease holder cannot
        // substitute provider, operation, interceptor, intent, constraints or
        // authority after admission.
        {
            let db = self.command_db.lock().unwrap();
            let now_ms = unix_ms();
            let stored_json: Option<String> = db
                .query_row(
                    "SELECT command_json FROM commands WHERE command_id=?1 AND execution_state='pending'
                     AND worker_id=?2 AND lease_token=?3 AND lease_expires_at_ms>?4",
                    params![command_id, request.worker_id, request.lease_token, now_ms],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|_| "provider_binding_lookup_failed")?;
            let stored: Command =
                serde_json::from_str(&stored_json.ok_or_else(|| "lease_not_current".to_string())?)
                    .map_err(|_| "stored_command_invalid")?;
            let durable = stored
                .parameters
                .get("provider_command")
                .ok_or_else(|| "durable_provider_command_missing".to_string())?;
            let supplied =
                serde_json::to_value(&request.command).map_err(|_| "provider_command_invalid")?;
            if durable != &supplied
                || stored.target_id != request.command.target.track_id
                || stored.command_name != "intercept"
            {
                return Err("provider_command_does_not_match_durable_envelope".into());
            }
            if request.command.expected_world_epoch != *self.epoch
                || request.command.expected_world_revision
                    > self.delta_sequence.load(Ordering::SeqCst)
            {
                return Err("durable_world_precondition_not_current".into());
            }
        }
        let gate = match validate_safety_gate(&request.command, &request.worker_gate_evidence) {
            Ok(gate) => gate,
            Err(reason) => {
                return self.finish_without_dispatch(
                    &command_id,
                    &request,
                    &attempt_id,
                    ProviderExecutionState::Rejected,
                    format!("safety_gate:{reason:?}"),
                );
            }
        };
        let context = DispatchContext {
            scenario_id: request.scenario_id.clone(),
            gate,
        };
        let prepared = match provider.prepare(&context, &request.command).await {
            Ok(prepared) => prepared,
            Err(ProviderError::Transport(reason)) => {
                return self.finish_without_dispatch(
                    &command_id,
                    &request,
                    &attempt_id,
                    ProviderExecutionState::RetryableNotDispatched,
                    format!("prepare_transport:{reason}"),
                );
            }
            Err(reason) => {
                return self.finish_without_dispatch(
                    &command_id,
                    &request,
                    &attempt_id,
                    ProviderExecutionState::Rejected,
                    format!("prepare:{reason:?}"),
                );
            }
        };

        // Revalidate current time/authority/target freshness immediately before
        // the irreversible boundary, then atomically verify the lease and
        // persist the exact provider request fingerprint.
        let mut send_gate = request.worker_gate_evidence.clone();
        send_gate.now = Utc::now();
        if let Err(reason) = validate_safety_gate(&request.command, &send_gate) {
            return self.finish_without_dispatch(
                &command_id,
                &request,
                &attempt_id,
                ProviderExecutionState::Rejected,
                format!("safety_gate_before_send:{reason:?}"),
            );
        }
        {
            let mut db = self.command_db.lock().unwrap();
            let tx = db
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(|_| "begin_dispatch_attempt_transaction_failed")?;
            let now_ms = unix_ms();
            let current: Option<String> = tx
                .query_row(
                    "SELECT command_json FROM commands WHERE command_id=?1 AND execution_state='pending'
                     AND worker_id=?2 AND lease_token=?3 AND lease_expires_at_ms>?4",
                    params![command_id, request.worker_id, request.lease_token, now_ms],
                    |row| row.get(0),
                )
                .optional()
                .map_err(|_| "dispatch_lease_lookup_failed")?;
            let Some(stored_json) = current else {
                return Err("lease_not_current".into());
            };
            let stored: Command =
                serde_json::from_str(&stored_json).map_err(|_| "stored_command_invalid")?;
            if stored.command_id != request.command.command_id
                || stored.target_id != request.command.target.track_id
                || stored.command_name != "intercept"
            {
                return Err("provider_command_does_not_match_leased_command".into());
            }
            let fenced = tx
                .execute(
                    "UPDATE commands SET execution_state='terminal',last_error='provider_dispatch_in_progress'
                     WHERE command_id=?1 AND execution_state='pending' AND worker_id=?2
                     AND lease_token=?3 AND lease_expires_at_ms>?4",
                    params![command_id, request.worker_id, request.lease_token, now_ms],
                )
                .map_err(|_| "fence_dispatch_command_failed")?;
            if fenced != 1 {
                return Err("lease_not_current".into());
            }
            tx.execute(
                "INSERT INTO provider_dispatch_attempts(
                   attempt_id,command_id,worker_id,lease_token,provider_id,operation_id,
                   request_fingerprint,state,automatic_retry_allowed,created_at,updated_at)
                 VALUES(?1,?2,?3,?4,?5,?6,?7,'sending',0,?8,?8)",
                params![
                    attempt_id,
                    command_id,
                    request.worker_id,
                    request.lease_token,
                    prepared.provider_id.0,
                    prepared.operation_id,
                    prepared.command_fingerprint,
                    now(),
                ],
            )
            .map_err(|_| "persist_dispatch_attempt_failed")?;
            tx.commit().map_err(|_| "commit_dispatch_attempt_failed")?;
        }

        let disposition = provider.submit(&prepared).await;
        let (state, retry, reason, external_operation_id, provider_accepted_at) = match disposition
        {
            Ok(SubmitDisposition::Accepted { submission }) => (
                ProviderExecutionState::Accepted,
                false,
                None,
                submission.provider_operation_id,
                Some(submission.accepted_at.to_rfc3339()),
            ),
            Ok(SubmitDisposition::Rejected { code, reason }) if code == "not_dispatched" => (
                ProviderExecutionState::RetryableNotDispatched,
                true,
                Some(format!("{code}:{reason}")),
                None,
                None,
            ),
            Ok(SubmitDisposition::Rejected { code, reason }) => (
                ProviderExecutionState::Rejected,
                false,
                Some(format!("{code}:{reason}")),
                None,
                None,
            ),
            Ok(SubmitDisposition::UnknownExternalOutcome {
                reason,
                automatic_retry_allowed,
            }) => (
                ProviderExecutionState::UnknownExternalOutcome,
                automatic_retry_allowed,
                Some(reason),
                None,
                None,
            ),
            Err(error) => (
                ProviderExecutionState::UnknownExternalOutcome,
                false,
                Some(format!("submit:{error:?}")),
                None,
                None,
            ),
        };
        let reason_ref = reason.as_deref();
        let mut db = self.command_db.lock().unwrap();
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| "begin_dispatch_result_transaction_failed")?;
        let tx_state = match state {
            ProviderExecutionState::Accepted => "awaiting_reconciliation",
            ProviderExecutionState::Rejected => "rejected",
            ProviderExecutionState::UnknownExternalOutcome => "unknown_external_outcome",
            ProviderExecutionState::RetryableNotDispatched => "retryable_not_dispatched",
        };
        let changed = tx
            .execute(
                "UPDATE provider_dispatch_attempts SET state=?1,automatic_retry_allowed=?2,
                 reason=?3,external_operation_id=?4,provider_accepted_at=?5,updated_at=?6
                 WHERE attempt_id=?7 AND state='sending'",
                params![
                    tx_state,
                    retry as i64,
                    reason_ref,
                    external_operation_id,
                    provider_accepted_at,
                    now(),
                    attempt_id
                ],
            )
            .map_err(|_| "persist_dispatch_result_failed")?;
        if changed != 1 {
            return Err("dispatch_attempt_not_current".into());
        }
        let command_state = if retry { "pending" } else { "terminal" };
        let next_attempt = unix_ms().saturating_add(request.retry_after_ms as i64);
        let fenced = tx
            .execute(
                "UPDATE commands SET execution_state=?1,worker_id=NULL,lease_token=NULL,
             lease_expires_at_ms=NULL,last_error=?2,next_attempt_at_ms=?3
             WHERE command_id=?4 AND execution_state='terminal'
             AND worker_id=?5 AND lease_token=?6",
                params![
                    command_state,
                    reason_ref,
                    next_attempt,
                    command_id,
                    request.worker_id,
                    request.lease_token
                ],
            )
            .map_err(|_| "persist_dispatch_terminal_failed")?;
        if fenced != 1 {
            return Err("dispatch_completion_not_current".into());
        }
        tx.commit().map_err(|_| "commit_dispatch_result_failed")?;
        Ok(ProviderExecutionResult {
            command_id,
            attempt_id,
            state,
            automatic_retry_allowed: retry,
            reason,
        })
    }

    fn finish_without_dispatch(
        &self,
        command_id: &str,
        request: &ProviderExecutionRequest,
        attempt_id: &str,
        state: ProviderExecutionState,
        reason: String,
    ) -> Result<ProviderExecutionResult, String> {
        let retry = state == ProviderExecutionState::RetryableNotDispatched;
        let mut db = self.command_db.lock().unwrap();
        let tx = db
            .transaction_with_behavior(TransactionBehavior::Immediate)
            .map_err(|_| "begin_pre_dispatch_result_transaction_failed")?;
        let now_ms = unix_ms();
        let next = now_ms.saturating_add(request.retry_after_ms as i64);
        let terminal = !retry;
        let execution_state = if terminal { "terminal" } else { "pending" };
        let changed = tx
            .execute(
                "UPDATE commands SET execution_state=?1,worker_id=NULL,lease_token=NULL,
             lease_expires_at_ms=NULL,next_attempt_at_ms=?2,last_error=?3
             WHERE command_id=?4 AND execution_state='pending' AND worker_id=?5
             AND lease_token=?6 AND lease_expires_at_ms>?7",
                params![
                    execution_state,
                    next,
                    reason,
                    command_id,
                    request.worker_id,
                    request.lease_token,
                    now_ms
                ],
            )
            .map_err(|_| "persist_pre_dispatch_result_failed")?;
        if changed != 1 {
            return Err("lease_not_current".into());
        }
        tx.execute(
            "INSERT INTO provider_dispatch_attempts(attempt_id,command_id,worker_id,lease_token,
             provider_id,operation_id,request_fingerprint,state,automatic_retry_allowed,reason,
             created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,'not_prepared',?7,?8,?9,?10,?10)",
            params![
                attempt_id,
                command_id,
                request.worker_id,
                request.lease_token,
                request.command.provider_id.0,
                request.command.operation_id,
                if retry {
                    "retryable_not_dispatched"
                } else {
                    "rejected"
                },
                retry as i64,
                reason,
                now()
            ],
        )
        .map_err(|_| "persist_pre_dispatch_attempt_failed")?;
        tx.commit()
            .map_err(|_| "commit_pre_dispatch_result_failed")?;
        Ok(ProviderExecutionResult {
            command_id: command_id.into(),
            attempt_id: attempt_id.into(),
            state,
            automatic_retry_allowed: retry,
            reason: Some(reason),
        })
    }

    /// Claims one accepted provider operation for reconciliation. Reconciliation
    /// is read-only at the provider boundary, so an interrupted claim is reset
    /// to `awaiting_reconciliation` when the gateway restarts.
    pub async fn reconcile_provider_operation(
        &self,
        command_id: &str,
        worker_id: &str,
        provider: &dyn InterceptorProvider,
    ) -> Result<ReconciliationState, String> {
        self.reconcile_provider_operation_with_limits(
            command_id,
            worker_id,
            provider,
            Duration::from_secs(30),
            Duration::from_secs(5),
        )
        .await
    }

    pub async fn reconcile_provider_operation_with_limits(
        &self,
        command_id: &str,
        worker_id: &str,
        provider: &dyn InterceptorProvider,
        lease_duration: Duration,
        provider_timeout: Duration,
    ) -> Result<ReconciliationState, String> {
        if !valid_id(command_id) || !valid_id(worker_id) {
            return Err("invalid_reconciliation_request".into());
        }
        if lease_duration.is_zero() || provider_timeout.is_zero() {
            return Err("invalid_reconciliation_limits".into());
        }
        let token = Uuid::new_v4().to_string();
        let external_id = {
            let mut db = self.command_db.lock().unwrap();
            let tx = db
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .map_err(|_| "begin_reconciliation_claim_failed")?;
            let claim_now = unix_ms();
            let row: Option<(String, Option<String>, String)> = tx
                .query_row(
                    "SELECT operation_id,external_operation_id,provider_id
                     FROM provider_dispatch_attempts
                     WHERE command_id=?1 AND (state='awaiting_reconciliation'
                       OR (state='reconciling' AND reconciliation_lease_expires_at_ms<=?2))
                     ORDER BY created_at DESC LIMIT 1",
                    params![command_id, claim_now],
                    |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
                )
                .optional()
                .map_err(|_| "lookup_reconciliation_operation_failed")?;
            let Some((operation_id, provider_operation_id, durable_provider_id)) = row else {
                return Err("operation_not_awaiting_reconciliation".into());
            };
            if provider.provider_id().0 != durable_provider_id {
                return Err("reconciliation_provider_mismatch".into());
            }
            let lease_ms = i64::try_from(lease_duration.as_millis()).unwrap_or(i64::MAX);
            let lease_expires = claim_now.saturating_add(lease_ms);
            let changed = tx
                .execute(
                    "UPDATE provider_dispatch_attempts SET state='reconciling',
                     reconciliation_worker_id=?1,reconciliation_token=?2,
                     reconciliation_lease_expires_at_ms=?3,updated_at=?4
                     WHERE command_id=?5 AND (state='awaiting_reconciliation'
                       OR (state='reconciling' AND reconciliation_lease_expires_at_ms<=?6))",
                    params![
                        worker_id,
                        token,
                        lease_expires,
                        now(),
                        command_id,
                        claim_now
                    ],
                )
                .map_err(|_| "claim_reconciliation_operation_failed")?;
            if changed != 1 {
                return Err("reconciliation_claim_conflict".into());
            }
            tx.commit()
                .map_err(|_| "commit_reconciliation_claim_failed")?;
            provider_operation_id.unwrap_or(operation_id)
        };

        let report =
            match tokio::time::timeout(provider_timeout, provider.reconcile(&external_id)).await {
                Ok(report) => report,
                Err(_) => Err(ProviderError::Transport("provider_call_timeout".into())),
            };
        let (state, db_state, reason, outcome_json) = match report {
            Ok(report) => {
                let encoded = serde_json::to_string(&report)
                    .map_err(|_| "encode_reconciliation_report_failed")?;
                if let Some(outcome) = &report.outcome {
                    if outcome.intercepted {
                        (
                            ReconciliationState::AuthoritativeSucceeded,
                            "authoritative_succeeded",
                            None,
                            Some(encoded),
                        )
                    } else {
                        (
                            ReconciliationState::AuthoritativeFailed,
                            "authoritative_failed",
                            None,
                            Some(encoded),
                        )
                    }
                } else if matches!(
                    report.state,
                    ExternalOperationState::Failed { .. }
                        | ExternalOperationState::Cancelled
                        | ExternalOperationState::Rejected { .. }
                ) {
                    (
                        ReconciliationState::AuthoritativeFailed,
                        "authoritative_failed",
                        Some("provider_terminal_without_intercept".into()),
                        Some(encoded),
                    )
                } else if matches!(
                    report.state,
                    ExternalOperationState::UnknownExternalOutcome { .. }
                ) {
                    (
                        ReconciliationState::ManualUnverifiable,
                        "manual_unverifiable",
                        Some("provider_reports_unknown_external_outcome".into()),
                        Some(encoded),
                    )
                } else {
                    (
                        ReconciliationState::AwaitingReconciliation,
                        "awaiting_reconciliation",
                        Some("provider_operation_not_terminal".into()),
                        Some(encoded),
                    )
                }
            }
            Err(ProviderError::Unsupported(_)) => (
                ReconciliationState::ManualUnverifiable,
                "manual_unverifiable",
                Some("provider_has_no_authoritative_lookup".into()),
                None,
            ),
            Err(ProviderError::Transport(reason)) => (
                ReconciliationState::AwaitingReconciliation,
                "awaiting_reconciliation",
                Some(format!("reconciliation_transport:{reason}")),
                None,
            ),
            Err(error) => (
                ReconciliationState::ManualUnverifiable,
                "manual_unverifiable",
                Some(format!("reconciliation:{error:?}")),
                None,
            ),
        };
        let db = self.command_db.lock().unwrap();
        let changed = db
            .execute(
                "UPDATE provider_dispatch_attempts SET state=?1,reason=?2,
                 reconciliation_outcome_json=?3,reconciliation_worker_id=NULL,
                 reconciliation_token=NULL,reconciliation_lease_expires_at_ms=NULL,
                 updated_at=?4 WHERE command_id=?5
                 AND state='reconciling' AND reconciliation_worker_id=?6
                 AND reconciliation_token=?7",
                params![
                    db_state,
                    reason,
                    outcome_json,
                    now(),
                    command_id,
                    worker_id,
                    token
                ],
            )
            .map_err(|_| "persist_reconciliation_result_failed")?;
        if changed != 1 {
            return Err("reconciliation_claim_not_current".into());
        }
        Ok(state)
    }
}

pub fn app(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(health))
        .route("/metrics", get(metrics))
        .route("/v1/snapshot", get(snapshot))
        .route("/v1/observations", post(ingest))
        .route("/v1/observations/stream", get(observation_stream_upgrade))
        .route("/v1/commands", post(command))
        .route("/v1/outbox/commands", get(pending_commands))
        .route("/v1/outbox/claim", post(claim_command))
        .route("/v1/outbox/commands/{command_id}/renew", post(renew_lease))
        .route(
            "/v1/outbox/commands/{command_id}/release",
            post(release_lease),
        )
        .route("/v1/outbox/commands/{command_id}/retry", post(retry_lease))
        .route("/v1/commands/{command_id}", get(reconcile))
        .route("/v1/commands/{command_id}/outcome", post(record_outcome))
        .route("/v1/deltas", get(ws_upgrade))
        .with_state(state)
        .layer(DefaultBodyLimit::max(64 * 1024))
        .layer(TimeoutLayer::with_status_code(
            StatusCode::REQUEST_TIMEOUT,
            Duration::from_secs(5),
        ))
}

fn with_epoch(state: &AppState, body: impl IntoResponse) -> Response {
    let mut response = body.into_response();
    response.headers_mut().insert(
        "x-sentinel-epoch",
        HeaderValue::from_str(&state.epoch).unwrap(),
    );
    response
}

fn storage_error(operation: &str) -> Response {
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(json!({"error":"command_store_unavailable","operation":operation})),
    )
        .into_response()
}

fn unix_ms() -> i64 {
    Utc::now().timestamp_millis()
}

fn valid_lease_duration(ms: u64) -> bool {
    (100..=300_000).contains(&ms)
}

fn lease_conflict() -> Response {
    (
        StatusCode::CONFLICT,
        Json(json!({"error":"lease_not_current"})),
    )
        .into_response()
}

async fn health(State(s): State<AppState>) -> Response {
    with_epoch(
        &s,
        Json(json!({"status":"ok","schema_version":VERSION,"server_epoch":s.epoch.as_str()})),
    )
}

fn percentile(v: &mut [u64], q: f64) -> u64 {
    if v.is_empty() {
        return 0;
    }
    v.sort_unstable();
    v[((v.len() - 1) as f64 * q).ceil() as usize]
}

async fn metrics(State(s): State<AppState>) -> Json<MetricsView> {
    let samples: Vec<_> = s
        .metrics
        .observation_latency_us
        .lock()
        .unwrap()
        .iter()
        .copied()
        .collect();
    let observation_cache = s.observations.lock().unwrap();
    let track_entries = s.tracks.read().unwrap().len();
    let source_track_identity_entries = s.source_sequences.lock().unwrap().len();
    Json(MetricsView {
        observations: s.metrics.observations.load(Ordering::Relaxed),
        commands_accepted: s.metrics.commands_accepted.load(Ordering::Relaxed),
        command_duplicates: s.metrics.command_duplicates.load(Ordering::Relaxed),
        command_conflicts: s.metrics.command_conflicts.load(Ordering::Relaxed),
        ws_connected: s.metrics.ws_connected.load(Ordering::Relaxed),
        slow_client_disconnects: s.metrics.slow_disconnects.load(Ordering::Relaxed),
        deltas_published: s.metrics.deltas_published.load(Ordering::Relaxed),
        delta_batches_sent: s.metrics.delta_batches_sent.load(Ordering::Relaxed),
        deltas_sent_in_batches: s.metrics.deltas_sent_in_batches.load(Ordering::Relaxed),
        delta_batch_compressed_bytes: s
            .metrics
            .delta_batch_compressed_bytes
            .load(Ordering::Relaxed),
        delta_batch_uncompressed_bytes: s
            .metrics
            .delta_batch_uncompressed_bytes
            .load(Ordering::Relaxed),
        max_client_queue_depth: s.metrics.max_client_queue_depth.load(Ordering::Relaxed),
        observation_latency_us_p50: percentile(&mut samples.clone(), 0.50),
        observation_latency_us_p95: percentile(&mut samples.clone(), 0.95),
        observation_latency_us_p99: percentile(&mut samples.clone(), 0.99),
        observation_latency_sample_count: samples.len(),
        observation_latency_sample_capacity: OBSERVATION_LATENCY_SAMPLE_RETENTION,
        ingress_to_publish_us_p50: percentile(&mut samples.clone(), 0.50),
        ingress_to_publish_us_p95: percentile(&mut samples.clone(), 0.95),
        ingress_to_publish_us_p99: percentile(&mut samples.clone(), 0.99),
        observation_idempotency_entries: observation_cache.entries.len(),
        observation_idempotency_capacity: observation_cache.capacity,
        observation_idempotency_evictions: s
            .metrics
            .observation_idempotency_evictions
            .load(Ordering::Relaxed),
        track_entries,
        track_capacity: s.max_tracks,
        track_capacity_rejections: s.metrics.track_capacity_rejections.load(Ordering::Relaxed),
        source_track_identity_entries,
        source_track_identity_capacity: s.max_source_track_identities,
        source_track_identity_capacity_rejections: s
            .metrics
            .source_track_identity_capacity_rejections
            .load(Ordering::Relaxed),
        observation_streams_connected: s
            .metrics
            .observation_streams_connected
            .load(Ordering::Relaxed),
        observation_stream_accepted: s
            .metrics
            .observation_stream_accepted
            .load(Ordering::Relaxed),
        observation_stream_rejected: s
            .metrics
            .observation_stream_rejected
            .load(Ordering::Relaxed),
        observation_stream_backpressure_disconnects: s
            .metrics
            .observation_stream_backpressure_disconnects
            .load(Ordering::Relaxed),
        max_observation_ack_queue_depth: s
            .metrics
            .max_observation_ack_queue_depth
            .load(Ordering::Relaxed),
    })
}

async fn snapshot(State(s): State<AppState>) -> Response {
    // Ingest allocates its delta sequence while holding the write lock. Reading
    // the cursor while holding this read lock therefore makes state+cursor an
    // atomic recovery boundary.
    let tracks_guard = s.tracks.read().unwrap();
    let seq = s.delta_sequence.load(Ordering::SeqCst);
    let tracks: Vec<_> = tracks_guard.values().cloned().collect();
    let canonical = serde_json::to_vec(&tracks).unwrap();
    let hash = format!("sha256:{:x}", Sha256::digest(canonical));
    let mut response = with_epoch(
        &s,
        Json(json!({
            "schema_version":VERSION,"message_type":"snapshot","message_id":format!("snapshot-{seq}"),
            "stream_id":STREAM_ID,"stream_sequence":seq,"emitted_at":now(),
            "correlation":{"correlation_id":format!("snapshot-{seq}")},
            "checkpoint_id":format!("{}-{seq}",s.epoch),"covers_through":seq,"tracks":tracks,"state_hash":hash
        })),
    );
    response.headers_mut().insert(
        "x-sentinel-cursor",
        HeaderValue::from_str(&seq.to_string()).unwrap(),
    );
    response
}

enum ObservationDisposition {
    Accepted(TrackDelta),
    Duplicate(TrackDelta),
    Rejected(StatusCode, &'static str),
}

fn process_observation(s: &AppState, o: Observation) -> ObservationDisposition {
    let started = Instant::now();
    if o.schema_version != VERSION
        || o.message_type != "observation"
        || o.stream_sequence == 0
        || o.source_sequence == 0
        || !valid_id(&o.message_id)
        || !valid_id(&o.stream_id)
        || !valid_id(&o.observation_id)
        || !valid_id(&o.track_id)
        || !valid_id(&o.source_id)
        || !valid_id(&o.correlation.correlation_id)
        || !valid_timestamp(&o.emitted_at)
        || !valid_timestamp(&o.source_time)
    {
        return ObservationDisposition::Rejected(
            StatusCode::BAD_REQUEST,
            "invalid_realtime_v1_observation",
        );
    }
    // The prototype uses one short critical section to make observation
    // idempotency, source ordering, track mutation and cursor allocation one
    // transaction. The production keyed-worker version will shard this lock.
    let _ingestion = s.ingestion_lock.lock().unwrap();
    // Retain the digest bytes directly. Hex is only a presentation encoding
    // and doubled the payload while adding one allocation per cache entry.
    let observation_fingerprint: [u8; 32] = Sha256::digest(serde_json::to_vec(&o).unwrap()).into();
    if let Some(existing) = s
        .observations
        .lock()
        .unwrap()
        .entries
        .get(o.observation_id.as_str())
    {
        if existing.fingerprint != observation_fingerprint {
            return ObservationDisposition::Rejected(
                StatusCode::CONFLICT,
                "observation_id_reused_with_different_content",
            );
        }
        return ObservationDisposition::Duplicate(existing.delta.expand());
    }
    let key = (o.source_id.clone(), o.track_id.clone());
    let is_new_track = !s.tracks.read().unwrap().contains_key(&o.track_id);
    if is_new_track && s.tracks.read().unwrap().len() >= s.max_tracks {
        s.metrics
            .track_capacity_rejections
            .fetch_add(1, Ordering::Relaxed);
        return ObservationDisposition::Rejected(
            StatusCode::TOO_MANY_REQUESTS,
            "track_capacity_exceeded",
        );
    }
    {
        let mut seqs = s.source_sequences.lock().unwrap();
        if !seqs.contains_key(&key) && seqs.len() >= s.max_source_track_identities {
            s.metrics
                .source_track_identity_capacity_rejections
                .fetch_add(1, Ordering::Relaxed);
            return ObservationDisposition::Rejected(
                StatusCode::TOO_MANY_REQUESTS,
                "source_track_identity_capacity_exceeded",
            );
        }
        if o.source_sequence <= *seqs.get(&key).unwrap_or(&0) {
            return ObservationDisposition::Rejected(
                StatusCode::CONFLICT,
                "source_sequence_not_increasing",
            );
        }
        seqs.insert(key, o.source_sequence);
    }
    let (track, previous_revision, seq) = {
        let mut tracks = s.tracks.write().unwrap();
        let previous = tracks.get(&o.track_id).map_or(0, |t| t.revision);
        let t = TrackState {
            track_id: o.track_id.clone(),
            revision: previous + 1,
            source_time: o.source_time.clone(),
            position: o.position,
            velocity: o.velocity,
        };
        let seq = s.next_delta_sequence();
        tracks.insert(o.track_id.clone(), t.clone());
        (t, previous, seq)
    };
    let delta = TrackDelta {
        schema_version: VERSION,
        message_type: "track_delta",
        message_id: format!("delta-{seq}"),
        stream_id: STREAM_ID,
        stream_sequence: seq,
        emitted_at: now(),
        correlation: Correlation {
            correlation_id: o.correlation.correlation_id,
            causation_id: Some(o.message_id),
            trace_id: o.correlation.trace_id,
        },
        track,
        previous_revision,
    };
    let evicted = s.observations.lock().unwrap().insert(
        o.observation_id,
        StoredObservation {
            fingerprint: observation_fingerprint,
            delta: CompactTrackDelta::from(&delta),
        },
    );
    s.metrics
        .observation_idempotency_evictions
        .fetch_add(evicted as u64, Ordering::Relaxed);
    let payload = json!({
        "transport_version":"sentinel-gateway/v1",
        "server_epoch":s.epoch.as_str(),
        "stream_id":STREAM_ID,
        "base_sequence":seq - 1,
        "result_sequence":seq,
        "payload":delta
    })
    .to_string();
    s.hub.lock().unwrap().publish(seq, &payload, &s.metrics);
    s.metrics.observations.fetch_add(1, Ordering::Relaxed);
    s.metrics.deltas_published.fetch_add(1, Ordering::Relaxed);
    let mut latencies = s.metrics.observation_latency_us.lock().unwrap();
    latencies.push_back(started.elapsed().as_micros() as u64);
    if latencies.len() > OBSERVATION_LATENCY_SAMPLE_RETENTION {
        latencies.pop_front();
    }
    drop(latencies);
    ObservationDisposition::Accepted(delta)
}

async fn ingest(State(s): State<AppState>, Json(o): Json<Observation>) -> Response {
    match process_observation(&s, o) {
        ObservationDisposition::Accepted(delta) => {
            with_epoch(&s, (StatusCode::ACCEPTED, Json(delta)))
        }
        ObservationDisposition::Duplicate(delta) => with_epoch(&s, (StatusCode::OK, Json(delta))),
        ObservationDisposition::Rejected(status, error) => {
            with_epoch(&s, (status, Json(json!({"error":error}))))
        }
    }
}

async fn observation_stream_upgrade(State(s): State<AppState>, ws: WebSocketUpgrade) -> Response {
    let state = s.clone();
    with_epoch(
        &s,
        ws.max_message_size(64 * 1024)
            .max_frame_size(64 * 1024)
            .on_upgrade(move |socket| observation_stream(socket, state)),
    )
}

fn stream_ack(
    state: &AppState,
    observation: Option<&Observation>,
    accepted: bool,
    duplicate: bool,
    result_sequence: Option<u64>,
    error: Option<&'static str>,
) -> Message {
    Message::Text(
        serde_json::to_string(&ObservationStreamAck {
            transport_version: "sentinel-gateway/v1",
            message_type: "observation_ack",
            server_epoch: state.epoch.as_str().to_owned(),
            message_id: observation.map(|item| item.message_id.clone()),
            observation_id: observation.map(|item| item.observation_id.clone()),
            correlation_id: observation.map(|item| item.correlation.correlation_id.clone()),
            accepted,
            duplicate,
            result_sequence,
            error,
        })
        .expect("serialize observation acknowledgement")
        .into(),
    )
}

/// One ordered, full-duplex observation stream per source. The reader never
/// waits for an acknowledgement round trip: accepted/rejected acknowledgements
/// are placed on a bounded writer queue in receive order. If the peer does not
/// read acknowledgements, only that stream is disconnected instead of allowing
/// unbounded memory growth.
async fn observation_stream(socket: WebSocket, state: AppState) {
    let (mut writer, mut reader) = socket.split();
    let (ack_tx, mut ack_rx) = mpsc::channel::<Message>(state.client_queue_capacity);
    state
        .metrics
        .observation_streams_connected
        .fetch_add(1, Ordering::Relaxed);

    let hello = Message::Text(
        json!({
            "transport_version":"sentinel-gateway/v1",
            "message_type":"observation_stream_hello",
            "schema_version":VERSION,
            "server_epoch":state.epoch.as_str(),
            "acknowledgement":"per_message_ordered",
            "source_binding":"first_observation_source_id",
            "max_message_bytes":64 * 1024,
            "ack_queue_capacity":state.client_queue_capacity
        })
        .to_string()
        .into(),
    );
    let ack_send_delay = state.observation_ack_send_delay;
    let writer_task = tokio::spawn(async move {
        if !matches!(
            tokio::time::timeout(OBSERVATION_STREAM_WRITE_TIMEOUT, writer.send(hello)).await,
            Ok(Ok(()))
        ) {
            return;
        }
        while let Some(message) = ack_rx.recv().await {
            if !ack_send_delay.is_zero() {
                tokio::time::sleep(ack_send_delay).await;
            }
            if !matches!(
                tokio::time::timeout(OBSERVATION_STREAM_WRITE_TIMEOUT, writer.send(message)).await,
                Ok(Ok(()))
            ) {
                return;
            }
        }
        let _ = tokio::time::timeout(
            OBSERVATION_STREAM_WRITE_TIMEOUT,
            writer.send(Message::Close(None)),
        )
        .await;
    });

    let mut bound_source: Option<String> = None;
    let mut abort_writer = false;
    loop {
        let incoming =
            match tokio::time::timeout(OBSERVATION_STREAM_READ_IDLE_TIMEOUT, reader.next()).await {
                Ok(Some(incoming)) => incoming,
                Ok(None) | Err(_) => break,
            };
        let raw = match incoming {
            Ok(Message::Text(value)) => value.as_bytes().to_vec(),
            Ok(Message::Binary(value)) => value.to_vec(),
            Ok(Message::Close(_)) | Err(_) => break,
            Ok(Message::Ping(payload)) => {
                if ack_tx.try_send(Message::Pong(payload)).is_err() {
                    state
                        .metrics
                        .observation_stream_backpressure_disconnects
                        .fetch_add(1, Ordering::Relaxed);
                    abort_writer = true;
                    break;
                }
                continue;
            }
            Ok(Message::Pong(_)) => continue,
        };
        let parsed = serde_json::from_slice::<Observation>(&raw);
        let (ack, accepted) = match parsed {
            Err(_) => (
                stream_ack(
                    &state,
                    None,
                    false,
                    false,
                    None,
                    Some("invalid_realtime_v1_observation"),
                ),
                false,
            ),
            Ok(observation) => {
                if bound_source
                    .as_ref()
                    .is_some_and(|source| source != &observation.source_id)
                {
                    (
                        stream_ack(
                            &state,
                            Some(&observation),
                            false,
                            false,
                            None,
                            Some("observation_stream_source_changed"),
                        ),
                        false,
                    )
                } else {
                    match process_observation(&state, observation.clone()) {
                        ObservationDisposition::Accepted(delta) => {
                            bound_source.get_or_insert_with(|| observation.source_id.clone());
                            (
                                stream_ack(
                                    &state,
                                    Some(&observation),
                                    true,
                                    false,
                                    Some(delta.stream_sequence),
                                    None,
                                ),
                                true,
                            )
                        }
                        ObservationDisposition::Duplicate(delta) => {
                            bound_source.get_or_insert_with(|| observation.source_id.clone());
                            (
                                stream_ack(
                                    &state,
                                    Some(&observation),
                                    true,
                                    true,
                                    Some(delta.stream_sequence),
                                    None,
                                ),
                                true,
                            )
                        }
                        ObservationDisposition::Rejected(_, error) => (
                            stream_ack(&state, Some(&observation), false, false, None, Some(error)),
                            false,
                        ),
                    }
                }
            }
        };
        let metric = if accepted {
            &state.metrics.observation_stream_accepted
        } else {
            &state.metrics.observation_stream_rejected
        };
        metric.fetch_add(1, Ordering::Relaxed);
        // A full ACK queue can be a transient TCP head-of-line stall under the
        // expected-cloud profile.  Apply bounded flow control to the reader
        // instead of disconnecting and replaying the whole producer window.
        // The writer independently bounds every socket write with the same
        // timeout, so a peer that truly stops reading still terminates.
        match tokio::time::timeout(OBSERVATION_STREAM_WRITE_TIMEOUT, ack_tx.send(ack)).await {
            Ok(Ok(())) => {
                let depth = ack_tx.max_capacity() - ack_tx.capacity();
                state
                    .metrics
                    .max_observation_ack_queue_depth
                    .fetch_max(depth, Ordering::Relaxed);
            }
            Ok(Err(_)) => break,
            Err(_) => {
                state
                    .metrics
                    .observation_stream_backpressure_disconnects
                    .fetch_add(1, Ordering::Relaxed);
                abort_writer = true;
                break;
            }
        }
    }
    drop(ack_tx);
    if abort_writer {
        // The peer is not draining replies. Do not await a socket writer that
        // may itself be blocked behind the peer's full receive window.
        writer_task.abort();
    }
    let _ = writer_task.await;
    state
        .metrics
        .observation_streams_connected
        .fetch_sub(1, Ordering::Relaxed);
}

fn command_fingerprint(request: &GatewayCommandRequest) -> String {
    // The server epoch is deliberately excluded. An exact retry after a crash
    // must reconcile to the already durable receipt from the previous epoch.
    let value = json!({"transport_version":request.transport_version,"command":request.command});
    format!("{:x}", Sha256::digest(serde_json::to_vec(&value).unwrap()))
}

async fn command(
    State(s): State<AppState>,
    Json(request): Json<GatewayCommandRequest>,
) -> Response {
    if request.transport_version != "sentinel-gateway/v1" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"unsupported_gateway_transport_version"})),
        )
            .into_response();
    }
    let c = &request.command;
    if c.schema_version != VERSION
        || c.message_type != "command"
        || c.stream_sequence == 0
        || !valid_id(&c.message_id)
        || !valid_id(&c.stream_id)
        || !valid_id(&c.command_id)
        || !valid_id(&c.command_name)
        || !valid_id(&c.target_id)
        || !valid_id(&c.idempotency_key)
        || !valid_id(&c.correlation.correlation_id)
        || !valid_timestamp(&c.emitted_at)
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"invalid realtime/v1 command"})),
        )
            .into_response();
    }
    let fp = command_fingerprint(&request);
    let mut db = s.command_db.lock().unwrap();
    let by_key: Option<(String, String, String)> = match db
        .query_row(
            "SELECT command_id, fingerprint, receipt_json FROM commands WHERE idempotency_key=?1",
            [&c.idempotency_key],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
    {
        Ok(value) => value,
        Err(_) => return storage_error("lookup_idempotency_key"),
    };
    if let Some((stored_command_id, stored_fp, receipt_json)) = by_key {
        if stored_fp != fp || stored_command_id != c.command_id {
            s.metrics.command_conflicts.fetch_add(1, Ordering::Relaxed);
            return (
                StatusCode::CONFLICT,
                Json(json!({"error":"idempotency_key_reused_with_different_command"})),
            )
                .into_response();
        }
        s.metrics.command_duplicates.fetch_add(1, Ordering::Relaxed);
        let receipt: CommandReceipt = match serde_json::from_str(&receipt_json) {
            Ok(value) => value,
            Err(_) => return storage_error("decode_receipt"),
        };
        return with_epoch(&s, (StatusCode::OK, Json(receipt)));
    }
    let command_id_owner: Option<String> = match db
        .query_row(
            "SELECT idempotency_key FROM commands WHERE command_id=?1",
            [&c.command_id],
            |row| row.get(0),
        )
        .optional()
    {
        Ok(value) => value,
        Err(_) => return storage_error("lookup_command_id"),
    };
    if command_id_owner.is_some() {
        s.metrics.command_conflicts.fetch_add(1, Ordering::Relaxed);
        return (
            StatusCode::CONFLICT,
            Json(json!({"error":"command_id_reused_with_different_content_or_identity"})),
        )
            .into_response();
    }
    if request.expected_epoch != *s.epoch {
        return (
            StatusCode::CONFLICT,
            Json(json!({"error":"server_epoch_mismatch","current_epoch":s.epoch.as_str()})),
        )
            .into_response();
    }
    let actual_revision = s
        .tracks
        .read()
        .unwrap()
        .get(&c.target_id)
        .map_or(0, |t| t.revision);
    if request.expected_revision != actual_revision {
        return (StatusCode::CONFLICT, Json(json!({"error":"target_revision_mismatch","expected_revision":request.expected_revision,"actual_revision":actual_revision}))).into_response();
    }
    let seq = s.next_command_sequence();
    let receipt = CommandReceipt {
        schema_version: VERSION.into(),
        message_type: "command_receipt".into(),
        message_id: format!("receipt-{seq}"),
        stream_id: COMMAND_STREAM_ID.into(),
        stream_sequence: seq,
        emitted_at: now(),
        correlation: Correlation {
            correlation_id: c.correlation.correlation_id.clone(),
            causation_id: Some(c.message_id.clone()),
            trace_id: c.correlation.trace_id.clone(),
        },
        command_id: c.command_id.clone(),
        receipt_status: "accepted".into(),
        reason: None,
    };
    let receipt_json = serde_json::to_string(&receipt).unwrap();
    let command_json = serde_json::to_string(c).unwrap();
    let tx = match db.transaction() {
        Ok(tx) => tx,
        Err(_) => return storage_error("begin_command_transaction"),
    };
    if tx.execute(
        "INSERT INTO commands(command_id,idempotency_key,fingerprint,command_json,receipt_json,execution_state,created_at) VALUES(?1,?2,?3,?4,?5,'pending',?6)",
        params![c.command_id, c.idempotency_key, fp, command_json, receipt_json, now()],
    ).is_err() || tx.commit().is_err() {
        return storage_error("persist_command");
    }
    s.metrics.commands_accepted.fetch_add(1, Ordering::Relaxed);
    with_epoch(&s, (StatusCode::ACCEPTED, Json(receipt)))
}

async fn pending_commands(State(s): State<AppState>) -> Response {
    let db = s.command_db.lock().unwrap();
    let mut statement = match db.prepare(
        "SELECT command_json,receipt_json FROM commands WHERE execution_state='pending'
         AND next_attempt_at_ms<=CAST(unixepoch('subsec')*1000 AS INTEGER)
         AND (lease_token IS NULL OR lease_expires_at_ms<=CAST(unixepoch('subsec')*1000 AS INTEGER))
         ORDER BY created_at,command_id",
    ) {
        Ok(v) => v,
        Err(_) => return storage_error("prepare_pending_outbox"),
    };
    let rows = match statement.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }) {
        Ok(v) => v,
        Err(_) => return storage_error("read_pending_outbox"),
    };
    let mut pending = Vec::new();
    for row in rows {
        let (command_json, receipt_json) = match row {
            Ok(v) => v,
            Err(_) => return storage_error("read_pending_outbox"),
        };
        let command: Command = match serde_json::from_str(&command_json) {
            Ok(v) => v,
            Err(_) => return storage_error("decode_pending_command"),
        };
        let receipt: CommandReceipt = match serde_json::from_str(&receipt_json) {
            Ok(v) => v,
            Err(_) => return storage_error("decode_pending_receipt"),
        };
        pending.push(json!({"command":command,"receipt":receipt,"execution_state":"pending"}));
    }
    with_epoch(&s, Json(json!({"commands":pending})))
}

async fn claim_command(State(s): State<AppState>, Json(request): Json<ClaimRequest>) -> Response {
    if !valid_id(&request.worker_id) || !valid_lease_duration(request.lease_duration_ms) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"invalid_claim_request"})),
        )
            .into_response();
    }
    let now_ms = unix_ms();
    let expires = now_ms.saturating_add(request.lease_duration_ms as i64);
    let token = Uuid::new_v4().to_string();
    let mut db = s.command_db.lock().unwrap();
    let tx = match db.transaction_with_behavior(TransactionBehavior::Immediate) {
        Ok(v) => v,
        Err(_) => return storage_error("begin_claim_transaction"),
    };
    if tx
        .execute(
            "UPDATE commands SET execution_state='terminal',worker_id=NULL,lease_token=NULL,
             lease_expires_at_ms=NULL,last_error=COALESCE(last_error,'maximum_attempts_exhausted')
             WHERE execution_state='pending' AND attempt_count>=?1
               AND (lease_token IS NULL OR lease_expires_at_ms<=?2)",
            params![MAX_COMMAND_ATTEMPTS, now_ms],
        )
        .is_err()
    {
        return storage_error("dead_letter_exhausted_commands");
    }
    let candidate: Option<String> = match tx
        .query_row(
            "SELECT command_id FROM commands
         WHERE execution_state='pending' AND next_attempt_at_ms<=?1
           AND attempt_count<?2
           AND (lease_token IS NULL OR lease_expires_at_ms<=?1)
         ORDER BY next_attempt_at_ms,created_at,command_id LIMIT 1",
            params![now_ms, MAX_COMMAND_ATTEMPTS],
            |row| row.get(0),
        )
        .optional()
    {
        Ok(v) => v,
        Err(_) => return storage_error("select_claim_candidate"),
    };
    let Some(command_id) = candidate else {
        if tx.commit().is_err() {
            return storage_error("commit_empty_claim");
        }
        return with_epoch(&s, StatusCode::NO_CONTENT);
    };
    let changed = match tx.execute(
        "UPDATE commands SET worker_id=?1,lease_token=?2,lease_expires_at_ms=?3,
          attempt_count=attempt_count+1,last_error=NULL
         WHERE command_id=?4 AND execution_state='pending'
           AND next_attempt_at_ms<=?5 AND (lease_token IS NULL OR lease_expires_at_ms<=?5)",
        params![request.worker_id, token, expires, command_id, now_ms],
    ) {
        Ok(v) => v,
        Err(_) => return storage_error("claim_command"),
    };
    if changed != 1 {
        return storage_error("claim_race");
    }
    let row: (String, String, i64) = match tx.query_row(
        "SELECT command_json,receipt_json,attempt_count FROM commands WHERE command_id=?1",
        [&command_id],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    ) {
        Ok(v) => v,
        Err(_) => return storage_error("read_claimed_command"),
    };
    if tx.commit().is_err() {
        return storage_error("commit_claim");
    }
    let command: Command = match serde_json::from_str(&row.0) {
        Ok(v) => v,
        Err(_) => return storage_error("decode_claimed_command"),
    };
    let receipt: CommandReceipt = match serde_json::from_str(&row.1) {
        Ok(v) => v,
        Err(_) => return storage_error("decode_claimed_receipt"),
    };
    with_epoch(
        &s,
        Json(json!({"claim":{"command":command,"receipt":receipt,
        "worker_id":request.worker_id,"lease_token":token,"lease_expires_at_ms":expires,
        "attempt_count":row.2}})),
    )
}

fn command_exists(db: &Connection, command_id: &str) -> Result<bool, rusqlite::Error> {
    db.query_row(
        "SELECT 1 FROM commands WHERE command_id=?1",
        [command_id],
        |_| Ok(()),
    )
    .optional()
    .map(|v| v.is_some())
}

async fn renew_lease(
    State(s): State<AppState>,
    Path(command_id): Path<String>,
    Json(request): Json<LeaseRequest>,
) -> Response {
    let Some(duration) = request.lease_duration_ms else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"lease_duration_required"})),
        )
            .into_response();
    };
    if !valid_id(&command_id)
        || !valid_id(&request.worker_id)
        || !valid_id(&request.lease_token)
        || !valid_lease_duration(duration)
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"invalid_lease_request"})),
        )
            .into_response();
    }
    let now_ms = unix_ms();
    let expires = now_ms.saturating_add(duration as i64);
    let db = s.command_db.lock().unwrap();
    let changed = match db.execute(
        "UPDATE commands SET lease_expires_at_ms=?1 WHERE command_id=?2 AND execution_state='pending'
         AND worker_id=?3 AND lease_token=?4 AND lease_expires_at_ms>?5",
        params![expires, command_id, request.worker_id, request.lease_token, now_ms],
    ) { Ok(v) => v, Err(_) => return storage_error("renew_lease") };
    if changed == 0 {
        return match command_exists(&db, &command_id) {
            Ok(false) => StatusCode::NOT_FOUND.into_response(),
            Ok(true) => lease_conflict(),
            Err(_) => storage_error("lookup_lease_command"),
        };
    }
    with_epoch(
        &s,
        Json(
            json!({"command_id":command_id,"worker_id":request.worker_id,
        "lease_token":request.lease_token,"lease_expires_at_ms":expires}),
        ),
    )
}

fn relinquish_lease(
    s: &AppState,
    command_id: &str,
    request: LeaseRequest,
    retry: bool,
) -> Response {
    if !valid_id(command_id) || !valid_id(&request.worker_id) || !valid_id(&request.lease_token) {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"invalid_lease_request"})),
        )
            .into_response();
    }
    let delay = if retry {
        match request.retry_after_ms {
            Some(v) if v <= 86_400_000 => v,
            _ => {
                return (
                    StatusCode::BAD_REQUEST,
                    Json(json!({"error":"valid_retry_after_ms_required"})),
                )
                    .into_response();
            }
        }
    } else {
        0
    };
    let now_ms = unix_ms();
    let next = now_ms.saturating_add(delay as i64);
    let db = s.command_db.lock().unwrap();
    let changed = match db.execute(
        "UPDATE commands SET worker_id=NULL,lease_token=NULL,lease_expires_at_ms=NULL,
          next_attempt_at_ms=?1,last_error=?2,
          execution_state=CASE WHEN attempt_count>=?7 THEN 'terminal' ELSE 'pending' END
          WHERE command_id=?3 AND execution_state='pending'
          AND worker_id=?4 AND lease_token=?5 AND lease_expires_at_ms>?6",
        params![
            next,
            request.error,
            command_id,
            request.worker_id,
            request.lease_token,
            now_ms,
            MAX_COMMAND_ATTEMPTS,
        ],
    ) {
        Ok(v) => v,
        Err(_) => return storage_error("relinquish_lease"),
    };
    if changed == 0 {
        return match command_exists(&db, command_id) {
            Ok(false) => StatusCode::NOT_FOUND.into_response(),
            Ok(true) => lease_conflict(),
            Err(_) => storage_error("lookup_lease_command"),
        };
    }
    let execution_state: String = match db.query_row(
        "SELECT execution_state FROM commands WHERE command_id=?1",
        [command_id],
        |row| row.get(0),
    ) {
        Ok(value) => value,
        Err(_) => return storage_error("read_relinquished_state"),
    };
    with_epoch(
        s,
        Json(
            json!({"command_id":command_id,"execution_state":execution_state,
            "dead_lettered":execution_state == "terminal",
            "next_attempt_at_ms":next,"maximum_attempts":MAX_COMMAND_ATTEMPTS}),
        ),
    )
}

async fn release_lease(
    State(s): State<AppState>,
    Path(command_id): Path<String>,
    Json(request): Json<LeaseRequest>,
) -> Response {
    relinquish_lease(&s, &command_id, request, false)
}

async fn retry_lease(
    State(s): State<AppState>,
    Path(command_id): Path<String>,
    Json(request): Json<LeaseRequest>,
) -> Response {
    relinquish_lease(&s, &command_id, request, true)
}

async fn reconcile(State(s): State<AppState>, Path(command_id): Path<String>) -> Response {
    let db = s.command_db.lock().unwrap();
    let row: Option<(String, Option<String>)> = match db.query_row(
        "SELECT c.receipt_json, o.outcome_json FROM commands c LEFT JOIN command_outcomes o ON o.command_id=c.command_id WHERE c.command_id=?1",
        [&command_id], |row| Ok((row.get(0)?, row.get(1)?)),
    ).optional() {
        Ok(value) => value,
        Err(_) => return storage_error("reconcile_command"),
    };
    let Some((receipt_json, outcome_json)) = row else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let receipt: CommandReceipt = match serde_json::from_str(&receipt_json) {
        Ok(v) => v,
        Err(_) => return storage_error("decode_receipt"),
    };
    let outcome: Option<CommandOutcome> =
        match outcome_json.map(|v| serde_json::from_str(&v)).transpose() {
            Ok(v) => v,
            Err(_) => return storage_error("decode_outcome"),
        };
    with_epoch(&s, Json(json!({"receipt":receipt,"outcome":outcome})))
}

fn outcome_fingerprint(outcome: &CommandOutcome) -> String {
    format!("{:x}", Sha256::digest(serde_json::to_vec(outcome).unwrap()))
}

async fn record_outcome(
    State(s): State<AppState>,
    Path(command_id): Path<String>,
    Json(request): Json<CommandOutcomeRequest>,
) -> Response {
    const TERMINAL_STATUSES: &[&str] =
        &["succeeded", "failed", "cancelled", "intercepted", "missed"];
    if !valid_id(&command_id)
        || !valid_id(&request.worker_id)
        || !valid_id(&request.lease_token)
        || !valid_id(&request.outcome_id)
        || !TERMINAL_STATUSES.contains(&request.status.as_str())
        || !valid_id(&request.correlation.correlation_id)
        || !valid_timestamp(&request.emitted_at)
    {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"invalid_command_outcome"})),
        )
            .into_response();
    }
    let outcome = CommandOutcome {
        command_id: command_id.clone(),
        outcome_id: request.outcome_id,
        status: request.status,
        emitted_at: request.emitted_at,
        correlation: request.correlation,
        details: request.details,
    };
    let fingerprint = outcome_fingerprint(&outcome);
    let mut db = s.command_db.lock().unwrap();
    type CommandLeaseRow = (String, Option<String>, Option<String>, Option<i64>);
    let command_row: Option<CommandLeaseRow> = match db
        .query_row(
            "SELECT command_json,worker_id,lease_token,lease_expires_at_ms FROM commands WHERE command_id=?1",
            [&command_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
    {
        Ok(v) => v,
        Err(_) => return storage_error("lookup_outcome_command"),
    };
    let Some((command_json, active_worker, active_token, lease_expires)) = command_row else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let stored_command: Command = match serde_json::from_str(&command_json) {
        Ok(v) => v,
        Err(_) => return storage_error("decode_outcome_command"),
    };
    if outcome.correlation.correlation_id != stored_command.correlation.correlation_id
        || outcome.correlation.causation_id.as_deref() != Some(stored_command.message_id.as_str())
    {
        return (
            StatusCode::CONFLICT,
            Json(json!({"error":"outcome_command_correlation_mismatch"})),
        )
            .into_response();
    }
    let outcome_owner: Option<String> = match db
        .query_row(
            "SELECT command_id FROM command_outcomes WHERE outcome_id=?1",
            [&outcome.outcome_id],
            |row| row.get(0),
        )
        .optional()
    {
        Ok(v) => v,
        Err(_) => return storage_error("lookup_outcome_id"),
    };
    if outcome_owner
        .as_deref()
        .is_some_and(|owner| owner != command_id)
    {
        return (
            StatusCode::CONFLICT,
            Json(json!({"error":"outcome_id_already_used"})),
        )
            .into_response();
    }
    let existing: Option<(String, String, Option<String>, Option<String>)> = match db
        .query_row(
            "SELECT fingerprint,outcome_json,completed_worker_id,completed_lease_token FROM command_outcomes WHERE command_id=?1",
            [&command_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
    {
        Ok(v) => v,
        Err(_) => return storage_error("lookup_existing_outcome"),
    };
    if let Some((stored_fp, json, completed_worker, completed_token)) = existing {
        if stored_fp != fingerprint
            || completed_worker.as_deref() != Some(request.worker_id.as_str())
            || completed_token.as_deref() != Some(request.lease_token.as_str())
        {
            return (
                StatusCode::CONFLICT,
                Json(json!({"error":"terminal_outcome_already_recorded"})),
            )
                .into_response();
        }
        let stored: CommandOutcome = match serde_json::from_str(&json) {
            Ok(v) => v,
            Err(_) => return storage_error("decode_existing_outcome"),
        };
        return with_epoch(&s, (StatusCode::OK, Json(stored)));
    }
    if active_worker.as_deref() != Some(request.worker_id.as_str())
        || active_token.as_deref() != Some(request.lease_token.as_str())
        || lease_expires.is_none_or(|expires| expires <= unix_ms())
    {
        return lease_conflict();
    }
    let outcome_json = serde_json::to_string(&outcome).unwrap();
    let completion_now = unix_ms();
    let tx = match db.transaction_with_behavior(TransactionBehavior::Immediate) {
        Ok(v) => v,
        Err(_) => return storage_error("begin_outcome_transaction"),
    };
    let fenced = match tx.execute(
        "UPDATE commands SET execution_state='terminal',worker_id=NULL,lease_token=NULL,lease_expires_at_ms=NULL
         WHERE command_id=?1 AND execution_state='pending' AND worker_id=?2 AND lease_token=?3
           AND lease_expires_at_ms>?4",
        params![command_id, request.worker_id, request.lease_token, completion_now],
    ) {
        Ok(v) => v,
        Err(_) => return storage_error("fence_outcome_completion"),
    };
    if fenced != 1 {
        return lease_conflict();
    }
    if tx.execute(
        "INSERT INTO command_outcomes(command_id,outcome_id,fingerprint,outcome_json,created_at,completed_worker_id,completed_lease_token) VALUES(?1,?2,?3,?4,?5,?6,?7)",
        params![command_id, outcome.outcome_id, fingerprint, outcome_json, now(), request.worker_id, request.lease_token],
    ).is_err() || tx.commit().is_err() { return storage_error("persist_outcome"); }
    with_epoch(&s, (StatusCode::CREATED, Json(outcome)))
}

#[derive(Debug, Default, Deserialize)]
#[serde(deny_unknown_fields)]
struct WsParams {
    #[serde(default)]
    after_sequence: u64,
    #[serde(default)]
    batch: Option<String>,
}

async fn ws_upgrade(
    State(s): State<AppState>,
    Query(params): Query<WsParams>,
    ws: WebSocketUpgrade,
) -> Response {
    let state = s.clone();
    with_epoch(
        &s,
        ws.on_upgrade(move |socket| {
            ws_client(
                socket,
                state,
                params.after_sequence,
                params.batch.as_deref() == Some("gzip-v1"),
            )
        }),
    )
}

fn delta_batch_message(state: &AppState, payloads: Vec<String>) -> String {
    let items: Vec<Value> = payloads
        .into_iter()
        .map(|payload| serde_json::from_str(&payload).expect("retained delta is valid JSON"))
        .collect();
    json!({
        "message_type":"delta_batch",
        "schema_version":VERSION,
        "transport_version":"sentinel-gateway/v1",
        "server_epoch":state.epoch.as_str(),
        "stream_id":STREAM_ID,
        "items":items
    })
    .to_string()
}

fn gzip_delta_batch(state: &AppState, payloads: Vec<String>) -> Result<(Vec<u8>, usize), String> {
    if payloads.is_empty() || payloads.len() > DELTA_BATCH_MAX_COUNT {
        return Err("invalid_delta_batch_count".into());
    }
    let json = delta_batch_message(state, payloads);
    if json.len() > DELTA_BATCH_MAX_DECOMPRESSED_BYTES {
        return Err("delta_batch_decompressed_size_exceeded".into());
    }
    let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
    encoder
        .write_all(json.as_bytes())
        .map_err(|_| "delta_batch_compression_failed")?;
    let compressed = encoder
        .finish()
        .map_err(|_| "delta_batch_compression_failed")?;
    let mut frame = Vec::with_capacity(GZIP_BATCH_MAGIC.len() + compressed.len());
    frame.extend_from_slice(GZIP_BATCH_MAGIC);
    frame.extend_from_slice(&compressed);
    Ok((frame, json.len()))
}

async fn send_delta_payloads<S>(
    socket: &mut S,
    state: &AppState,
    payloads: Vec<String>,
    gzip_batches: bool,
) -> Result<(), S::Error>
where
    S: Sink<Message> + Unpin,
{
    if !gzip_batches || payloads.len() == 1 {
        return socket
            .send(Message::Text(payloads.into_iter().next().unwrap().into()))
            .await;
    }
    let (frame, uncompressed_len) = match gzip_delta_batch(state, payloads.clone()) {
        Ok(frame) => frame,
        Err(_) => {
            for payload in payloads {
                socket.send(Message::Text(payload.into())).await?;
            }
            return Ok(());
        }
    };
    state
        .metrics
        .delta_batches_sent
        .fetch_add(1, Ordering::Relaxed);
    state
        .metrics
        .deltas_sent_in_batches
        .fetch_add(payloads.len() as u64, Ordering::Relaxed);
    state
        .metrics
        .delta_batch_compressed_bytes
        .fetch_add(frame.len() as u64, Ordering::Relaxed);
    state
        .metrics
        .delta_batch_uncompressed_bytes
        .fetch_add(uncompressed_len as u64, Ordering::Relaxed);
    socket.send(Message::Binary(frame.into())).await
}

async fn ws_client(mut socket: WebSocket, state: AppState, after: u64, gzip_batches: bool) {
    let subscription = state
        .hub
        .lock()
        .unwrap()
        .subscribe(state.client_queue_capacity, after);
    let subscription = match subscription {
        Ok(value) => value,
        Err(reason) => {
            let gap = json!({"message_type":"gateway_resync_required","transport_version":"sentinel-gateway/v1",
            "server_epoch":state.epoch.as_str(),"reason":reason,"snapshot_url":"/v1/snapshot"});
            let _ = socket.send(Message::Text(gap.to_string().into())).await;
            let _ = socket.send(Message::Close(None)).await;
            return;
        }
    };
    let Subscription {
        id,
        mut rx,
        mut stop,
        suffix,
        cursor: subscription_cursor,
    } = subscription;
    let (mut sender, mut receiver) = socket.split();
    state.metrics.ws_connected.fetch_add(1, Ordering::Relaxed);
    let hello = json!({"message_type":"gateway_hello","schema_version":VERSION,"server_epoch":state.epoch.as_str(),
        "transport_version":"sentinel-gateway/v1","stream_id":STREAM_ID,"requested_after_sequence":after,
        "current_sequence":subscription_cursor,"recovery":"GET /v1/snapshot",
        "transport_capabilities":["batch=gzip-v1"],
        "active_batch":if gzip_batches { Some("gzip-v1") } else { None }});
    if sender
        .send(Message::Text(hello.to_string().into()))
        .await
        .is_ok()
    {
        let suffix_chunk_size = if gzip_batches {
            DELTA_BATCH_MAX_COUNT
        } else {
            1
        };
        for payloads in suffix.chunks(suffix_chunk_size) {
            if send_delta_payloads(&mut sender, &state, payloads.to_vec(), gzip_batches)
                .await
                .is_err()
            {
                break;
            }
        }
        let mut heartbeat = tokio::time::interval(OBSERVER_HEARTBEAT_INTERVAL);
        heartbeat.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Skip);
        heartbeat.tick().await;
        loop {
            tokio::select! {
                item = rx.recv() => match item {
                    Some(first) => {
                        if !gzip_batches {
                            if send_delta_payloads(&mut sender, &state, vec![first], false).await.is_err(){break}
                            continue;
                        }
                        let mut payloads = vec![first];
                        let deadline = tokio::time::Instant::now() + DELTA_BATCH_MAX_WAIT;
                        while payloads.len() < DELTA_BATCH_MAX_COUNT {
                            match tokio::time::timeout_at(deadline, rx.recv()).await {
                                Ok(Some(next)) => payloads.push(next),
                                Ok(None) | Err(_) => break,
                            }
                        }
                        if send_delta_payloads(&mut sender, &state, payloads, true).await.is_err(){break}
                    },
                    None => break
                },
                _ = heartbeat.tick() => {
                    let cursor = state.delta_sequence.load(Ordering::SeqCst);
                    let message = json!({
                        "message_type":"gateway_heartbeat",
                        "schema_version":VERSION,
                        "transport_version":"sentinel-gateway/v1",
                        "server_epoch":state.epoch.as_str(),
                        "stream_id":STREAM_ID,
                        "current_sequence":cursor,
                        "emitted_at":now()
                    });
                    if sender.send(Message::Text(message.to_string().into())).await.is_err(){break}
                },
                incoming = receiver.next() => match incoming {
                    Some(Ok(Message::Ping(payload))) => {
                        if sender.send(Message::Pong(payload)).await.is_err(){break}
                    },
                    Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                    Some(Ok(_)) => {},
                },
                changed = stop.changed() => {
                    if changed.is_ok() {
                        let reason = stop.borrow().clone().unwrap_or_else(|| "snapshot_required".into());
                        let gap = json!({"message_type":"gateway_resync_required","schema_version":VERSION,"server_epoch":state.epoch.as_str(),
                            "reason":reason,"snapshot_url":"/v1/snapshot"});
                        let _ = sender.send(Message::Text(gap.to_string().into())).await;
                        let _ = sender.send(Message::Close(None)).await;
                    }
                    break;
                }
            }
        }
    }
    state.hub.lock().unwrap().clients.remove(&id);
    state.metrics.ws_connected.fetch_sub(1, Ordering::Relaxed);
}

fn now() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

fn valid_id(value: &str) -> bool {
    (1..=128).contains(&value.len())
        && value.as_bytes()[0].is_ascii_alphanumeric()
        && value
            .bytes()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, b'.' | b'_' | b':' | b'-'))
}

fn valid_timestamp(value: &str) -> bool {
    chrono::DateTime::parse_from_rfc3339(value).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::Request};
    use chrono::Duration as ChronoDuration;
    use flate2::read::GzDecoder;
    use http_body_util::BodyExt;
    use sentinel_interceptor_providers::{
        AuthorityProof, CancelDisposition, ConstraintSet, Correlation as ProviderCorrelation,
        InterceptIntent, LocalContactReport, LocalSimulatorAdapter, PreparedOperation,
        ProviderCapabilities, ProviderId, ReconciliationReport, Submission, TargetRef,
        TelemetrySample,
    };
    use std::io::Read;
    use std::sync::atomic::AtomicBool;
    use tower::ServiceExt;

    fn observation(seq: u64) -> Value {
        json!({"schema_version":VERSION,"message_type":"observation","message_id":format!("m-{seq}"),"stream_id":"sensor-a","stream_sequence":seq,"emitted_at":"2026-09-25T00:00:00Z","correlation":{"correlation_id":"c-1"},"observation_id":format!("o-{seq}"),"track_id":"drone-1","source_id":"radar-1","source_sequence":seq,"source_time":"2026-09-25T00:00:00Z","position":{"x_mm":seq,"y_mm":2},"velocity":{"x_mm_s":3,"y_mm_s":4}})
    }

    #[test]
    fn delta_batch_frame_preserves_item_order_and_contract() {
        let state = AppState::new(8);
        let first =
            json!({"transport_version":"sentinel-gateway/v1","result_sequence":7}).to_string();
        let second =
            json!({"transport_version":"sentinel-gateway/v1","result_sequence":8}).to_string();
        let batch: Value =
            serde_json::from_str(&delta_batch_message(&state, vec![first, second])).unwrap();
        assert_eq!(batch["message_type"], "delta_batch");
        assert_eq!(batch["transport_version"], "sentinel-gateway/v1");
        assert_eq!(batch["items"][0]["result_sequence"], 7);
        assert_eq!(batch["items"][1]["result_sequence"], 8);
        assert_eq!(batch["items"].as_array().unwrap().len(), 2);
    }

    #[test]
    fn gzip_batch_has_versioned_magic_and_bounded_round_trip() {
        let state = AppState::new(8);
        let items = vec![
            json!({"transport_version":"sentinel-gateway/v1","result_sequence":1}).to_string(),
            json!({"transport_version":"sentinel-gateway/v1","result_sequence":2}).to_string(),
        ];
        let (frame, decompressed_len) = gzip_delta_batch(&state, items).unwrap();
        assert_eq!(&frame[..4], GZIP_BATCH_MAGIC);
        let mut decoded = String::new();
        GzDecoder::new(&frame[4..])
            .read_to_string(&mut decoded)
            .unwrap();
        assert_eq!(decoded.len(), decompressed_len);
        let batch: Value = serde_json::from_str(&decoded).unwrap();
        assert_eq!(batch["items"].as_array().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn idle_observer_receives_cursor_heartbeat() {
        let state = AppState::new(8);
        let epoch = state.epoch.to_string();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, app(state)).await.unwrap() });
        let (mut socket, _) = tokio_tungstenite::connect_async(format!(
            "ws://{address}/v1/deltas?after_sequence=0&batch=gzip-v1"
        ))
        .await
        .unwrap();
        let hello: Value =
            serde_json::from_str(socket.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
        assert_eq!(hello["message_type"], "gateway_hello");
        socket
            .send(tokio_tungstenite::tungstenite::Message::Ping(
                b"observer-liveness".to_vec().into(),
            ))
            .await
            .unwrap();
        assert!(matches!(
            socket.next().await.unwrap().unwrap(),
            tokio_tungstenite::tungstenite::Message::Pong(payload)
                if payload.as_ref() == b"observer-liveness"
        ));
        let heartbeat = tokio::time::timeout(Duration::from_secs(2), socket.next())
            .await
            .unwrap()
            .unwrap()
            .unwrap();
        let heartbeat: Value = serde_json::from_str(heartbeat.to_text().unwrap()).unwrap();
        assert_eq!(heartbeat["message_type"], "gateway_heartbeat");
        assert_eq!(heartbeat["server_epoch"], epoch);
        assert_eq!(heartbeat["current_sequence"], 0);
        assert!(valid_timestamp(heartbeat["emitted_at"].as_str().unwrap()));
        server.abort();
    }

    #[tokio::test]
    async fn retained_burst_is_one_bounded_ordered_batch_and_is_counted() {
        let state = AppState::new(8);
        for sequence in 1..=2 {
            let payload = json!({
                "transport_version":"sentinel-gateway/v1",
                "server_epoch":state.epoch.as_str(),
                "base_sequence":sequence - 1,
                "result_sequence":sequence,
                "payload":{"message_type":"track_delta"}
            })
            .to_string();
            state
                .hub
                .lock()
                .unwrap()
                .publish(sequence, &payload, &state.metrics);
        }
        state.delta_sequence.store(2, Ordering::SeqCst);
        let metrics = state.metrics.clone();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, app(state)).await.unwrap() });
        let (mut socket, _) = tokio_tungstenite::connect_async(format!(
            "ws://{address}/v1/deltas?after_sequence=0&batch=gzip-v1"
        ))
        .await
        .unwrap();
        let _: Value =
            serde_json::from_str(socket.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
        let message = socket.next().await.unwrap().unwrap();
        let bytes = message.into_data();
        assert_eq!(&bytes[..4], GZIP_BATCH_MAGIC);
        let mut decoded = String::new();
        GzDecoder::new(&bytes[4..])
            .read_to_string(&mut decoded)
            .unwrap();
        let batch: Value = serde_json::from_str(&decoded).unwrap();
        assert_eq!(batch["message_type"], "delta_batch");
        assert_eq!(batch["items"][0]["result_sequence"], 1);
        assert_eq!(batch["items"][1]["result_sequence"], 2);
        assert_eq!(metrics.delta_batches_sent.load(Ordering::Relaxed), 1);
        assert_eq!(metrics.deltas_sent_in_batches.load(Ordering::Relaxed), 2);
        server.abort();
    }

    #[tokio::test]
    async fn legacy_subscriber_receives_only_singleton_text_deltas() {
        let state = AppState::new(8);
        for sequence in 1..=2 {
            let payload =
                json!({"transport_version":"sentinel-gateway/v1","result_sequence":sequence})
                    .to_string();
            state
                .hub
                .lock()
                .unwrap()
                .publish(sequence, &payload, &state.metrics);
        }
        state.delta_sequence.store(2, Ordering::SeqCst);
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move { axum::serve(listener, app(state)).await.unwrap() });
        let (mut socket, _) =
            tokio_tungstenite::connect_async(format!("ws://{address}/v1/deltas?after_sequence=0"))
                .await
                .unwrap();
        let _: Value =
            serde_json::from_str(socket.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
        for expected in 1..=2 {
            let message = socket.next().await.unwrap().unwrap();
            assert!(message.is_text());
            let delta: Value = serde_json::from_str(message.to_text().unwrap()).unwrap();
            assert_eq!(delta["result_sequence"], expected);
        }
        server.abort();
    }
    fn command_body(epoch: &str, target: &str) -> Value {
        json!({"transport_version":"sentinel-gateway/v1","expected_epoch":epoch,"expected_revision":0,
            "command":{"schema_version":VERSION,"message_type":"command","message_id":"m-cmd","stream_id":"operator","stream_sequence":1,
            "emitted_at":"2026-09-25T00:00:00Z","correlation":{"correlation_id":"c-cmd"},"command_id":"cmd-1",
            "command_name":"intercept","target_id":target,"idempotency_key":"idem-1","parameters":{}}})
    }

    fn provider_execution(worker: &str, token: &str, epoch: &str) -> ProviderExecutionRequest {
        let current = Utc::now();
        ProviderExecutionRequest {
            worker_id: worker.into(),
            lease_token: token.into(),
            retry_after_ms: 25,
            scenario_id: "scenario-1".into(),
            command: InterceptCommand {
                command_id: "cmd-1".into(),
                operation_id: "operation-1".into(),
                provider_id: ProviderId("local-simulator".into()),
                interceptor_id: "interceptor-1".into(),
                launch_site_id: None,
                target_label: None,
                target: TargetRef {
                    track_id: "drone-1".into(),
                    revision: 0,
                    observed_at: current,
                },
                intent: InterceptIntent {
                    azimuth_deg: None,
                    altitude_deg: None,
                    distance_m: None,
                    direction_deg: None,
                    altitude_m: None,
                    speed_m_s: None,
                },
                constraints: ConstraintSet {
                    keep_in_area_ids: vec![],
                    avoid_area_ids: vec![],
                    expires_at: current + ChronoDuration::minutes(5),
                },
                authority: AuthorityProof {
                    grant_id: "grant-1".into(),
                    revision: 1,
                    valid_until: current + ChronoDuration::minutes(5),
                    permits_intercept: true,
                },
                expected_world_epoch: epoch.into(),
                expected_world_revision: 0,
                correlation: ProviderCorrelation {
                    correlation_id: "c-cmd".into(),
                    causation_id: None,
                    trace_id: None,
                },
            },
            worker_gate_evidence: SafetyGateInput {
                now: current,
                current_world_epoch: epoch.into(),
                current_world_revision: 0,
                max_observation_age_ms: 1_000,
                asset_available: true,
                asset_capable: true,
                inside_keep_in: true,
                outside_avoid: true,
            },
        }
    }
    fn provider_command_body(epoch: &str, command: &InterceptCommand) -> Value {
        let mut body = command_body(epoch, &command.target.track_id);
        body["command"]["parameters"]["provider_command"] = serde_json::to_value(command).unwrap();
        body
    }

    #[derive(Clone, Copy)]
    enum SubmitMode {
        AcceptedNoLookup,
        AcceptedHang,
        NotDispatched,
        Reject,
        Unknown(bool),
    }

    struct ScriptedProvider {
        local: LocalSimulatorAdapter,
        id: ProviderId,
        mode: SubmitMode,
        prepare_delay: Duration,
        submit_called: AtomicBool,
    }

    impl ScriptedProvider {
        fn new(mode: SubmitMode) -> Self {
            Self {
                local: LocalSimulatorAdapter::default(),
                id: ProviderId("local-simulator".into()),
                mode,
                prepare_delay: Duration::ZERO,
                submit_called: AtomicBool::new(false),
            }
        }
    }

    #[async_trait::async_trait]
    impl InterceptorProvider for ScriptedProvider {
        fn provider_id(&self) -> &ProviderId {
            &self.id
        }
        fn capabilities(&self) -> ProviderCapabilities {
            let mut capabilities = self.local.capabilities();
            capabilities.provider_id = self.id.clone();
            capabilities
        }
        async fn prepare(
            &self,
            ctx: &DispatchContext,
            cmd: &InterceptCommand,
        ) -> Result<PreparedOperation, ProviderError> {
            if !self.prepare_delay.is_zero() {
                tokio::time::sleep(self.prepare_delay).await;
            }
            self.local.prepare(ctx, cmd).await
        }
        async fn submit(
            &self,
            _op: &PreparedOperation,
        ) -> Result<SubmitDisposition, ProviderError> {
            self.submit_called.store(true, Ordering::SeqCst);
            Ok(match self.mode {
                SubmitMode::AcceptedNoLookup | SubmitMode::AcceptedHang => {
                    SubmitDisposition::Accepted {
                        submission: Submission {
                            provider_operation_id: Some("external-1".into()),
                            accepted_at: Utc::now(),
                        },
                    }
                }
                SubmitMode::NotDispatched => SubmitDisposition::Rejected {
                    code: "not_dispatched".into(),
                    reason: "provider_unavailable_before_send".into(),
                },
                SubmitMode::Reject => SubmitDisposition::Rejected {
                    code: "denied".into(),
                    reason: "provider_rejected".into(),
                },
                SubmitMode::Unknown(automatic_retry_allowed) => {
                    SubmitDisposition::UnknownExternalOutcome {
                        reason: "ambiguous".into(),
                        automatic_retry_allowed,
                    }
                }
            })
        }
        async fn status(&self, id: &str) -> Result<ExternalOperationState, ProviderError> {
            self.local.status(id).await
        }
        async fn telemetry(&self, id: &str) -> Result<Vec<TelemetrySample>, ProviderError> {
            self.local.telemetry(id).await
        }
        async fn outcome(
            &self,
            id: &str,
        ) -> Result<Option<sentinel_interceptor_providers::AuthoritativeOutcome>, ProviderError>
        {
            self.local.outcome(id).await
        }
        async fn reconcile(&self, id: &str) -> Result<ReconciliationReport, ProviderError> {
            if matches!(self.mode, SubmitMode::AcceptedNoLookup) {
                return Err(ProviderError::Unsupported("status"));
            }
            if matches!(self.mode, SubmitMode::AcceptedHang) {
                tokio::time::sleep(Duration::from_secs(60)).await;
            }
            self.local.reconcile(id).await
        }
        async fn cancel(&self, id: &str) -> Result<CancelDisposition, ProviderError> {
            self.local.cancel(id).await
        }
    }
    async fn request(router: Router, method: &str, uri: &str, body: Value) -> (StatusCode, Value) {
        let r = router
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(uri)
                    .header("content-type", "application/json")
                    .body(Body::from(body.to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();
        let status = r.status();
        let bytes = r.into_body().collect().await.unwrap().to_bytes();
        (
            status,
            if bytes.is_empty() {
                Value::Null
            } else {
                serde_json::from_slice(&bytes).unwrap()
            },
        )
    }

    #[tokio::test]
    async fn observation_updates_snapshot_and_rejects_reordering() {
        let router = app(AppState::new(4));
        assert_eq!(
            request(router.clone(), "POST", "/v1/observations", observation(1))
                .await
                .0,
            StatusCode::ACCEPTED
        );
        assert_eq!(
            request(router.clone(), "POST", "/v1/observations", observation(2))
                .await
                .0,
            StatusCode::ACCEPTED
        );
        let (status, snap) = request(router, "GET", "/v1/snapshot", Value::Null).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(snap["tracks"][0]["revision"], 2);
        assert_eq!(snap["covers_through"], 2);
    }

    #[tokio::test]
    async fn observation_stream_pipelines_ordered_correlated_acknowledgements() {
        let state = AppState::new(8);
        let retained_state = state.clone();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, app(state)).await.unwrap();
        });
        let (mut socket, _) =
            tokio_tungstenite::connect_async(format!("ws://{address}/v1/observations/stream"))
                .await
                .unwrap();

        // Send multiple observations before awaiting any acknowledgement. This
        // is the property that removes one network RTT per observation.
        socket
            .send(tokio_tungstenite::tungstenite::Message::Text(
                observation(1).to_string().into(),
            ))
            .await
            .unwrap();
        socket
            .send(tokio_tungstenite::tungstenite::Message::Text(
                observation(2).to_string().into(),
            ))
            .await
            .unwrap();
        socket
            .send(tokio_tungstenite::tungstenite::Message::Text(
                observation(2).to_string().into(),
            ))
            .await
            .unwrap();

        let hello: Value =
            serde_json::from_str(socket.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
        assert_eq!(hello["message_type"], "observation_stream_hello");
        let first: Value =
            serde_json::from_str(socket.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
        let second: Value =
            serde_json::from_str(socket.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
        let duplicate: Value =
            serde_json::from_str(socket.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
        assert_eq!(first["message_id"], "m-1");
        assert_eq!(first["correlation_id"], "c-1");
        assert_eq!(first["result_sequence"], 1);
        assert_eq!(second["message_id"], "m-2");
        assert_eq!(second["result_sequence"], 2);
        assert_eq!(duplicate["message_id"], "m-2");
        assert_eq!(duplicate["accepted"], true);
        assert_eq!(duplicate["duplicate"], true);
        assert_eq!(duplicate["result_sequence"], 2);

        let mut wrong_source = observation(3);
        wrong_source["source_id"] = json!("radar-2");
        socket
            .send(tokio_tungstenite::tungstenite::Message::Text(
                wrong_source.to_string().into(),
            ))
            .await
            .unwrap();
        let rejected: Value =
            serde_json::from_str(socket.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
        assert_eq!(rejected["accepted"], false);
        assert_eq!(rejected["error"], "observation_stream_source_changed");

        let mut reordered = observation(1);
        reordered["message_id"] = json!("m-reordered");
        reordered["observation_id"] = json!("o-reordered");
        socket
            .send(tokio_tungstenite::tungstenite::Message::Text(
                reordered.to_string().into(),
            ))
            .await
            .unwrap();
        let sequence_rejected: Value =
            serde_json::from_str(socket.next().await.unwrap().unwrap().to_text().unwrap()).unwrap();
        assert_eq!(sequence_rejected["accepted"], false);
        assert_eq!(sequence_rejected["error"], "source_sequence_not_increasing");
        socket
            .send(tokio_tungstenite::tungstenite::Message::Ping(
                b"stream-liveness".to_vec().into(),
            ))
            .await
            .unwrap();
        assert!(matches!(
            socket.next().await.unwrap().unwrap(),
            tokio_tungstenite::tungstenite::Message::Pong(payload)
                if payload.as_ref() == b"stream-liveness"
        ));
        assert_eq!(
            retained_state
                .metrics
                .observation_stream_accepted
                .load(Ordering::Relaxed),
            3
        );
        assert_eq!(
            retained_state
                .metrics
                .observation_stream_rejected
                .load(Ordering::Relaxed),
            2
        );
        assert_eq!(retained_state.delta_sequence.load(Ordering::Relaxed), 2);
        socket.close(None).await.unwrap();
        server.abort();
    }

    #[tokio::test]
    async fn observation_stream_ack_backpressure_is_bounded_and_recovers_in_order() {
        let mut state = AppState::new(1);
        state.observation_ack_send_delay = Duration::from_millis(20);
        let retained_state = state.clone();
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let server = tokio::spawn(async move {
            axum::serve(listener, app(state)).await.unwrap();
        });
        let (mut socket, _) =
            tokio_tungstenite::connect_async(format!("ws://{address}/v1/observations/stream"))
                .await
                .unwrap();
        assert!(socket.next().await.unwrap().unwrap().is_text());

        // Burst without reading acknowledgements. The test-only writer delay
        // makes the one-slot queue apply flow control without relying on
        // platform TCP buffer sizes.
        for sequence in 1..=8 {
            socket
                .send(tokio_tungstenite::tungstenite::Message::Text(
                    observation(sequence).to_string().into(),
                ))
                .await
                .unwrap();
        }
        let mut acknowledged = Vec::new();
        for _ in 1..=8 {
            let message = tokio::time::timeout(Duration::from_secs(1), socket.next())
                .await
                .expect("temporarily backpressured stream must recover")
                .expect("stream remains connected")
                .expect("acknowledgement remains valid");
            let body: Value = serde_json::from_str(message.to_text().unwrap()).unwrap();
            acknowledged.push(body["result_sequence"].as_u64().unwrap());
        }
        assert_eq!(acknowledged, (1..=8).collect::<Vec<_>>());
        assert_eq!(
            retained_state
                .metrics
                .observation_stream_backpressure_disconnects
                .load(Ordering::Relaxed),
            0
        );
        assert_eq!(
            retained_state
                .metrics
                .observation_streams_connected
                .load(Ordering::Relaxed),
            1
        );
        socket.close(None).await.unwrap();
        server.abort();
    }

    #[tokio::test]
    async fn command_is_idempotent_and_conflicts_are_visible() {
        let state = AppState::new(4);
        let epoch = state.epoch.to_string();
        let router = app(state);
        let (first, _) = request(
            router.clone(),
            "POST",
            "/v1/commands",
            command_body(&epoch, "drone-1"),
        )
        .await;
        let (retry, r) = request(
            router.clone(),
            "POST",
            "/v1/commands",
            command_body(&epoch, "drone-1"),
        )
        .await;
        let (conflict, _) = request(
            router,
            "POST",
            "/v1/commands",
            command_body(&epoch, "drone-2"),
        )
        .await;
        assert_eq!(first, StatusCode::ACCEPTED);
        assert_eq!(retry, StatusCode::OK);
        assert_eq!(r["receipt_status"], "accepted");
        assert_eq!(conflict, StatusCode::CONFLICT);
    }

    #[tokio::test]
    async fn command_requires_current_epoch_revision_and_unique_command_id() {
        let state = AppState::new(4);
        let epoch = state.epoch.to_string();
        let router = app(state);
        let mut wrong_epoch = command_body("old-epoch", "drone-1");
        assert_eq!(
            request(router.clone(), "POST", "/v1/commands", wrong_epoch.clone())
                .await
                .0,
            StatusCode::CONFLICT
        );
        wrong_epoch["expected_epoch"] = json!(epoch);
        wrong_epoch["expected_revision"] = json!(1);
        assert_eq!(
            request(router.clone(), "POST", "/v1/commands", wrong_epoch)
                .await
                .0,
            StatusCode::CONFLICT
        );
        assert_eq!(
            request(
                router.clone(),
                "POST",
                "/v1/commands",
                command_body(&epoch, "drone-1")
            )
            .await
            .0,
            StatusCode::ACCEPTED
        );
        let mut reused_id = command_body(&epoch, "drone-1");
        reused_id["command"]["idempotency_key"] = json!("idem-2");
        assert_eq!(
            request(router, "POST", "/v1/commands", reused_id).await.0,
            StatusCode::CONFLICT
        );
    }

    async fn claim(router: Router, worker: &str) -> String {
        let (status, body) = request(
            router,
            "POST",
            "/v1/outbox/claim",
            json!({"worker_id":worker,"lease_duration_ms":30_000}),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        body["claim"]["lease_token"].as_str().unwrap().to_owned()
    }

    fn outcome_body(status: &str, worker: &str, token: &str) -> Value {
        json!({"worker_id":worker,"lease_token":token,"outcome_id":"outcome-1","status":status,"emitted_at":"2026-09-25T00:00:02Z",
            "correlation":{"correlation_id":"c-cmd","causation_id":"m-cmd"},"details":{"result":"verified"}})
    }

    #[tokio::test]
    async fn command_receipt_and_outcome_survive_restart() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("commands.sqlite3");
        let first_state = AppState::with_database(4, 16, &path).unwrap();
        let first_epoch = first_state.epoch.to_string();
        let first_router = app(first_state);
        let (accepted_status, accepted) = request(
            first_router.clone(),
            "POST",
            "/v1/commands",
            command_body(&first_epoch, "drone-1"),
        )
        .await;
        assert_eq!(accepted_status, StatusCode::ACCEPTED);
        let token = claim(first_router.clone(), "worker-1").await;
        assert_eq!(
            request(
                first_router,
                "POST",
                "/v1/commands/cmd-1/outcome",
                outcome_body("intercepted", "worker-1", &token)
            )
            .await
            .0,
            StatusCode::CREATED
        );

        let second_state = AppState::with_database(4, 16, &path).unwrap();
        assert_ne!(first_epoch, second_state.epoch.as_str());
        let second_router = app(second_state);
        // Retry carries the old admission epoch, yet returns the exact durable receipt.
        let mut retry_request = command_body(&first_epoch, "drone-1");
        retry_request["expected_revision"] = json!(999);
        let (retry_status, retry) =
            request(second_router.clone(), "POST", "/v1/commands", retry_request).await;
        assert_eq!(retry_status, StatusCode::OK);
        assert_eq!(retry, accepted);
        let (get_status, reconciliation) =
            request(second_router, "GET", "/v1/commands/cmd-1", Value::Null).await;
        assert_eq!(get_status, StatusCode::OK);
        assert_eq!(reconciliation["receipt"], accepted);
        assert_eq!(reconciliation["outcome"]["status"], "intercepted");
    }

    #[tokio::test]
    async fn changed_retry_and_second_terminal_outcome_conflict_after_restart() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("commands.sqlite3");
        let first_state = AppState::with_database(4, 16, &path).unwrap();
        let first_epoch = first_state.epoch.to_string();
        let first_router = app(first_state);
        assert_eq!(
            request(
                first_router.clone(),
                "POST",
                "/v1/commands",
                command_body(&first_epoch, "drone-1")
            )
            .await
            .0,
            StatusCode::ACCEPTED
        );
        let token = claim(first_router.clone(), "worker-1").await;
        assert_eq!(
            request(
                first_router,
                "POST",
                "/v1/commands/cmd-1/outcome",
                outcome_body("intercepted", "worker-1", &token)
            )
            .await
            .0,
            StatusCode::CREATED
        );

        let second_state = AppState::with_database(4, 16, &path).unwrap();
        let second_router = app(second_state);
        let mut changed = command_body(&first_epoch, "drone-1");
        changed["command"]["parameters"] = json!({"azimuth":90});
        assert_eq!(
            request(second_router.clone(), "POST", "/v1/commands", changed)
                .await
                .0,
            StatusCode::CONFLICT
        );
        assert_eq!(
            request(
                second_router.clone(),
                "POST",
                "/v1/commands/cmd-1/outcome",
                outcome_body("missed", "worker-1", &token)
            )
            .await
            .0,
            StatusCode::CONFLICT
        );
        assert_eq!(
            request(
                second_router,
                "POST",
                "/v1/commands/cmd-1/outcome",
                outcome_body("intercepted", "worker-1", &token)
            )
            .await
            .0,
            StatusCode::OK
        );
    }

    #[tokio::test]
    async fn pending_outbox_recovers_command_payload_and_clears_on_outcome() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("commands.sqlite3");
        let state = AppState::with_database(4, 16, &path).unwrap();
        let epoch = state.epoch.to_string();
        assert_eq!(
            request(
                app(state),
                "POST",
                "/v1/commands",
                command_body(&epoch, "drone-1")
            )
            .await
            .0,
            StatusCode::ACCEPTED
        );

        let restarted = AppState::with_database(4, 16, &path).unwrap();
        let router = app(restarted);
        let (status, pending) =
            request(router.clone(), "GET", "/v1/outbox/commands", Value::Null).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(pending["commands"][0]["command"]["command_id"], "cmd-1");
        assert_eq!(pending["commands"][0]["execution_state"], "pending");
        let token = claim(router.clone(), "worker-1").await;
        assert_eq!(
            request(
                router.clone(),
                "POST",
                "/v1/commands/cmd-1/outcome",
                outcome_body("intercepted", "worker-1", &token)
            )
            .await
            .0,
            StatusCode::CREATED
        );
        let (_, empty) = request(router, "GET", "/v1/outbox/commands", Value::Null).await;
        assert_eq!(empty["commands"].as_array().unwrap().len(), 0);
    }

    #[test]
    fn incompatible_schema_and_foreign_key_violations_are_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let mismatch = dir.path().join("mismatch.sqlite3");
        let connection = Connection::open(&mismatch).unwrap();
        connection.pragma_update(None, "user_version", 99).unwrap();
        drop(connection);
        assert!(AppState::with_database(4, 16, &mismatch).is_err());

        let valid = dir.path().join("valid.sqlite3");
        let state = AppState::with_database(4, 16, &valid).unwrap();
        let db = state.command_db.lock().unwrap();
        let result = db.execute(
            "INSERT INTO command_outcomes(command_id,outcome_id,fingerprint,outcome_json,created_at) VALUES('missing','out-x','fp','{}','now')",
            [],
        );
        assert!(result.is_err());
    }

    #[tokio::test]
    async fn outcome_id_status_and_correlation_constraints_are_enforced() {
        let state = AppState::new(4);
        let epoch = state.epoch.to_string();
        let router = app(state);
        assert_eq!(
            request(
                router.clone(),
                "POST",
                "/v1/commands",
                command_body(&epoch, "drone-1")
            )
            .await
            .0,
            StatusCode::ACCEPTED
        );
        let mut second = command_body(&epoch, "drone-2");
        second["command"]["command_id"] = json!("cmd-2");
        second["command"]["idempotency_key"] = json!("idem-2");
        second["command"]["message_id"] = json!("m-cmd-2");
        second["command"]["correlation"]["correlation_id"] = json!("c-cmd-2");
        assert_eq!(
            request(router.clone(), "POST", "/v1/commands", second)
                .await
                .0,
            StatusCode::ACCEPTED
        );

        let token1 = claim(router.clone(), "worker-1").await;

        let mut invalid_status = outcome_body("unknown", "worker-1", &token1);
        assert_eq!(
            request(
                router.clone(),
                "POST",
                "/v1/commands/cmd-1/outcome",
                invalid_status.clone()
            )
            .await
            .0,
            StatusCode::BAD_REQUEST
        );
        invalid_status["status"] = json!("intercepted");
        invalid_status["correlation"]["correlation_id"] = json!("wrong");
        assert_eq!(
            request(
                router.clone(),
                "POST",
                "/v1/commands/cmd-1/outcome",
                invalid_status
            )
            .await
            .0,
            StatusCode::CONFLICT
        );
        assert_eq!(
            request(
                router.clone(),
                "POST",
                "/v1/commands/cmd-1/outcome",
                outcome_body("intercepted", "worker-1", &token1)
            )
            .await
            .0,
            StatusCode::CREATED
        );

        let token2 = claim(router.clone(), "worker-2").await;
        let mut reused = outcome_body("succeeded", "worker-2", &token2);
        reused["correlation"]["correlation_id"] = json!("c-cmd-2");
        reused["correlation"]["causation_id"] = json!("m-cmd-2");
        assert_eq!(
            request(router, "POST", "/v1/commands/cmd-2/outcome", reused)
                .await
                .0,
            StatusCode::CONFLICT
        );
    }

    #[tokio::test]
    async fn concurrent_claims_are_exclusive_and_expiry_fences_old_worker() {
        let state = AppState::new(4);
        let epoch = state.epoch.to_string();
        let router = app(state);
        assert_eq!(
            request(
                router.clone(),
                "POST",
                "/v1/commands",
                command_body(&epoch, "drone-1")
            )
            .await
            .0,
            StatusCode::ACCEPTED
        );
        let first = request(
            router.clone(),
            "POST",
            "/v1/outbox/claim",
            json!({"worker_id":"worker-a","lease_duration_ms":100}),
        );
        let second = request(
            router.clone(),
            "POST",
            "/v1/outbox/claim",
            json!({"worker_id":"worker-b","lease_duration_ms":100}),
        );
        let (a, b) = tokio::join!(first, second);
        let (winner, loser) = if a.0 == StatusCode::OK {
            (a, b)
        } else {
            (b, a)
        };
        assert_eq!(winner.0, StatusCode::OK);
        assert_eq!(loser.0, StatusCode::NO_CONTENT);
        let old_worker = winner.1["claim"]["worker_id"].as_str().unwrap();
        let old_token = winner.1["claim"]["lease_token"].as_str().unwrap();
        std::thread::sleep(Duration::from_millis(110));
        assert_eq!(
            request(
                router.clone(),
                "POST",
                "/v1/outbox/commands/cmd-1/renew",
                json!({"worker_id":old_worker,"lease_token":old_token,"lease_duration_ms":100})
            )
            .await
            .0,
            StatusCode::CONFLICT
        );
        let new_worker = if old_worker == "worker-a" {
            "worker-b"
        } else {
            "worker-a"
        };
        let (status, reclaimed) = request(
            router.clone(),
            "POST",
            "/v1/outbox/claim",
            json!({"worker_id":new_worker,"lease_duration_ms":30_000}),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(reclaimed["claim"]["attempt_count"], 2);
        let new_token = reclaimed["claim"]["lease_token"].as_str().unwrap();
        assert_ne!(old_token, new_token);
        assert_eq!(
            request(
                router.clone(),
                "POST",
                "/v1/commands/cmd-1/outcome",
                outcome_body("intercepted", old_worker, old_token)
            )
            .await
            .0,
            StatusCode::CONFLICT
        );
        assert_eq!(
            request(
                router.clone(),
                "POST",
                "/v1/commands/cmd-1/outcome",
                outcome_body("intercepted", new_worker, new_token)
            )
            .await
            .0,
            StatusCode::CREATED
        );
        assert_eq!(
            request(
                router,
                "POST",
                "/v1/commands/cmd-1/outcome",
                outcome_body("intercepted", new_worker, new_token)
            )
            .await
            .0,
            StatusCode::OK
        );
    }

    #[tokio::test]
    async fn retry_schedule_and_active_lease_survive_restart() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("commands.sqlite3");
        let state = AppState::with_database(4, 16, &path).unwrap();
        let epoch = state.epoch.to_string();
        let router = app(state);
        assert_eq!(
            request(
                router.clone(),
                "POST",
                "/v1/commands",
                command_body(&epoch, "drone-1")
            )
            .await
            .0,
            StatusCode::ACCEPTED
        );
        let token = claim(router.clone(), "worker-a").await;
        assert_eq!(request(router, "POST", "/v1/outbox/commands/cmd-1/retry",
            json!({"worker_id":"worker-a","lease_token":token,"retry_after_ms":120,"error":"temporary"})).await.0, StatusCode::OK);
        let restarted = app(AppState::with_database(4, 16, &path).unwrap());
        assert_eq!(
            request(
                restarted.clone(),
                "POST",
                "/v1/outbox/claim",
                json!({"worker_id":"worker-b","lease_duration_ms":30_000})
            )
            .await
            .0,
            StatusCode::NO_CONTENT
        );
        std::thread::sleep(Duration::from_millis(130));
        let (status, claim) = request(
            restarted.clone(),
            "POST",
            "/v1/outbox/claim",
            json!({"worker_id":"worker-b","lease_duration_ms":30_000}),
        )
        .await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(claim["claim"]["attempt_count"], 2);
        let token = claim["claim"]["lease_token"].as_str().unwrap();
        let restarted_again = app(AppState::with_database(4, 16, &path).unwrap());
        assert_eq!(
            request(
                restarted_again.clone(),
                "POST",
                "/v1/outbox/claim",
                json!({"worker_id":"worker-c","lease_duration_ms":30_000})
            )
            .await
            .0,
            StatusCode::NO_CONTENT
        );
        assert_eq!(
            request(
                restarted_again,
                "POST",
                "/v1/outbox/commands/cmd-1/release",
                json!({"worker_id":"worker-b","lease_token":token})
            )
            .await
            .0,
            StatusCode::OK
        );
    }

    #[tokio::test]
    async fn retries_stop_at_durable_maximum_attempts() {
        let state = AppState::new(4);
        let epoch = state.epoch.to_string();
        let router = app(state.clone());
        assert_eq!(
            request(
                router.clone(),
                "POST",
                "/v1/commands",
                command_body(&epoch, "drone-1"),
            )
            .await
            .0,
            StatusCode::ACCEPTED
        );

        for attempt in 1..=MAX_COMMAND_ATTEMPTS {
            let worker = format!("worker-{attempt}");
            let token = claim(router.clone(), &worker).await;
            let (status, body) = request(
                router.clone(),
                "POST",
                "/v1/outbox/commands/cmd-1/retry",
                json!({"worker_id":worker,"lease_token":token,
                    "retry_after_ms":0,"error":"temporary"}),
            )
            .await;
            assert_eq!(status, StatusCode::OK);
            let expected = if attempt == MAX_COMMAND_ATTEMPTS {
                "terminal"
            } else {
                "pending"
            };
            assert_eq!(body["execution_state"], expected);
            assert_eq!(body["dead_lettered"], attempt == MAX_COMMAND_ATTEMPTS);
            assert_eq!(body["maximum_attempts"], MAX_COMMAND_ATTEMPTS);
        }

        assert_eq!(
            request(
                router,
                "POST",
                "/v1/outbox/claim",
                json!({"worker_id":"worker-extra","lease_duration_ms":30_000}),
            )
            .await
            .0,
            StatusCode::NO_CONTENT
        );
        let row: (String, i64) = state
            .command_db
            .lock()
            .unwrap()
            .query_row(
                "SELECT execution_state,attempt_count FROM commands WHERE command_id='cmd-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(row, ("terminal".into(), MAX_COMMAND_ATTEMPTS));
    }

    #[test]
    fn slow_subscriber_is_disconnected_and_must_resync() {
        let metrics = Metrics::default();
        let mut hub = Hub::new(2);
        let subscription = hub.subscribe(1, 0).unwrap();
        hub.publish(1, "one", &metrics);
        hub.publish(2, "two", &metrics);
        assert_eq!(
            subscription.stop.borrow().as_deref(),
            Some("slow_client_snapshot_required")
        );
        assert_eq!(metrics.slow_disconnects.load(Ordering::Relaxed), 1);
        assert!(hub.clients.is_empty());
    }

    #[test]
    fn retained_suffix_is_ordered_and_old_cursor_requires_snapshot() {
        let metrics = Metrics::default();
        let mut hub = Hub::new(2);
        hub.publish(1, "one", &metrics);
        hub.publish(2, "two", &metrics);
        hub.publish(3, "three", &metrics);
        let subscription = hub.subscribe(2, 1).unwrap();
        assert_eq!(subscription.suffix, vec!["two", "three"]);
        assert_eq!(subscription.cursor, 3);
        assert!(hub.subscribe(2, 0).is_err());
    }

    #[tokio::test]
    async fn observation_id_cannot_change_content() {
        let router = app(AppState::new(4));
        assert_eq!(
            request(router.clone(), "POST", "/v1/observations", observation(1))
                .await
                .0,
            StatusCode::ACCEPTED
        );
        let mut changed = observation(1);
        changed["position"]["x_mm"] = json!(999);
        assert_eq!(
            request(router, "POST", "/v1/observations", changed).await.0,
            StatusCode::CONFLICT
        );
    }

    #[tokio::test]
    async fn observation_idempotency_retention_is_bounded_and_reported() {
        let state = AppState::with_database_and_limits(4, 16, 2, ":memory:").unwrap();
        let router = app(state.clone());
        for sequence in 1..=3 {
            assert_eq!(
                request(
                    router.clone(),
                    "POST",
                    "/v1/observations",
                    observation(sequence),
                )
                .await
                .0,
                StatusCode::ACCEPTED
            );
        }
        {
            let cache = state.observations.lock().unwrap();
            assert_eq!(cache.entries.len(), 2);
            assert!(!cache.entries.contains_key("o-1"));
            assert!(cache.entries.contains_key("o-2"));
            assert!(cache.entries.contains_key("o-3"));
        }

        let (status, metrics) = request(router, "GET", "/metrics", Value::Null).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(metrics["observation_idempotency_entries"], 2);
        assert_eq!(metrics["observation_idempotency_capacity"], 2);
        assert_eq!(metrics["observation_idempotency_evictions"], 1);
        assert_eq!(metrics["observation_latency_sample_count"], 3);
        assert_eq!(
            metrics["observation_latency_sample_capacity"],
            OBSERVATION_LATENCY_SAMPLE_RETENTION
        );
    }

    #[tokio::test]
    async fn track_and_source_identity_cardinality_are_bounded_and_reported() {
        let state =
            AppState::with_database_and_admission_limits(4, 16, 16, 2, 2, ":memory:").unwrap();
        let router = app(state);
        for (sequence, track) in [(1, "drone-1"), (2, "drone-2")] {
            let mut item = observation(sequence);
            item["track_id"] = json!(track);
            assert_eq!(
                request(router.clone(), "POST", "/v1/observations", item)
                    .await
                    .0,
                StatusCode::ACCEPTED
            );
        }
        let mut third_track = observation(3);
        third_track["track_id"] = json!("drone-3");
        let (status, body) = request(router.clone(), "POST", "/v1/observations", third_track).await;
        assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(body["error"], "track_capacity_exceeded");

        let mut third_identity = observation(3);
        third_identity["source_id"] = json!("radar-2");
        let (status, body) =
            request(router.clone(), "POST", "/v1/observations", third_identity).await;
        assert_eq!(status, StatusCode::TOO_MANY_REQUESTS);
        assert_eq!(body["error"], "source_track_identity_capacity_exceeded");

        let (status, metrics) = request(router, "GET", "/metrics", Value::Null).await;
        assert_eq!(status, StatusCode::OK);
        assert_eq!(metrics["track_entries"], 2);
        assert_eq!(metrics["track_capacity"], 2);
        assert_eq!(metrics["track_capacity_rejections"], 1);
        assert_eq!(metrics["source_track_identity_entries"], 2);
        assert_eq!(metrics["source_track_identity_capacity"], 2);
        assert_eq!(metrics["source_track_identity_capacity_rejections"], 1);
    }

    #[tokio::test]
    async fn expired_observation_idempotency_has_explicit_finite_semantics() {
        let router = app(AppState::with_database_and_limits(4, 16, 2, ":memory:").unwrap());
        for sequence in 1..=3 {
            assert_eq!(
                request(
                    router.clone(),
                    "POST",
                    "/v1/observations",
                    observation(sequence),
                )
                .await
                .0,
                StatusCode::ACCEPTED
            );
        }

        let (old_retry_status, old_retry) =
            request(router.clone(), "POST", "/v1/observations", observation(1)).await;
        assert_eq!(old_retry_status, StatusCode::CONFLICT);
        assert_eq!(old_retry["error"], "source_sequence_not_increasing");

        // Once o-1 is outside the finite cache, its historical fingerprint is
        // unavailable. A later monotonic observation may reuse that ID; callers
        // must not rely on reuse detection beyond the advertised window.
        let mut reused_after_expiry = observation(4);
        reused_after_expiry["observation_id"] = json!("o-1");
        assert_eq!(
            request(router, "POST", "/v1/observations", reused_after_expiry,)
                .await
                .0,
            StatusCode::ACCEPTED
        );
    }

    #[tokio::test]
    async fn provider_execution_records_attempt_before_local_submit() {
        let state = AppState::new(4);
        let router = app(state.clone());
        let epoch = state.epoch.to_string();
        let mut execution = provider_execution("provider-worker", "pending-token", &epoch);
        assert_eq!(
            request(
                router.clone(),
                "POST",
                "/v1/commands",
                provider_command_body(&epoch, &execution.command)
            )
            .await
            .0,
            StatusCode::ACCEPTED
        );
        let token = claim(router, "provider-worker").await;
        execution.lease_token = token;
        let provider = LocalSimulatorAdapter::default();
        let result = state
            .execute_provider_claim(execution, &provider)
            .await
            .unwrap();
        assert_eq!(result.state, ProviderExecutionState::Accepted);
        assert!(!result.automatic_retry_allowed);
        let row: (String, i64, String, Option<String>, Option<String>) = state
            .command_db
            .lock()
            .unwrap()
            .query_row(
                "SELECT a.state,a.automatic_retry_allowed,c.execution_state,
                        a.external_operation_id,a.provider_accepted_at
                 FROM provider_dispatch_attempts a JOIN commands c USING(command_id)
                 WHERE a.attempt_id=?1",
                [result.attempt_id],
                |row| {
                    Ok((
                        row.get(0)?,
                        row.get(1)?,
                        row.get(2)?,
                        row.get(3)?,
                        row.get(4)?,
                    ))
                },
            )
            .unwrap();
        assert_eq!(row.0, "awaiting_reconciliation");
        assert_eq!(row.1, 0);
        assert_eq!(row.2, "terminal");
        assert_eq!(row.3.as_deref(), Some("operation-1"));
        assert!(row.4.is_some());
        provider
            .report_contact(&LocalContactReport {
                operation_id: "operation-1".into(),
                evidence_id: "evidence-1".into(),
                observed_at: Utc::now(),
                interceptor_position_m: [0.0, 0.0, 0.0],
                target_position_m: [3.0, 0.0, 0.0],
            })
            .unwrap();
        assert_eq!(
            state
                .reconcile_provider_operation("cmd-1", "reconciler-1", &provider)
                .await
                .unwrap(),
            ReconciliationState::AuthoritativeSucceeded
        );
    }

    #[tokio::test]
    async fn failed_gate_never_calls_provider_and_is_terminal_rejection() {
        let state = AppState::new(4);
        let router = app(state.clone());
        let epoch = state.epoch.to_string();
        let mut execution = provider_execution("provider-worker", "pending-token", &epoch);
        request(
            router.clone(),
            "POST",
            "/v1/commands",
            provider_command_body(&epoch, &execution.command),
        )
        .await;
        let token = claim(router, "provider-worker").await;
        execution.lease_token = token;
        let provider = LocalSimulatorAdapter::default();
        execution.worker_gate_evidence.inside_keep_in = false;
        let result = state
            .execute_provider_claim(execution, &provider)
            .await
            .unwrap();
        assert_eq!(result.state, ProviderExecutionState::Rejected);
        assert!(!result.automatic_retry_allowed);
        assert!(matches!(
            provider.status("operation-1").await,
            Err(ProviderError::NotFound)
        ));
    }

    async fn admitted_provider_execution() -> (AppState, ProviderExecutionRequest) {
        let state = AppState::new(4);
        let router = app(state.clone());
        let epoch = state.epoch.to_string();
        let mut execution = provider_execution("provider-worker", "pending-token", &epoch);
        assert_eq!(
            request(
                router.clone(),
                "POST",
                "/v1/commands",
                provider_command_body(&epoch, &execution.command),
            )
            .await
            .0,
            StatusCode::ACCEPTED
        );
        execution.lease_token = claim(router, "provider-worker").await;
        (state, execution)
    }

    #[tokio::test]
    async fn provider_payload_is_immutably_bound_at_admission() {
        let (state, mut execution) = admitted_provider_execution().await;
        execution.command.interceptor_id = "substituted-interceptor".into();
        let provider = ScriptedProvider::new(SubmitMode::Reject);
        assert_eq!(
            state
                .execute_provider_claim(execution, &provider)
                .await
                .unwrap_err(),
            "provider_command_does_not_match_durable_envelope"
        );
        assert!(!provider.submit_called.load(Ordering::SeqCst));
    }

    #[tokio::test]
    async fn provider_dispositions_have_distinct_reclaim_semantics() {
        let (state, execution) = admitted_provider_execution().await;
        let not_sent = ScriptedProvider::new(SubmitMode::NotDispatched);
        let result = state
            .execute_provider_claim(execution, &not_sent)
            .await
            .unwrap();
        assert_eq!(result.state, ProviderExecutionState::RetryableNotDispatched);
        assert!(result.automatic_retry_allowed);
        let command_state: String = state
            .command_db
            .lock()
            .unwrap()
            .query_row(
                "SELECT execution_state FROM commands WHERE command_id='cmd-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(command_state, "pending");

        let (state, execution) = admitted_provider_execution().await;
        let rejected = ScriptedProvider::new(SubmitMode::Reject);
        let result = state
            .execute_provider_claim(execution, &rejected)
            .await
            .unwrap();
        assert_eq!(result.state, ProviderExecutionState::Rejected);
        assert!(!result.automatic_retry_allowed);
    }

    #[tokio::test]
    async fn unknown_outcome_honors_provider_retry_evidence() {
        for retryable in [false, true] {
            let (state, execution) = admitted_provider_execution().await;
            let provider = ScriptedProvider::new(SubmitMode::Unknown(retryable));
            let result = state
                .execute_provider_claim(execution, &provider)
                .await
                .unwrap();
            assert_eq!(result.state, ProviderExecutionState::UnknownExternalOutcome);
            assert_eq!(result.automatic_retry_allowed, retryable);
            let command_state: String = state
                .command_db
                .lock()
                .unwrap()
                .query_row(
                    "SELECT execution_state FROM commands WHERE command_id='cmd-1'",
                    [],
                    |row| row.get(0),
                )
                .unwrap();
            assert_eq!(
                command_state,
                if retryable { "pending" } else { "terminal" }
            );
        }
    }

    #[tokio::test]
    async fn accepted_provider_without_lookup_becomes_manual_unverifiable() {
        let (state, execution) = admitted_provider_execution().await;
        let provider = ScriptedProvider::new(SubmitMode::AcceptedNoLookup);
        assert_eq!(
            state
                .execute_provider_claim(execution, &provider)
                .await
                .unwrap()
                .state,
            ProviderExecutionState::Accepted
        );
        assert_eq!(
            state
                .reconcile_provider_operation("cmd-1", "reconciler-1", &provider)
                .await
                .unwrap(),
            ReconciliationState::ManualUnverifiable
        );
        let state_value: String = state
            .command_db
            .lock()
            .unwrap()
            .query_row(
                "SELECT state FROM provider_dispatch_attempts WHERE command_id='cmd-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(state_value, "manual_unverifiable");
    }

    #[tokio::test]
    async fn reconciliation_rejects_wrong_provider_before_claim() {
        let (state, execution) = admitted_provider_execution().await;
        let provider = LocalSimulatorAdapter::default();
        state
            .execute_provider_claim(execution, &provider)
            .await
            .unwrap();
        let mut wrong = ScriptedProvider::new(SubmitMode::Reject);
        wrong.id = ProviderId("different-provider".into());
        assert_eq!(
            state
                .reconcile_provider_operation("cmd-1", "reconciler-1", &wrong)
                .await
                .unwrap_err(),
            "reconciliation_provider_mismatch"
        );
        let attempt_state: String = state
            .command_db
            .lock()
            .unwrap()
            .query_row(
                "SELECT state FROM provider_dispatch_attempts WHERE command_id='cmd-1'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(attempt_state, "awaiting_reconciliation");
    }

    #[tokio::test]
    async fn expired_reconciliation_claim_is_reclaimed() {
        let (state, execution) = admitted_provider_execution().await;
        let provider = LocalSimulatorAdapter::default();
        state
            .execute_provider_claim(execution, &provider)
            .await
            .unwrap();
        provider
            .report_contact(&LocalContactReport {
                operation_id: "operation-1".into(),
                evidence_id: "evidence-reclaimed".into(),
                observed_at: Utc::now(),
                interceptor_position_m: [0.0, 0.0, 0.0],
                target_position_m: [3.0, 0.0, 0.0],
            })
            .unwrap();
        state
            .command_db
            .lock()
            .unwrap()
            .execute(
                "UPDATE provider_dispatch_attempts SET state='reconciling',
                 reconciliation_worker_id='dead-worker',reconciliation_token='dead-token',
                 reconciliation_lease_expires_at_ms=0 WHERE command_id='cmd-1'",
                [],
            )
            .unwrap();
        assert_eq!(
            state
                .reconcile_provider_operation("cmd-1", "replacement-worker", &provider)
                .await
                .unwrap(),
            ReconciliationState::AuthoritativeSucceeded
        );
    }

    #[tokio::test]
    async fn reconciliation_provider_timeout_releases_claim_for_retry() {
        let (state, execution) = admitted_provider_execution().await;
        let provider = ScriptedProvider::new(SubmitMode::AcceptedHang);
        state
            .execute_provider_claim(execution, &provider)
            .await
            .unwrap();
        assert_eq!(
            state
                .reconcile_provider_operation_with_limits(
                    "cmd-1",
                    "reconciler-1",
                    &provider,
                    Duration::from_secs(1),
                    Duration::from_millis(10),
                )
                .await
                .unwrap(),
            ReconciliationState::AwaitingReconciliation
        );
        let row: (String, Option<String>) = state
            .command_db
            .lock()
            .unwrap()
            .query_row(
                "SELECT state,reconciliation_token FROM provider_dispatch_attempts
                 WHERE command_id='cmd-1'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(row, ("awaiting_reconciliation".into(), None));
    }

    #[tokio::test]
    async fn expiry_during_prepare_is_rejected_before_submit() {
        let state = AppState::new(4);
        let router = app(state.clone());
        let epoch = state.epoch.to_string();
        let mut execution = provider_execution("provider-worker", "pending-token", &epoch);
        execution.command.constraints.expires_at = Utc::now() + ChronoDuration::milliseconds(100);
        let body = provider_command_body(&epoch, &execution.command);
        request(router.clone(), "POST", "/v1/commands", body).await;
        execution.lease_token = claim(router, "provider-worker").await;
        let mut provider = ScriptedProvider::new(SubmitMode::Reject);
        provider.prepare_delay = Duration::from_millis(150);
        let result = state
            .execute_provider_claim(execution, &provider)
            .await
            .unwrap();
        assert_eq!(result.state, ProviderExecutionState::Rejected);
        assert!(!provider.submit_called.load(Ordering::SeqCst));
        assert!(
            result
                .reason
                .unwrap()
                .starts_with("safety_gate_before_send")
        );
    }

    #[tokio::test]
    async fn restart_fences_an_attempt_that_may_have_been_sent() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("provider-restart.sqlite3");
        let state = AppState::with_database(4, 16, &path).unwrap();
        let router = app(state.clone());
        let epoch = state.epoch.to_string();
        request(
            router.clone(),
            "POST",
            "/v1/commands",
            command_body(&epoch, "drone-1"),
        )
        .await;
        let token = claim(router, "worker-crashed").await;
        {
            let mut db = state.command_db.lock().unwrap();
            let tx = db
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .unwrap();
            tx.execute(
                "UPDATE commands SET execution_state='terminal',last_error='provider_dispatch_in_progress'
                 WHERE command_id='cmd-1' AND worker_id='worker-crashed' AND lease_token=?1",
                [&token],
            )
            .unwrap();
            tx.execute(
                "INSERT INTO provider_dispatch_attempts(attempt_id,command_id,worker_id,lease_token,
                 provider_id,operation_id,request_fingerprint,state,automatic_retry_allowed,
                 created_at,updated_at) VALUES('attempt-crashed','cmd-1','worker-crashed',?1,
                 'local-simulator','operation-1','fp','sending',0,?2,?2)",
                params![token, now()],
            )
            .unwrap();
            tx.commit().unwrap();
        }
        drop(state);
        let recovered = AppState::with_database(4, 16, &path).unwrap();
        let db = recovered.command_db.lock().unwrap();
        let row: (String, i64, String, Option<String>) = db
            .query_row(
                "SELECT a.state,a.automatic_retry_allowed,c.execution_state,c.lease_token
                 FROM provider_dispatch_attempts a JOIN commands c USING(command_id)
                 WHERE a.attempt_id='attempt-crashed'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(
            row,
            (
                "unknown_external_outcome".into(),
                0,
                "terminal".into(),
                None
            )
        );
    }

    #[test]
    fn v3_to_v4_migration_preserves_attempt_and_command() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("migration-v3.sqlite3");
        let db = Connection::open(&path).unwrap();
        db.execute_batch(
            "PRAGMA foreign_keys=ON;
             CREATE TABLE commands(command_id TEXT PRIMARY KEY,idempotency_key TEXT NOT NULL UNIQUE,
               fingerprint TEXT NOT NULL,command_json TEXT NOT NULL,receipt_json TEXT NOT NULL,
               execution_state TEXT NOT NULL,created_at TEXT NOT NULL,worker_id TEXT,lease_token TEXT,
               lease_expires_at_ms INTEGER,attempt_count INTEGER NOT NULL DEFAULT 0,
               next_attempt_at_ms INTEGER NOT NULL DEFAULT 0,last_error TEXT);
             CREATE TABLE command_outcomes(command_id TEXT PRIMARY KEY REFERENCES commands(command_id),
               outcome_id TEXT NOT NULL UNIQUE,fingerprint TEXT NOT NULL,outcome_json TEXT NOT NULL,
               created_at TEXT NOT NULL,completed_worker_id TEXT,completed_lease_token TEXT);
             CREATE TABLE provider_dispatch_attempts(attempt_id TEXT PRIMARY KEY,
               command_id TEXT NOT NULL REFERENCES commands(command_id),worker_id TEXT NOT NULL,
               lease_token TEXT NOT NULL,provider_id TEXT NOT NULL,operation_id TEXT NOT NULL,
               request_fingerprint TEXT NOT NULL,state TEXT NOT NULL,automatic_retry_allowed INTEGER NOT NULL,
               reason TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
             INSERT INTO commands VALUES('cmd-old','idem-old','fp','{}',
               '{\"stream_sequence\":7}','terminal','then',NULL,NULL,NULL,1,0,NULL);
             INSERT INTO provider_dispatch_attempts VALUES('attempt-old','cmd-old','worker','lease',
               'provider','operation','request-fp','accepted',0,NULL,'then','then');
             PRAGMA user_version=3;",
        )
        .unwrap();
        drop(db);
        let migrated = AppState::with_database(4, 16, &path).unwrap();
        let db = migrated.command_db.lock().unwrap();
        let version: i64 = db
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        let row: (String, String, String, Option<String>) = db
            .query_row(
                "SELECT a.state,a.operation_id,c.command_id,a.external_operation_id
                 FROM provider_dispatch_attempts a JOIN commands c USING(command_id)
                 WHERE a.attempt_id='attempt-old'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
            )
            .unwrap();
        assert_eq!(version, 4);
        assert_eq!(
            row,
            (
                "awaiting_reconciliation".into(),
                "operation".into(),
                "cmd-old".into(),
                None
            )
        );
    }
}
