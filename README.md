# Sentinel v3

Sentinel is a local mission workspace for synthetic interactive scenarios, recorded operational inspection and supported external simulation batches. It combines Tactical and 3D maps, Fleet controls, scenario authoring, shared entity Details, Command Picture analytics and a Vertical Profile. It is a simulation/development application, not a deployed command system or a real video feed.

## Project Structure
```text
<FILL IN>
```

## Prerequisites

The verified Windows environment uses **PowerShell 7.6.5 (`pwsh`), Python 3.10.11, Node.js 24.20.0 and npm 11.19.0**. Run the commands below in `pwsh`, not Windows PowerShell 5.1: empty environment overrides behave differently there. These versions are the verified starting point; other platforms/version combinations are not certified here. Microsoft Edge is the configured browser for optional browser tests. Maps require a WebGL-capable browser.

Direct Python dependencies are pinned in [backend requirements](backend/requirements-dev.txt); Python transitive dependencies have no complete lockfile. Frontend resolution is pinned by the [npm lockfile](frontend/package-lock.json). Installation needs access to their package registries; the running application can use the provider-free setup below.

## Install

From PowerShell 7.6.5 (`pwsh`), with the repository already available:

```powershell
Set-Location C:/Archive/Coding/Sentinel3
$PSVersionTable.PSVersion
python --version
node --version
npm --version
if (-not (Test-Path backend/.venv/Scripts/python.exe)) {
    python -m venv backend/.venv
}
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
npm --prefix frontend ci
if (-not (Test-Path frontend/.env.local)) {
    Copy-Item frontend/.env.example frontend/.env.local
}
```

Keep existing environment files, recordings and browser storage. `.env.local` is local configuration: `VITE_*` values are public browser configuration, **not a place for private secrets**. Restrict provider keys to the intended origins/assets. See [provider configuration](docs/MAP_SERVICES_SETUP.md).

## Start

In a backend terminal, from the repository root:

```powershell
$env:SENTINEL_DEMO = '1'
$env:SENTINEL_FIXTURES = '1'
backend/.venv/Scripts/python.exe -m uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000
```

`SENTINEL_DEMO=1` enables local interactive controls; `SENTINEL_FIXTURES=1` optionally seeds labelled synthetic missions without replacing existing records. The database defaults to `backend/data/sentinel.sqlite3`. Set `SENTINEL_DB_PATH` to a separate absolute path **before startup** for a separate dataset. Run one backend process/worker per database. API documentation is at <http://127.0.0.1:8000/docs>.

In a second terminal, start the frontend with explicit provider-free overrides:

Do:
```powershell
npm run dev
```

If it doesn't load, do:
```powershell
Set-Location C:/Archive/Coding/Sentinel3
$env:VITE_TACTICAL_PROVIDER = 'maptiler'
$env:VITE_TACTICAL_STYLE_URL = 'https://api.maptiler.com/maps/streets-v4/style.json'
$env:VITE_MAPTILER_KEY = ''
$env:VITE_CESIUM_ION_TOKEN = ''
$env:VITE_GOOGLE_MAPS_API_KEY = ''
$env:VITE_CESIUM_PHOTOREALISTIC_ASSET_ID = '0'
npm --prefix frontend run dev
```

Open **<http://127.0.0.1:5180>**. The empty MapTiler key deliberately selects the labelled grid fallback without requesting the hosted style; ordinary 3D has no provider imagery/terrain. This mode still supports local scenarios, selection and analytics. It does not demonstrate configured-provider rendering. `/api` and its WebSocket are proxied to port 8000; `SENTINEL_API_TARGET` overrides that target when needed.

The environment template instead defaults to the optional regional map pack. For local geographic tiles or configured hosted/3D/Video providers, follow [map setup](docs/MAP_REFINEMENT_SETUP.md) and start a new terminal without the overrides above. Installing the optional pack downloads data; it is not part of this provider-free quick start. Changes to `VITE_*` configuration require restarting development or rebuilding production output.

