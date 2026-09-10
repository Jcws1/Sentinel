# Sentinel v3 workbench — Phase 1

This package is the application shell. Every operational view is explicitly a placeholder. There are no mission services, operational stores, simulation logic, map renderers, analytics or replay here.

## Run

Use Node 24 (verified with 24.20.0) and npm. In this directory:

```powershell
npm ci
npm run dev
```

Open <http://127.0.0.1:5180>. Navigation opens or focuses one instance of each registered view. Use a view's options menu to open it to the side. Drag tabs to reorder or arrange panes; drag or keyboard-focus a divider to resize it. Close a tab and reopen it from the Activity Bar or Views list. The keyboard button documents supported shortcuts.

The initial workspace has Tactical Map and Command Picture tabs. Layout changes are in memory; refreshing returns to the initial workspace. This is a desktop shell with a minimum width of 760 CSS pixels, targeting 1440p/4K displays. Browser/OS scaling remains available; mobile layouts are outside this phase.

## Boundaries

| Module | Responsibility |
| --- | --- |
| `src/app/App.tsx` | Compact identity header, module Activity Bar, Views list, menus, keyboard help, status bar. Local sidebar/dialog state is UI-only. |
| `src/app/WallClock.tsx` | Isolated, current UTC+8 wall clock. Never advances domain or replay time. |
| `src/app/moduleRegistry.ts` | All nine requested modules; Map, Command Picture and Timeline open shell views. Other modules explicitly unavailable. |
| `src/features/workspace/viewRegistry.ts` | Six stable placeholder identities and their presentation metadata. No fake mission or entity IDs. |
| `src/features/workspace/workspaceBridge.ts` | The single FlexLayout `Model`, open/focus/close/open-to-side actions, and bounded test pop-out/redock commands. |
| `src/state/workspaceStore.ts` | Private Zustand store of metadata derived from that model: open views, location, selected tab in each pane, active main-window view, revision. It contains no second layout tree. Only the bridge writes it. |
| `src/features/workspace/WorkspaceHost.tsx` | FlexLayout binding. Native drag/keyboard actions update the same model and its change listener. |
| `src/features/workspace/PaneHost.tsx` | Labelled placeholders and runtime mount/visibility/resize/disposal callbacks. DOM observation and animation frames are released on unmount. |
| `src/styles/index.css` | Semantic surfaces, text, borders, accent, focus and status tokens; desktop layout and library theme overrides. |

The [Phase 0 session/view contracts](../contracts/sentinel/session-view.ts) remain drafts. Phase 1 deliberately does not instantiate `SessionState`, `OperationalCache`, `PresentationState`, or a persisted `WorkspaceState` requiring a session ID. Its minimal workspace metadata is a shell projection. Later persistence should serialize the bridge's model at a save boundary, never maintain a second independently writable layout tree. `selectedInPane` is tab selection, not entity selection or proof of renderer visibility. Actual pane visibility comes from lifecycle callbacks.

Future renderer resources belong in the mounted view's runtime, outside Zustand and layout JSON. `PaneLifecycleEvent` reports initial visibility, later visibility changes, coalesced size changes (including zero sizes), mount and disposal. A renderer must wait for positive dimensions before allocating size-dependent resources. Auxiliary-window remounts use the host's owning window for observations and animation frames. Operational state must survive those remounts through the future session layer.

## Verification

```powershell
npm run typecheck
npm run lint
npm run format:check
npm test
npm run build
npm run build:verification
npm run test:browser
```

Browser tests use installed Microsoft Edge, start production previews on ports 5181 and 5182, and stop those previews afterwards. No browser download is needed on the tested Windows host. The probes run against production bundles, not a mock layout. Tests write current review evidence under `../docs/ui-refinement/verification` (the original Phase 1 evidence is retained); failed-run traces stay in ignored `test-results`.

The **isolated** `tests/harness` entry owns a synthetic selection string, numeric time and a nominal 100 Hz counter. It imports the product shell but is excluded from normal `dist`. It neither implements operational stores nor connects to a backend. To inspect it manually, build verification and run `npm run preview:verification`, then open <http://127.0.0.1:5182/tests/harness/index.html>. Start/stop the update probe through `window.__workspaceTest.start()` / `.stop()` in that test page only.

The earlier `experiments/docking` package retains its own manifests, lockfile, two-library comparison and ECharts evidence. It is not an npm workspace, product dependency, TypeScript input or build entry. Run its commands from its own directory. This product uses FlexLayout 0.10.8 only; it does not depend on Golden Layout or ECharts.

## Bounded pop-out policy

Product pop-out controls are disabled. The verification harness alone opts in; `public/popout.html` is its inert, same-origin host document. The main window owns the model and synthetic context. A native child close runs `beforeunload`, and FlexLayout returns the view to an in-page floating panel. **Return to workspace** moves that view into the active main tabset, or the first/empty main tabset if its previous parent no longer exists. It selects/focuses the tab and removes the empty auxiliary layout. The same action works from the child window, and the view can be popped out again without duplication.

Returning does not promise the original tab index or split geometry. Closing the view's tab instead of its OS window closes the view; it can be reopened from navigation. Tabs keep stable IDs. Empty tabsets must have both `enableClose` and `enableDeleteWhenEmpty` enabled, otherwise FlexLayout 0.10.8 retains empty auxiliary panels/windows. Full independent-window lifecycles, opener loss, physical displays and real renderer resources remain Phase 8.

See [Phase 1 review and evidence](../docs/phase1-review.md) for acceptance status and limitations.


## Visual refinement

The header contains only the supplied Sentinel logo, Sentinel v3 and the current time explicitly labelled UTC+8. The clock is a copyable wall-time value; it does not imply a loaded mission or backend connection. All nine requested application modules appear in the Activity Bar. Unimplemented modules are disabled and marked N/A, with a hover explanation. Map, Command Picture and Timeline open/focus existing placeholder views. The Views list retains access to all six shell views, including 3D, Vertical Profile and Entity Inspector; its VIEW ONLY label and each pane's NOT IMPLEMENTED notice make the boundary explicit. The sidebar can be hidden without losing tabs or split arrangement.

Chrome uses neutral selection washes, neutral edge indicators, compact rectangular controls and a near-black surface with a slight blue undertone. No saturated colour, operational counters, charts or map content were added. Ordinary workspace surfaces are opaque. The original supplied logo is copied as an asset, with CSS compositing in the header, not redrawn. Navigation and controls prevent text selection; genuine values remain selectable. Colour, font and spacing tokens remain in the single stylesheet.

Current visual review records and independent critique screenshots are under `docs/ui-refinement/` at repository root. Shell approval does not certify unfinished operational features. Source specifications, domain contracts, backend drafts and the single FlexLayout authority are unchanged.
