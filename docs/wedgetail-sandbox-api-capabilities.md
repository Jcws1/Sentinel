# Wedgetail Sandbox API Capability Boundary

Status: source of truth for the Sentinel Wedgetail sandbox adapter  
Verified: 2026-09-25 against the public Wedgetail API documentation, API index, and deployed simulator client

## Purpose

This document records what the public Wedgetail Dynamics sandbox interface does and does not guarantee. The Sentinel adapter must remain within this boundary and must not describe a browser-local simulation result as an authoritative external interception outcome.

The sandbox is explicitly a simulation. Its public credentials do not provide access to real interceptors, real launch sites, or production data. API-key values are intentionally not reproduced here.

## Official sources

- API reference: <https://wedgetail-dynamics.com/sim/docs>
- Machine-readable API index: <https://wedgetail-dynamics.com/api>
- Live sandbox viewer: <https://wedgetail-dynamics.com/sim/?livesandbox=true>
- Deployed viewer implementation: <https://wedgetail-dynamics.com/sim/sim.js>

The API reference and API index define the documented external interface. Details derived from `sim.js` describe the currently deployed viewer implementation and are not assumed to be a stable, versioned external contract.

## Authentication

Sandbox HTTP endpoints require an API key in the `X-API-Key` header. The API index publishes sandbox-only testing credentials, but their values must not be committed to Sentinel source or documentation.

The live sandbox WebSocket is documented as read-only and does not require an API key.

## Supported endpoints

### `GET /sandbox/launchpoints`

Lists the sandbox interceptor-box launchpoints. The documented response contains:

- `status`
- `message`
- `launchpoints[]`
  - `box_id`
  - `description`
  - `lat`
  - `long`
  - `elevation_m`
  - `active`

The public sandbox currently documents three launchpoints: `box_1`, `box_2`, and `box_3`.

### `POST /sandbox/addtarget`

Submits a simulated Shahed target detection. Acceptance broadcasts a spawn event to viewers of the live sandbox and the selected battery's interceptor autonomously engages the target.

Request fields:

| Field | Type | Constraint and meaning |
| --- | --- | --- |
| `azimuth_d` | number | 0-360; compass bearing from the selected launchpoint to the target |
| `altitude_d` | number | 0-90; elevation angle above the horizon |
| `distance_m` | number | Greater than zero; straight-line target distance in metres |
| `speed_m_s` | number | Greater than zero; target speed in metres per second |
| `direction_d` | number | 0-360; compass heading in which the target travels |
| `unix_timestamp` | integer | Unix seconds; must be within five minutes of server time |
| `box_id` | optional string | One of the launchpoint IDs; defaults to `box_1` |
| `label` | optional string | 1-20 alphanumeric characters; visual target label |

`azimuth_d` and `direction_d` describe the target, not the interceptor. The caller can select a battery with `box_id`, but the documented API does not allow the caller to set interceptor course, interceptor azimuth, launch timing, target assignment, or interceptor count.

A successful response contains `status`, a human-readable `message`, and an echoed `received` object. It may also contain a `warning` when the requested placement is well outside the useful map area. It does not contain a server-generated target ID or operation ID.

### `GET /sandbox/livesandbox/ws`

This is a read-only WebSocket used by the hosted live viewer. The API index documents it as delivering `spawn_shahed` events when clients submit targets.

The deployed viewer currently consumes messages with the effective shape:

```json
{
  "type": "spawn_shahed",
  "box_id": "box_1",
  "target": {
    "azimuth_d": 180,
    "altitude_d": 15,
    "distance_m": 1400,
    "speed_m_s": 100,
    "direction_d": 0,
    "unix_timestamp": 1788000183,
    "box_id": "box_1",
    "label": "Example1"
  }
}
```

This message shape is evidenced by the deployed viewer implementation, not published as a versioned protocol schema. Sentinel must parse it defensively.

## Capacity and documented errors

The sandbox-wide capacity limit is ten Shaheds already in flight. When ten or more are in flight, `POST /sandbox/addtarget` returns HTTP `429`. This is a concurrent-object limit; the documentation does not define a separate requests-per-second quota or `Retry-After` behavior.

Documented error statuses are:

| Status | Meaning |
| --- | --- |
| `400` | Invalid JSON or field validation failure |
| `401` | Missing or invalid API-key header |
| `404` | Unknown route |
| `415` | Unsupported content type |
| `429` | Sandbox-wide in-flight target limit reached |

Every documented error response contains `status` and a human-readable `message`. Validation failures can include per-field `issues`.

## Idempotency and reconciliation limitations

The documented interface provides no caller-supplied or server-issued idempotency mechanism:

