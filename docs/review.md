Good news — a lot of this is **documented**, including the rejected alternatives. I'll mark what's recorded versus what's my inference, so you don't accidentally present my reading as the project's stated reasoning.

# Part 1 — The stack, with rationale

## Backend

| Library | Ver | Role | Why chosen |
|---|---|---|---|
| **FastAPI** | 0.141.1 | HTTP + WS routing | Async-native, and its Pydantic integration means request validation and OpenAPI generation come from the same models. *Inferred.* |
| **Pydantic** | 2.13.5 | Domain models **and** schema authority | The load-bearing choice. Models are the single source of truth — JSON Schema and OpenAPI are *generated* from them, then TypeScript from that. One definition, three consumers, no drift. *Documented* — [IMPLEMENTATION_PLAN §4](docs/IMPLEMENTATION_PLAN.md). |
| **Uvicorn** | 0.52.4 | ASGI server | Standard FastAPI pairing. Single worker is deliberate, not a limitation — see invariant 5 below. |
| **websockets** | 16.1.1 | WS transport | Server-to-client only. |
| **sqlite3** | stdlib | Persistence | *Documented*: "Use SQLite transactions for the hackathon, with one authoritative backend process and serialized per-mission command processing." ([IMPLEMENTATION_PLAN:449](docs/IMPLEMENTATION_PLAN.md)) One file, real ACID transactions, no service to run. |

**The pitch line:** four runtime dependencies, no ORM. Every transaction boundary is visible in the source rather than hidden behind a framework.

## Frontend runtime

| Library | Ver | Role | Why chosen |
|---|---|---|---|
| **React** | 19.3.0 | UI | — |
| **Zustand** | 5.0.15 | State | *Documented*: "Use Zustand vanilla stores… **no Redux**." Vanilla stores work outside React, so the runtime can own transport without a provider tree. *(inference on the second half)* |
| **FlexLayout React** | 0.10.8 | Docking workspace | **Won a documented evaluation against Golden Layout v2** in a Phase 0 spike. Deciding factor: FlexLayout is React-focused and "the same session/store can feed the POC without a synchronization protocol," whereas Golden Layout's child windows each need their own runtime and a parent-coordinated state channel. *Documented* — [IMPLEMENTATION_PLAN §8](docs/IMPLEMENTATION_PLAN.md). |
| **MapLibre GL** | 6.9.0 | Tactical 2D | *Documented*: MapLibre and Cesium are retained together "because they solve different operator problems" — MapLibre for tactical symbology, track history, 2D zones, concise labels. Batched GeoJSON sources with stable feature IDs, explicitly *not* one DOM marker per track. |
| **Cesium** | 1.145.0 | 3D globe + cockpit | The other half of that split: 3D entities, trajectories, volumes, physical altitude. |
| **PMTiles** | 4.5.0 | Offline tile format | Single-file tile archives — the app runs with no tile server and no network. Supports invariant 12. |
| **ECharts** | 6.0.0 | All charts | *Documented*: "Using one strong charting system is preferable to introducing separate libraries for every analytic view," and reused from the Phase 0 spike — "no second chart library is introduced." |
| **TanStack Table** | 8.21.3 | Fleet/Tracks tables | Headless — it does sorting/filtering logic and you own the markup, so tables inherit the app's styling and accessibility rather than fighting a component library. *Documented* as the Phase 3B choice. |
| **Radix UI** | dialog, dropdown | Accessible primitives | Focus trapping and keyboard semantics are genuinely hard. Only two primitives are used — targeted, not a design system. |
| **Lucide** | 1.44.0 | Icons | *Documented*: UI icons are kept **separate from operational affiliation symbology**. That separation is deliberate — mixing them would put presentation concerns into the domain model. |
| **AJV** | 8.20.0 | Runtime validation | Closes the contract loop. Types are compile-time only; AJV enforces the same schema at runtime, plus identity and reference checks. |

## Build and test

| Tool | Ver | Why |
|---|---|---|
| **Vite** | 8.3.0 | Fast HMR; the `/api` proxy config is where the dev/prod port story lives |
| **TypeScript** | 6.0.3 | — |
| **Vitest** | 5.0.0 | Shares Vite's transform pipeline, so `src/world/`'s pure modules test without a separate build |
| **Playwright** | 1.63.0 | Real browser, real WebGL — you cannot verify map rendering in jsdom |
| **@axe-core/playwright** | 4.13.0 | Automated accessibility assertions in the browser suite |
| **json-schema-to-typescript** | 16.0.0 | The codegen step that makes contracts single-source |
| **Tailwind** | 4.3.3 | *Documented*: "semantic CSS tokens with Tailwind" — tokens first, utilities second |

## What was deliberately **not** used

This is the most reviewer-valuable item on the page, and it's documented verbatim in [IMPLEMENTATION_PLAN:105](docs/IMPLEMENTATION_PLAN.md):

