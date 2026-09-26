# Hosted NLP recommendation to local simulated interception

This manual proof preserves separate authorities and a causal evidence chain:

1. a fresh hosted Observe/Orient call must explicitly recommend `RESPOND` for
   one operational hostile entity and track in the exact committed frame;
2. a normalized, non-executable recommendation retains the model, frame,
   target and evidence IDs;
3. an operator-confirmation artifact names that exact recommendation and
   target;
4. the provider-neutral command passes the deterministic safety gate and is
   admitted by `LocalSimulatorAdapter`; and
5. deterministic pursuit kinematics advance both simulated objects until the
   calculated separation enters the contact radius. Only then can a validated
   `LocalContactReport` create the authoritative local outcome.

Prepare a fresh recommendation from the repository root:

```powershell
./scripts/run_hosted_assessment_local_intercept_proof.ps1
```

The command prints the exact recommendation ID, action, target, model statement
and evidence IDs. Only after reviewing those exact values may the operator run
the printed second command with `-ConfirmRecommendationId` and their identity.
The confirmation phase refuses any different ID or changed evidence hash.

Every preparation fetches fresh hosted world and inference responses. The
confirmation phase is the only reuse path and accepts only the exact prepared,
hash-verified recommendation. `capture-manifest.json` binds the HTTPS base URL,
Origin, mission, frame, endpoints and SHA-256 hashes of the request, world,
assessment, normalized recommendation and confirmation. The ignored Rust test
verifies those hashes before dispatch.

The resulting ignored evidence directory contains the full kinematic samples,
validated contact report, reconciliation report and authoritative outcome. No
Wedgetail call or Wedgetail outcome is claimed. The hosted frame is historical,
so the safety clock is anchored to its recorded timestamp for deterministic
replay; this proves evidence/authority/tasking plumbing and simulated contact,
not current real-world authorization or physical flight.
