# Demo and scenario runbook

Start the application using the [root instructions](../README.md), with `SENTINEL_DEMO=1`. Optional `SENTINEL_FIXTURES=1` seeds the developer missions without overwriting existing records.

- **New demo** creates an interactive recording; lifecycle controls provide Pause/Resume and End. End preserves the recording.
- **Load mission** opens saved plans, recordings or developer fixtures. An ended recording is read-only.
- **Orchestrator → Units** authors a saved arrangement. Expand Friendly/Hostile, select a supported profile, then place on the authoring map or enter coordinates. Unknown placement has no profile chooser.
- **Orchestrator → Units → Location & boundaries → Scenario location** previews a new horizontal origin by map click or coordinates. Apply preserves existing unit/route/boundary coordinates and refuses changes that exclude them. Recenter and Show operating area move only the camera. See [location limits and verification](scenario-location/README.md).
- **Orchestrator → Conductor** edits supported actions. Shared Save, Validate and Run controls operate on the same draft and exact saved revision. Validation does not automatically execute commands.
- Fleet/map selection drives Details. Movement, Stop, Return and supported Intercept commands use existing authority rules. Return clears manual overrides; cancelled or skipped dependency chains are not replayed.
- Details shows a static supplied STING or quadcopter reference when the selected
  entity has that explicit profile. The small silhouette, profile label and entity
  name remain separate from live simulation telemetry. Unknown/historical types
  without a reliable profile show a fallback. Pin and Close are in the compact
  Details header; Video Feed still opens the separately labelled simulated view.
- An uncertain command keeps its original identity for recovery. Do not clear browser storage or operator databases as a troubleshooting shortcut.
- **Fleet → Suggestions → Review options** is advisory. Inspect affected and excluded members, then explicitly Apply; stale cards require Refresh. Review and Keep current orders send no command. Lost Apply/Stop responses use **Attention → Check receipt / Retry saved request**, preserving the captured identity and payload.
- **Source report delayed** means the transport can still be connected while observations stop advancing. Retain the last committed view; movement waits for source recovery. Stop remains available when its nonpositional control checks pass. After a backend restart, existing interruption/paused recovery and explicit Take control apply; scripts are not silently restarted.

Use arrangement checkboxes for multiple-unit selection. Select all shown adds only filtered rows; the total includes hidden selections. Delete selected reviews the full selection and refuses the entire batch if any selected actor still has scripted actions. Remove dependent actions before their predecessors; no cascade or live-run deletion occurs. See [Orchestrator workflow and compatibility](orchestrator-ui/README.md).

## Reproducible 20v20

The [tracked fixture](../frontend/tests/fixtures/scenario-20v20.json) contains twenty supported Friendly and twenty Hostile Hornet 10 units, with three chained Move actions each. Hostile units are scripted observations, not interceptors. The reusable UI harness saves it through the scenario API and validates/runs it through the shared Orchestrator controls.

```powershell
npm --prefix frontend run build:performance
npm --prefix frontend run test:capacity
```

This uses an isolated runtime and database. It exercises moving entities, command uncertainty/retry, reconnect, restart, twenty supported outcomes, forty NON-OP entities, End, recorded inspection and mission isolation. See [test instructions](../frontend/tests/README.md) for a foreground manual demo or display measurements.

The [D7 verification](integrated-acceptance/README.md) separates functional, recovery and performance gates. The ten-minute soak uses the same profiles and three chained Move legs, extending each destination to ±0.035° longitude inside the same ±5km square so all40 can continue moving for the full window. It does not change simulation speed or timing. Existing default, nearby and Sydney fixtures remain under `frontend/tests/fixtures/scenario-location/`.

## Developer fixtures

The separate **Views → Simulation** workflow accepts external JSON batches and
offers authoritative START acknowledgement, explicit HOLD/ABORT and supplied
RESUME batches. Use **Retry exact pending command** after an uncertain response;
the saved body survives reload. **Load recorded commands** permits earlier outcome
inspection after ABORT. See the [Phase 5 operator guide](phase5-simulation-compatibility/README.md).
Its MSL external tracks are unmanaged unless an explicit domain mapping says
otherwise; they do not join the interactive movement executor.

Synthetic Alpha, Bravo, Tactical, Observations and Blank grid retain their existing fixture meanings. Fixture advancement is an explicit developer/API operation; UI telemetry does not advance them. Existing seeded records and operator recordings survive restart. Blank grid isolates application rendering overhead; it is not evidence of normal-provider performance.

## Command Picture and Vertical Profile

After loading a mission, open Command Picture from the activity bar. Overview and
Resources separate filtered counts from mission totals. Recorded activity and
Statistics pin a committed recording cutoff; set a UTC range then Read range.
Use latest cutoff explicitly refreshes that anchor without seeking live time.
Comparison uses up to four shared selections and supplied raw measurements.

Vertical profile plots altitude versus radial horizontal distance from the active
mission/location reference. Choose a native datum group or capture the selected
observed entity as a fixed origin. Optional observed history preserves source gaps;
it does not predict movement. Open profile to side or use Views → Vertical Profile.
For external data, first use Simulation → Inspect mapped mission. BLUE entities
remain unmanaged unless explicit authority data exists. See
[Phase 6 workflow and limitations](phase6-command-picture/README.md).
