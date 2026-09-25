# Interceptor provider boundary

This isolated crate defines Sentinel's provider-neutral interception boundary. It
does not dispatch from the gateway yet and contains no credentials.
`HttpsProviderTransport` is the concrete `reqwest`/rustls network client;
adapters still receive it through `ProviderTransport`, which keeps contract
tests offline and makes ambiguous network outcomes explicit.
The transport contract permits an ordinary error only before any request bytes
were sent. A timeout, reset, or cancellation after a write starts must be
reported as `AmbiguousAfterDispatch`; adapters may never downgrade it to a safe
retry.

The production transport accepts HTTPS origins only, checks the destination
against an explicit origin allowlist, rejects URL credentials and fragments,
disables redirects and ambient proxies, restricts HTTP methods, rejects
hop-by-hop/sensitive ordinary/duplicate headers, bounds the response body, and
uses one absolute deadline across DNS, connection, send and response reading.
The reviewed hostname is resolved once, private/non-routable addresses are
rejected, and the accepted addresses are pinned into the client to prevent DNS
rebinding. An explicit private-network policy exists only in the test
constructor. DNS failures are pre-dispatch. A reqwest `is_connect` error is
classified `NotDispatched` only because request bytes were not dispatched; any
timeout or error whose dispatch status cannot be proven is conservatively
`AmbiguousAfterDispatch`. Secret headers are added only while constructing the
request. Secret echoes in response bytes are rejected before JSON is returned,
and neither secret values nor provider response bodies appear in error
messages. Loopback HTTP exists only in `cfg(test)` for black-box mock-server
coverage.

Adapters:

- `LocalSimulatorAdapter` is an in-memory test oracle. It enforces 30 concurrent
  operations and terminal transitions and provides native operation idempotency,
  lifecycle telemetry, cancellation and authoritative outcomes. Its state does
  **not** survive process restart; gateway restart recovery must be tested with
  the durable outbox, not inferred from this adapter.
- `WedgetailSandboxAdapter` implements the documented exact
  `POST /sandbox/addtarget` body and injected `X-API-Key`. The secret is kept out
  of prepared/audit data and debug output. `box_id` means the documented launch
  box, not an interceptor ID. The adapter deliberately advertises no
  native idempotency, operation lookup, cancellation, telemetry or authoritative
  terminal outcome. An ambiguous submission becomes
  `UnknownExternalOutcome` and **must not be retried automatically**.
- `GenericHttpAdapter` supports allowlisted origins and declarative submission,
  status and cancellation URLs. Native-key and status-lookup guarantees are
  advertised only when explicitly configured.

The public Wedgetail simulator and documentation are:

- <https://wedgetail-dynamics.com/sim/index.html>
- <https://wedgetail-dynamics.com/sim/docs>

Those pages describe a sandbox, not a general exactly-once command protocol.
This crate therefore does not infer missing idempotency, status, cancellation or
outcome guarantees. If later documentation or observed contract tests prove
additional capabilities, add them behind a new capability version and tests.

## Durable-outbox integration

The gateway should persist the command, stable `operation_id`, canonical
fingerprint and selected provider before leasing work. A worker then revalidates
the safety/authority gate, calls the side-effect-free `prepare`, persists its
dispatch attempt, and calls `submit`. A definite acknowledgement proceeds to
reconciliation. A timeout or connection reset follows the advertised
`IdempotencyMode`; mode `None` enters `UnknownExternalOutcome`, blocks blind
retry, and requires external/operator reconciliation.

An HTTP success or submission receipt is not proof of interception. Sentinel
may mark interception success only from `AuthoritativeOutcome` or separately
governed, correlated live evidence.

## Check

```powershell
cargo test --manifest-path interceptor-providers/Cargo.toml
cargo clippy --manifest-path interceptor-providers/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path interceptor-providers/Cargo.toml -- --check
```
