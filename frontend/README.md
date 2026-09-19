# Sentinel frontend

React/TypeScript with Vite, FlexLayout, MapLibre and Cesium. Run `npm ci` and `npm run dev` from this directory after starting the backend; see the [root setup guide](../README.md).

| Command | Purpose |
|---|---|
| `npm run dev` | Development server on port 5180; API proxy defaults to port 8000 |
| `npm run build` / `npm run preview` | Complete distributable bundle / local preview on port 5181 |
| `npm run build:test` | Credential-free product and verification bundles sharing public assets |
| `npm run test:browser` | Isolated backend and previews, browser regressions and owned-demo cleanup |
| `npm test -- --maxWorkers=2` | Unit tests |
| `npm run typecheck` / `npm run lint` / `npm run format:check` | Static checks |
| `npm run contracts:generate` / `npm run contracts:check` | Current v1.13 frontend contracts |
| `npm run contracts:foundation:check` | Frozen foundation types, without the archived experiment |
| `npm run build:performance` | Bounded verification bundle for foreground performance tools |

`SENTINEL_API_TARGET` changes the backend proxy. Provider values are compiled from `.env.local`; preserve local values and rebuild after changes. [Map configuration](../docs/MAP_REFINEMENT_SETUP.md) covers the optional regional pack and existing hosted routes.

## Runtime ownership

One session runtime owns transport, mission state, command identities, renewal, selection and the shared bounded presentation clock. Panes read that runtime; renderers do not create backend subscriptions. Hidden panes suspend live subscriptions and motion work. The renderer pool owns creation, retention and disposal, while pane-local cameras remain independent.

Fleet and Details share selection. Selection opens Details; telemetry does not repeatedly reopen it. Authoring categories expand a profile list before placement is armed. Saved revisions, validation and Conductor Run use the ordinary API workflow. Movement, Stop, Return, Intercept eligibility, outcomes and NON-OP state remain backend-authoritative.

Tactical and ordinary 3D preserve pane identity when changing projection. Video uses a supplied simulated viewpoint and simulated entity overlays, including existing altitude semantics. Presentation does not extrapolate through stale data or move entities to hide scene intersections.

## Source and assets

`src/features/` contains panes; `src/services/`, `src/state/` and `src/world/` implement shared transport/state/presentation; `src/renderers/` owns SDK integration. Dynamic renderer imports and workers are required parts of the build.

`tests/unit`, `tests/browser`, `tests/performance`, `tests/support` and `tests/fixtures` separate reusable checks from generated results. [Test instructions](tests/README.md) identify active entry points. Raw results do not belong in documentation.

Production bundles include Cesium workers/assets and configured public assets. Deploy the complete bundle with PMTiles byte-range support, attribution/notices and a same-origin API/WebSocket proxy. A verification bundle that shares this checkout's public directory is not a standalone deployment artifact.

The superseded Golden Layout/FlexLayout comparison is in the [external archive](../docs/ARCHIVE.md). No experiment dependency is needed to build or test this application.
