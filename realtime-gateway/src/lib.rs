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
use rusqlite::{Connection, OptionalExtension, TransactionBehavior, params};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use std::path::Path as FsPath;
use std::{
    collections::{BTreeMap, HashMap, VecDeque},
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
    fingerprint: String,
    delta: TrackDelta,
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
    observation_latency_us: Mutex<VecDeque<u64>>,
    max_client_queue_depth: AtomicUsize,
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
    max_client_queue_depth: usize,
    observation_latency_us_p50: u64,
    observation_latency_us_p95: u64,
    observation_latency_us_p99: u64,
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
    observations: Arc<Mutex<HashMap<String, StoredObservation>>>,
    ingestion_lock: Arc<Mutex<()>>,
    command_db: Arc<Mutex<Connection>>,
    hub: Arc<Mutex<Hub>>,
    pub metrics: Arc<Metrics>,
    client_queue_capacity: usize,
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
        assert!(client_queue_capacity > 0);
        assert!(delta_retention > 0);
        let connection = Connection::open(path)?;
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.pragma_update(None, "journal_mode", "WAL")?;
        connection.pragma_update(None, "synchronous", "FULL")?;
        let user_version: u32 =
            connection.pragma_query_value(None, "user_version", |r| r.get(0))?;
        if user_version > 2 {
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
            observations: Default::default(),
            ingestion_lock: Default::default(),
            command_db: Arc::new(Mutex::new(connection)),
            hub: Arc::new(Mutex::new(Hub::new(delta_retention))),
            metrics: Default::default(),
            client_queue_capacity,
        })
    }
    fn next_delta_sequence(&self) -> u64 {
        self.delta_sequence.fetch_add(1, Ordering::SeqCst) + 1
    }
    fn next_command_sequence(&self) -> u64 {
        self.command_sequence.fetch_add(1, Ordering::SeqCst) + 1
    }
}