> "No custom docking engine, Redux, TanStack Query, deck.gl, plugin runtime or generic event bus is needed."

Plus **Golden Layout**, rejected after a real spike rather than on preference.

Being able to say "here's what we rejected and why" is worth more in review than any individual choice you made.

## External providers — all optional

| Provider | For | Required |
|---|---|---|
| MapTiler | Hosted 2D styles | No — empty key gives a labelled grid |
| Cesium ion | Imagery, terrain, OSM buildings | No |
| Google | Photorealistic 3D tiles | No |
| Local PMTiles pack | Protomaps / ESA WorldCover / Mapterhorn DEM | No |

---

# Part 2 — Architecture decisions

[Sentinel_v3.md §3](docs/Sentinel_v3.md) states **13 architecture invariants** explicitly. That's your rationale document — these were written as rules, not reconstructed afterwards. Here are the ones worth explaining, grouped:

## Backend is sole authority

> *Invariants 1, 5, 13: Sentinel owns operational state, the backend is authoritative, the browser visualises and requests.*

**Problem:** with multiple writers you need distributed ordering, conflict resolution and consensus. For a workspace where a recording must be defensible, that's a large amount of machinery.

**Decision:** one process, one writer per mission, commit before publish.

**Tradeoff — state it yourself:** synchronous work blocks peers. That's exactly why the large external batch commit is an open finding. The design bought ordering simplicity and paid for it in head-of-line blocking.

## Renderers are projections, not mission systems

> *Invariants 2, 3: MapLibre and Cesium render the same world; switching views preserves context.*

**Problem:** the obvious implementation gives each renderer its own track store, and they drift — the 2D map and the 3D view disagree about where something is.

**Decision:** one world state, two projections. §9.1 lists what must *not* exist: a separate Cesium mission, a separate MapLibre mission, duplicate track stores, renderer-owned mission state.

**Consequence you can point at:** cameras are independent, but selection and world data are shared. `renderers/scene.ts` derives from the shared presentation and nothing else.

## Simulation schemas must not leak into core

> *Invariant 4.*

**Problem:** the natural shortcut is to put external drone fields directly on your Entity model. Then the external contract owns your domain, and every change upstream touches everything.

**Decision:** raw external types stay inside `adapters/simulation_v1/`. Generic Entities carry generic fields; external specifics live in a typed `sentinel.simulation.v1` extension namespace.

**Why it matters:** this is what makes a second adapter — MAVLink, say — an additive change rather than a refactor.

## Generic domain, specific features on top

> *Invariants 8, 9: features sit on generic entities/tracks/assets/zones; "the hackathon implementation is counter-UAS-specific; the architecture is not."*

That invariant 9 is a good line to quote directly. It's precise about what's domain-specific and what isn't.

**A refinement to what I said last time:** your spec does name the "C2 Operator / Operations Lead" as the primary user ([§5.1](docs/Sentinel_v3.md)), so the counter-UAS framing is your own documented product definition — I was working from the README alone. The distinction that still holds is *simulation of that workspace* versus *deployed system*. Lead with the domain framing; just don't let it imply deployment.

## Time is first-class

> *Invariant 11: the same views support current-state operation and replay.*

This is why there are three clocks rather than one timestamp field. It's also why `presentation.ts` selects one whole frame and never mixes moments — a view built that way works identically on live and historical data.

## Providers are replaceable

> *Invariant 12.*

Concretely: the app runs fully provider-free, test builds force it, and MapTiler credentials propagate only to one approved hostname. No vendor is load-bearing.

## Implementation decisions worth explaining

From the [architecture.md §11 ledger](docs/architecture.md) — note it distinguishes implemented decisions from *inferred* rationale, which is a discipline worth preserving when you present it:

| Decision | Problem it solves | Tradeoff |
|---|---|---|
| **Exact command identity** | A lost HTTP response can't safely be replaced with new intent | Clients must persist pending identities |
| **Frozen scenario revisions** | Editing a draft must not mutate a running mission | Run refers to a revision, not "current" |
| **Lossless recording envelope** | Repeated full frames consumed storage | Old binaries must refuse newer storage versions |
| **Cooperative saved analysis** | Cold analysis must yield to live ticks | Cold total time stays high |
| **Native datum grouping** | No authoritative cross-datum conversion exists | Honest exclusions over a misleading common axis |
| **Audit read from existing receipts** | Avoids a parallel event store | Bounded results still do broad SQL work |

---

**How to use this in conversation:** when asked "why X," answer with the *problem*, then the choice, then the cost. "We chose FlexLayout because Golden Layout's pop-outs would each need their own runtime and a state-sync protocol, and we didn't need independent windows" is a far better answer than "FlexLayout is good for React." You have a spike documenting exactly that.