#!/bin/sh
set -eu
: "${UPSTREAM_HOST:?required}"
: "${UPSTREAM_PORT:?required}"
tc qdisc add dev eth0 root netem delay "${LATENCY_MS:-50}ms" "${JITTER_MS:-20}ms" distribution normal loss "${LOSS_PERCENT:-0.1}%" rate "${RATE_MBIT:-20}mbit"
# Preserve interactive-stream behavior. Without TCP_NODELAY, the forwarding
# shim itself introduces ~200 ms delayed-ACK/Nagle plateaus that aren't part of
# the declared cloud impairment profile.
exec socat TCP-LISTEN:9000,fork,reuseaddr,nodelay TCP:"${UPSTREAM_HOST}":"${UPSTREAM_PORT}",nodelay
