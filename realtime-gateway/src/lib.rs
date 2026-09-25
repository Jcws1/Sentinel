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
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
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

#[derive(Clone, Debug, Deserialize)]
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

#[derive(Clone, Debug, Serialize)]
pub struct CommandReceipt {
    schema_version: &'static str,
    message_type: &'static str,
    message_id: String,
    stream_id: &'static str,
    stream_sequence: u64,
    emitted_at: String,
    correlation: Correlation,
    command_id: String,
    receipt_status: &'static str,
    #[serde(skip_serializing_if = "Option::is_none")]
    reason: Option<String>,
}

#[derive(Clone, Debug)]
struct StoredCommand {
    fingerprint: String,
    receipt: CommandReceipt,
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
    commands: Arc<Mutex<HashMap<String, StoredCommand>>>,
    command_ids: Arc<Mutex<HashMap<String, String>>>,
    hub: Arc<Mutex<Hub>>,
    pub metrics: Arc<Metrics>,
    client_queue_capacity: usize,
}

impl AppState {
    pub fn new(client_queue_capacity: usize) -> Self {
        Self::with_retention(client_queue_capacity, 4096)
    }

    pub fn with_retention(client_queue_capacity: usize, delta_retention: usize) -> Self {
        assert!(client_queue_capacity > 0);
        assert!(delta_retention > 0);
        Self {
            epoch: Arc::new(format!(
                "epoch-{}-{}",
                Utc::now().timestamp_millis(),
                std::process::id()
            )),
            delta_sequence: Arc::new(AtomicU64::new(0)),
            command_sequence: Arc::new(AtomicU64::new(0)),
            tracks: Default::default(),
            source_sequences: Default::default(),
            observations: Default::default(),
            ingestion_lock: Default::default(),
            commands: Default::default(),
            command_ids: Default::default(),
            hub: Arc::new(Mutex::new(Hub::new(delta_retention))),
            metrics: Default::default(),
            client_queue_capacity,
        }
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
        .route("/v1/commands/{command_id}", get(reconcile))
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
    let c = &request.command;
    let value = json!({"transport_version":request.transport_version,"expected_epoch":request.expected_epoch,
        "expected_revision":request.expected_revision,"command_id":c.command_id,"command_name":c.command_name,
        "target_id":c.target_id,"parameters":c.parameters});
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
    if request.expected_epoch != *s.epoch {
        return (
            StatusCode::CONFLICT,
            Json(json!({"error":"server_epoch_mismatch","current_epoch":s.epoch.as_str()})),
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
    let mut commands = s.commands.lock().unwrap();
    if let Some(stored) = commands.get(&c.idempotency_key) {
        if stored.fingerprint != fp {
            s.metrics.command_conflicts.fetch_add(1, Ordering::Relaxed);
            return (
                StatusCode::CONFLICT,
                Json(json!({"error":"idempotency_key_reused_with_different_command"})),
            )
                .into_response();
        }
        s.metrics.command_duplicates.fetch_add(1, Ordering::Relaxed);
        let mut duplicate = stored.receipt.clone();
        duplicate.receipt_status = "duplicate";
        return with_epoch(&s, (StatusCode::OK, Json(duplicate)));
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
    let mut command_ids = s.command_ids.lock().unwrap();
    if let Some(existing_key) = command_ids.get(&c.command_id)
        && existing_key != &c.idempotency_key
    {
        s.metrics.command_conflicts.fetch_add(1, Ordering::Relaxed);
        return (
            StatusCode::CONFLICT,
            Json(json!({"error":"command_id_reused_with_different_idempotency_key"})),
        )
            .into_response();
    }
    let seq = s.next_command_sequence();
    let receipt = CommandReceipt {
        schema_version: VERSION,
        message_type: "command_receipt",
        message_id: format!("receipt-{seq}"),
        stream_id: COMMAND_STREAM_ID,
        stream_sequence: seq,
        emitted_at: now(),
        correlation: Correlation {
            correlation_id: c.correlation.correlation_id.clone(),
            causation_id: Some(c.message_id.clone()),
            trace_id: c.correlation.trace_id.clone(),
        },
        command_id: c.command_id.clone(),
        receipt_status: "accepted",
        reason: None,
    };
    commands.insert(
        c.idempotency_key.clone(),
        StoredCommand {
            fingerprint: fp,
            receipt: receipt.clone(),
        },
    );
    command_ids.insert(c.command_id.clone(), c.idempotency_key.clone());
    s.metrics.commands_accepted.fetch_add(1, Ordering::Relaxed);
    with_epoch(&s, (StatusCode::ACCEPTED, Json(receipt)))
}

async fn reconcile(State(s): State<AppState>, Path(command_id): Path<String>) -> Response {
    let idempotency_key = {
        let ids = s.command_ids.lock().unwrap();
        let Some(key) = ids.get(&command_id) else {
            return StatusCode::NOT_FOUND.into_response();
        };
        key.clone()
    };
    let commands = s.commands.lock().unwrap();
    let receipt = commands.get(&idempotency_key).unwrap().receipt.clone();
    with_epoch(&s, Json(receipt))
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
        assert_eq!(r["receipt_status"], "duplicate");
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
