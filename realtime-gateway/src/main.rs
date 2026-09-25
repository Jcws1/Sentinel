use sentinel_realtime_gateway::{AppState, app};
use std::net::SocketAddr;
use tracing_subscriber::EnvFilter;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::from_default_env())
        .init();
    let address: SocketAddr = std::env::var("SENTINEL_GATEWAY_ADDR")
        .unwrap_or_else(|_| "127.0.0.1:8090".into())
        .parse()
        .expect("valid SENTINEL_GATEWAY_ADDR");
    let allow_remote = std::env::var("SENTINEL_ALLOW_INSECURE_REMOTE_BIND").as_deref() == Ok("1");
    if !address.ip().is_loopback() && !allow_remote {
        panic!(
            "refusing non-loopback bind; set SENTINEL_ALLOW_INSECURE_REMOTE_BIND=1 only for an explicitly isolated prototype environment"
        );
    }
    let capacity = std::env::var("SENTINEL_CLIENT_QUEUE_CAPACITY")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(256);
    let retention = std::env::var("SENTINEL_DELTA_RETENTION")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(4096);
    let database_path = std::env::var("SENTINEL_COMMAND_DB_PATH")
        .unwrap_or_else(|_| "sentinel-command-journal.sqlite3".into());
    let state = AppState::with_database(capacity, retention, &database_path)
        .expect("initialize durable command database");
    let listener = tokio::net::TcpListener::bind(address)
        .await
        .expect("bind gateway");
    tracing::info!(%address, capacity, retention, %database_path, "gateway listening");
    axum::serve(listener, app(state))
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await
        .expect("serve gateway");
}
