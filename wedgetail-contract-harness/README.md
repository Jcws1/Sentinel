# Wedgetail live contract harness

This is a deliberately isolated, operator-triggered probe for the public
Wedgetail sandbox. It submits **at most one labeled target**. It never claims
that an accepted target was intercepted: the documented API has no
authoritative outcome lookup.

Dry run is the default and makes no network request:

```powershell
cargo run --manifest-path wedgetail-contract-harness/Cargo.toml
```

A live probe is deliberately awkward. Before running it, confirm the shared
sandbox is appropriate for a test and set `WEDGETAIL_API_KEY` in the process
environment. Then supply all three opt-in switches:

```powershell
cargo run --manifest-path wedgetail-contract-harness/Cargo.toml -- `
  --execute --confirm-one-target --ack-shared-capacity-risk `
  --output test-results/wedgetail-contract-one-target.json
```

The sandbox limit is 10 in-flight targets across all users. There is no
documented endpoint that exposes the current count, so capacity cannot be
preflighted. The harness records this limitation, sends only one target, and
classifies HTTP 429 separately. A transport error after live dispatch is
ambiguous: do not retry it blindly.

Evidence contains the sanitized request, bounded response body, HTTP
classification and elapsed time. The API key is read only at dispatch, is not
placed in the request model, and is never printed or written to evidence.

This executable has no batch mode, target-count option, automatic retry, or
loop. Validation tests never issue network requests.

```powershell
cargo test --manifest-path wedgetail-contract-harness/Cargo.toml
cargo clippy --manifest-path wedgetail-contract-harness/Cargo.toml --all-targets -- -D warnings
cargo fmt --manifest-path wedgetail-contract-harness/Cargo.toml -- --check
```