- no `Idempotency-Key` header;
- no `command_id` or client request ID;
- no server-generated `operation_id` or target ID;
- no documented duplicate-request behavior;
- no lookup by request, command, label, or timestamp;
- no operation-status endpoint.

The optional `label` is display metadata. It is neither unique nor documented as an idempotency or reconciliation key.

If Sentinel sends a request and loses the HTTP response, it cannot determine through the documented API whether the target was created. Blind retry could create another target. The adapter must therefore preserve an ambiguous external result rather than claim failure or automatically retry an effect-producing request.

## Browser-local simulation caveat

The deployed `sim.js` shows the following behavior:

1. The browser receives a `spawn_shahed` event.
2. The browser creates the target locally using the submitted position, heading, and speed.
3. The browser re-arms the selected local interceptor model and runs its engagement sequence.
4. Lead-pursuit, motion, collision detection, success, target impact, and map-loss state are calculated in JavaScript in that viewer.
5. A collision changes the browser-local target state to `intercepted` and the local interceptor state to `expended`.
6. The viewer does not report that result to a documented server endpoint.
7. The WebSocket handler consumes spawn messages only; no authoritative telemetry or outcome event is documented.

Consequently, separate viewers can be treated only as visual simulations of the accepted spawn. A screenshot or observed browser animation is useful demonstration evidence, but it is not a server-authoritative interception receipt.

The public interface currently provides no authoritative:

- target telemetry stream;
- interceptor telemetry stream;
- intercept success or failure event;
- operation-status lookup;
- server-generated correlation identifier;
- terminal outcome reconciliation.

## Required Sentinel adapter behavior

The adapter may safely record these states:

- `SUBMISSION_ACCEPTED`: Wedgetail returned a documented successful HTTP response.
- `SUBMISSION_REJECTED`: Wedgetail returned a documented error response.
- `UNKNOWN_EXTERNAL_OUTCOME`: transport failed or timed out after dispatch and acceptance cannot be reconciled.
- `VISUAL_SPAWN_OBSERVED`: a matching spawn was observed through the read-only WebSocket or viewer instrumentation.
- `VISUAL_INTERCEPT_OBSERVED`: the hosted viewer showed its browser-local simulated interception.
- `VISUAL_TARGET_IMPACT_OBSERVED`: the hosted viewer showed its browser-local target-impact result.
- `VISUAL_TARGET_LOST_OBSERVED`: the hosted viewer removed an off-map target as lost.

Only the first two states are direct HTTP submission results. The `VISUAL_*` states must always be labelled non-authoritative and browser-local.

The adapter must not emit `AUTHORITATIVE_INTERCEPT_CONFIRMED` from a screenshot, DOM state, canvas observation, elapsed time, or the current WebSocket feed.

### Dispatch policy

1. Create and durably claim the Sentinel command using the existing local lease and fencing protocol.
2. Attach Sentinel's internal command ID to the audit record. If it fits the documented label restrictions, a shortened display-safe correlation label may also be sent, but it must not be treated as an external idempotency key.
3. Submit at most once for a given claimed attempt.
4. Persist the complete sanitized request, HTTP status, response body, timing, and transport result.
5. On an explicit Wedgetail error, release or terminally reject according to the error class. A `429` may be rescheduled because the server explicitly rejected creation.
6. On a successful response, record `SUBMISSION_ACCEPTED`; do not claim a confirmed intercept.
7. On a timeout, connection loss, or indeterminate response after dispatch, record `UNKNOWN_EXTERNAL_OUTCOME` and do not blindly retry.
8. Any viewer-side observation is recorded as supplemental, non-authoritative evidence correlated by best-effort label, box, submitted parameters, and time window.

This produces at-most-once automatic submission under ambiguous network failure. It deliberately sacrifices automatic retry rather than risk duplicate visible side effects.

## What Wedgetail would need for exactly-once-like execution

A stronger adapter requires an official protocol providing all of the following:

1. A stable caller-provided idempotency or command key.
2. A server-generated operation or target identifier.
3. Status lookup by operation ID or command key.
4. Authoritative telemetry carrying that identifier.
5. A terminal authoritative outcome event.
6. Defined retention and duplicate-request semantics.

Until that protocol exists, the Wedgetail connector is a limited sandbox target-injection adapter. Sentinel's internal simulator and other interceptor adapters may implement the full command, receipt, telemetry, and authoritative-outcome contract independently.

## Review trigger

Reverify this document before changing the adapter whenever the official API index or API reference adds an endpoint or field. In particular, search for new operation IDs, idempotency support, telemetry feeds, outcome events, and status lookup before relaxing any safety restriction above.