To shut down, use **End** first only if the active interactive run should become an ended recording, then press **Ctrl+C** in both terminals. **Stop** stops supported unit activity; it does not stop the services. Restart recovery preserves recorded positions but interrupts unfinished execution and requires explicit control/recovery; it does not silently resume scripts. Never start a second writer to inspect a live operator database.

## Use the workspace

- **New demo** creates a local interactive run. **Load mission** opens saved scenarios, earlier demos, other recordings or developer fixtures. An ended recording permits inspection, not command dispatch.
- **Orchestrator → Units / Conductor** arranges units and supported actions. Save, Validate and Run use one draft and the exact saved revision. Use the mission controls for Pause/Resume and End; use Fleet for eligible movement, Stop, Return and Intercept actions.
- **Views** opens dockable maps, Details and other panes. Selecting an entity in a map, list or analytic table shares the selection with Details. Map cameras remain independent. Use F6 to move between a pane and its tab; see the [runbook](docs/demo-runbook.md) for selection and recovery workflows.
- **Command Picture** offers Overview (presence/freshness), Resources (explicit management/availability), Recorded activity (requests/events), Statistics (recorded counts and observed telemetry), Comparison (up to four selected entities) and Vertical profile. Audit/statistics use an explicit UTC range and pinned recording cutoff; they do not seek mission time.
- **Views → Vertical Profile**, or **Open profile to side** inside Command Picture, plots altitude against radial horizontal distance from a declared mission reference or fixed captured entity position. Select a native altitude datum and optionally inspect bounded observed history. This is not terrain clearance or a predicted path.
- **Views → Simulation** accepts the supported external JSON contract, including the labelled golden example. Submit START, inspect the acknowledgement/results, then **Inspect mapped mission**. HOLD/ABORT and supplied RESUME batches follow the external lifecycle. **Load recorded commands** inspects earlier results. Retry an uncertain request using **Retry exact pending command**; do not replace its identity/body. External runs do not join the interactive executor. See the [external guide](docs/phase5-simulation-compatibility/README.md).

## Verify

From the repository root, with dependencies installed:

```powershell
backend/.venv/Scripts/python.exe -m pytest -c backend/pyproject.toml backend/tests
backend/.venv/Scripts/python.exe scripts/export_contracts.py --check
backend/.venv/Scripts/python.exe scripts/verify_phase0.py
backend/.venv/Scripts/python.exe scripts/check_repository.py
npm --prefix frontend test -- --maxWorkers=2
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run format:check
npm --prefix frontend run contracts:check
npm --prefix frontend run contracts:foundation:check
npm --prefix frontend run build
npm --prefix frontend run build:test
npm --prefix frontend run test:browser
```

`build` writes `frontend/dist`; `npm --prefix frontend run preview` serves it at <http://127.0.0.1:5181> with the backend running. `test:browser` requires installed Microsoft Edge and owns ports 8011/5181/5182, fresh contexts and disposable databases; stop preview first. Test builds force provider-free configuration. See [testing](frontend/tests/README.md) for isolated output suffixes and full result interpretation.

The [documentation verification ledger](docs/maintenance/documentation-2026-09-21.md) distinguishes commands executed for this update from installation instructions and the earlier cleanup's full regression results. Prose changes do not constitute a new application regression certificate.

## Current limits and further reading

This is a loopback, single-authority application without deployment user authentication. Do not expose it as a multi-user service without additional controls. Supported scenario authoring permits 40 units, at most 32 controlled actors. External compatibility remains provisional: valid mixed-scale geometry can fail, and large batches can block source responsiveness. Combined Profiles have an open frame-pacing finding; inherited strict-display and configured-Video gates remain open. Video is a simulated viewpoint. Timeline playback, operational pop-outs, sensor-confidence/coverage and predictive risk are not implemented capabilities.

See the [architecture and review ledger](docs/architecture.md), [documentation index](docs/README.md), [analytic definitions](docs/phase6-command-picture/METRICS.md) and [current Phase 6 delivery boundaries](docs/phase6-command-picture/DELIVERY.md).
