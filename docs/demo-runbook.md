# Demo and scenario runbook

Start the application using the [root instructions](../README.md), with `SENTINEL_DEMO=1`. Optional `SENTINEL_FIXTURES=1` seeds the developer missions without overwriting existing records.

- **New demo** creates an interactive recording; lifecycle controls provide Pause/Resume and End. End preserves the recording.
- **Load mission** opens saved plans, recordings or developer fixtures. An ended recording is read-only.
- **Units** authors a saved arrangement. Expand Friendly/Hostile, select a supported profile, then place on the authoring map or enter coordinates. Unknown placement has no profile chooser.
- **Conductor** edits supported actions, saves a revision, validates it and runs that exact saved revision. Validation does not automatically execute commands.
- Fleet/map selection drives Details. Movement, Stop, Return and supported Intercept commands use existing authority rules. Return clears manual overrides; cancelled or skipped dependency chains are not replayed.
- An uncertain command keeps its original identity for recovery. Do not clear browser storage or operator databases as a troubleshooting shortcut.

## Reproducible 20v20

The [tracked fixture](../frontend/tests/fixtures/scenario-20v20.json) contains twenty supported Friendly and twenty Hostile Hornet 10 units, with three chained Move actions each. Hostile units are scripted observations, not interceptors. The reusable UI harness saves it through the scenario API and validates/runs it through the actual Conductor controls.

```powershell
npm --prefix frontend run build:performance
npm --prefix frontend run test:capacity
```

This uses an isolated runtime and database. It exercises moving entities, command uncertainty/retry, reconnect, restart, twenty supported outcomes, forty NON-OP entities, End, recorded inspection and mission isolation. See [test instructions](../frontend/tests/README.md) for a foreground manual demo or display measurements.

## Developer fixtures

Synthetic Alpha, Bravo, Tactical, Observations and Blank grid retain their existing fixture meanings. Fixture advancement is an explicit developer/API operation; UI telemetry does not advance them. Existing seeded records and operator recordings survive restart. Blank grid isolates application rendering overhead; it is not evidence of normal-provider performance.