pub fn app(state: AppState) -> Router {
    Router::new()
        .route("/healthz", get(health))
        .route("/metrics", get(metrics))
        .route("/v1/snapshot", get(snapshot))
        .route("/v1/observations", post(ingest))
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
    Json(MetricsView {
        observations: s.metrics.observations.load(Ordering::Relaxed),
        commands_accepted: s.metrics.commands_accepted.load(Ordering::Relaxed),
        command_duplicates: s.metrics.command_duplicates.load(Ordering::Relaxed),
        command_conflicts: s.metrics.command_conflicts.load(Ordering::Relaxed),
        ws_connected: s.metrics.ws_connected.load(Ordering::Relaxed),
        slow_client_disconnects: s.metrics.slow_disconnects.load(Ordering::Relaxed),
        deltas_published: s.metrics.deltas_published.load(Ordering::Relaxed),
        max_client_queue_depth: s.metrics.max_client_queue_depth.load(Ordering::Relaxed),
        observation_latency_us_p50: percentile(&mut samples.clone(), 0.50),
        observation_latency_us_p95: percentile(&mut samples.clone(), 0.95),
        observation_latency_us_p99: percentile(&mut samples.clone(), 0.99),
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

async fn ingest(State(s): State<AppState>, Json(o): Json<Observation>) -> Response {
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
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"invalid realtime/v1 observation"})),
        )
            .into_response();
    }
    // The prototype uses one short critical section to make observation
    // idempotency, source ordering, track mutation and cursor allocation one
    // transaction. The production keyed-worker version will shard this lock.
    let _ingestion = s.ingestion_lock.lock().unwrap();
    let observation_fingerprint = format!("{:x}", Sha256::digest(serde_json::to_vec(&o).unwrap()));
    if let Some(existing) = s.observations.lock().unwrap().get(&o.observation_id) {
        if existing.fingerprint != observation_fingerprint {
            return (
                StatusCode::CONFLICT,
                Json(json!({"error":"observation_id_reused_with_different_content"})),
            )
                .into_response();
        }
        return with_epoch(&s, (StatusCode::OK, Json(existing.delta.clone())));
    }
    let key = (o.source_id.clone(), o.track_id.clone());
    {
        let mut seqs = s.source_sequences.lock().unwrap();
        if o.source_sequence <= *seqs.get(&key).unwrap_or(&0) {
            return (
                StatusCode::CONFLICT,
                Json(json!({"error":"source_sequence_not_increasing"})),
            )
                .into_response();
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
    s.observations.lock().unwrap().insert(
        o.observation_id,
        StoredObservation {
            fingerprint: observation_fingerprint,
            delta: delta.clone(),
        },
    );
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
    if latencies.len() > 100_000 {
        latencies.pop_front();
    }
    drop(latencies);
    with_epoch(&s, (StatusCode::ACCEPTED, Json(delta)))
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
    let candidate: Option<String> = match tx
        .query_row(
            "SELECT command_id FROM commands
         WHERE execution_state='pending' AND next_attempt_at_ms<=?1
           AND (lease_token IS NULL OR lease_expires_at_ms<=?1)
         ORDER BY next_attempt_at_ms,created_at,command_id LIMIT 1",
            [now_ms],
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
          next_attempt_at_ms=?1,last_error=?2 WHERE command_id=?3 AND execution_state='pending'
          AND worker_id=?4 AND lease_token=?5 AND lease_expires_at_ms>?6",
        params![
            next,
            request.error,
            command_id,
            request.worker_id,
            request.lease_token,
            now_ms
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
    with_epoch(
        s,
        Json(
            json!({"command_id":command_id,"execution_state":"pending","next_attempt_at_ms":next}),
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
}

async fn ws_upgrade(
    State(s): State<AppState>,
    Query(params): Query<WsParams>,
    ws: WebSocketUpgrade,
) -> Response {
    let state = s.clone();
    with_epoch(
        &s,
        ws.on_upgrade(move |socket| ws_client(socket, state, params.after_sequence)),
    )
}

async fn ws_client(mut socket: WebSocket, state: AppState, after: u64) {
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
    state.metrics.ws_connected.fetch_add(1, Ordering::Relaxed);
    let hello = json!({"message_type":"gateway_hello","schema_version":VERSION,"server_epoch":state.epoch.as_str(),
        "transport_version":"sentinel-gateway/v1","stream_id":STREAM_ID,"requested_after_sequence":after,
        "current_sequence":subscription_cursor,"recovery":"GET /v1/snapshot"});
    if socket
        .send(Message::Text(hello.to_string().into()))
        .await
        .is_ok()
    {
        for payload in suffix {
            if socket.send(Message::Text(payload.into())).await.is_err() {
                break;
            }
        }
        loop {
            tokio::select! {
                item = rx.recv() => match item { Some(v) => if socket.send(Message::Text(v.into())).await.is_err(){break}, None => break },
                changed = stop.changed() => {
                    if changed.is_ok() {
                        let reason = stop.borrow().clone().unwrap_or_else(|| "snapshot_required".into());
                        let gap = json!({"message_type":"gateway_resync_required","schema_version":VERSION,"server_epoch":state.epoch.as_str(),
                            "reason":reason,"snapshot_url":"/v1/snapshot"});
                        let _ = socket.send(Message::Text(gap.to_string().into())).await;
                        let _ = socket.send(Message::Close(None)).await;
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
    use http_body_util::BodyExt;
    use tower::ServiceExt;

    fn observation(seq: u64) -> Value {
        json!({"schema_version":VERSION,"message_type":"observation","message_id":format!("m-{seq}"),"stream_id":"sensor-a","stream_sequence":seq,"emitted_at":"2026-09-25T00:00:00Z","correlation":{"correlation_id":"c-1"},"observation_id":format!("o-{seq}"),"track_id":"drone-1","source_id":"radar-1","source_sequence":seq,"source_time":"2026-09-25T00:00:00Z","position":{"x_mm":seq,"y_mm":2},"velocity":{"x_mm_s":3,"y_mm_s":4}})
    }
    fn command_body(epoch: &str, target: &str) -> Value {
        json!({"transport_version":"sentinel-gateway/v1","expected_epoch":epoch,"expected_revision":0,
            "command":{"schema_version":VERSION,"message_type":"command","message_id":"m-cmd","stream_id":"operator","stream_sequence":1,
            "emitted_at":"2026-09-25T00:00:00Z","correlation":{"correlation_id":"c-cmd"},"command_id":"cmd-1",
            "command_name":"intercept","target_id":target,"idempotency_key":"idem-1","parameters":{}}})
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
}
