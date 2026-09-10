# Phase 1 review — application shell and tabs

Completed for review on 2026-09-10. Scope is Phase 1 only. Both source specifications, the implementation plan, Phase 0 contracts, backend drafts and docking experiment are unchanged. The existing 43 Phase 0 checks passed before implementation and again at handoff.

## Delivered

The product package is `frontend/`, separate from `frontend/experiments/docking`. It provides a compact desktop header, Activity Bar, Views list, status bar, semantic theme tokens, accessible menus/keyboard help and six labelled placeholders: Tactical Map, 3D View, Command Picture, Vertical Profile, Timeline and Entity Inspector. Workspace controls operate; no controls imply mission, simulation, map, analytical or replay functionality is available.

The bridge owns one FlexLayout model. Its private Zustand store publishes only derived workspace metadata. Views, menu actions, native tab drag operations and divider changes all use this model. The pane host publishes visibility/resize/disposal hooks and releases observers and pending animation frames. No operational stores or renderer resources were added. [Module ownership and run instructions](../frontend/README.md) describe the exact boundary to the foundation contracts.

| Phase 1 acceptance / follow-up | Result |
| --- | --- |
| Shell, semantic tokens, working tabs and inspector placeholder | Met. Initial Tactical/Command tabs; all six views open, close and reopen. |
| Activity Bar and Views open/focus peers without page reload | Met. Singleton identities, selected content and keyboard focus checked; zero subsequent document navigations in the navigation test. |
| One layout authority and pane lifecycle | Met. Bridge unit tests and browser lifecycle evidence; no competing layout tree or operational data in workspace metadata. |
| Drag reordering and Open to Side | Met. Actual pointer drag changed tab order; menu action created a second pane; pointer and keyboard divider resize verified. |
| Shared context under high-frequency updates | Met for the isolated probe. Nominal 100 Hz updates, roughly 98 updates/second observed. Selection and latest numeric time agreed in both visible panes and when returning to a hidden tab. Workspace revision remained stable during updates with no layout interaction. |
| Native pop-out close, return and reopen | Met for the bounded harness. Native close → in-page float → explicit Return to workspace; a second pop-out/redock cycle passed. No duplicate tab or empty auxiliary layout remained. Child selection changes reached the main window's test context. |
| Keyboard navigation and visible focus | Met for exercised flows: Tab entry, Activity Bar arrows, tab arrows and activation, F6 both directions, Ctrl+Delete, menu selection, dialog Escape/focus restoration, divider arrows and reopening. |
| Desktop layouts | Met in browser viewports: 2560×1440, 3840×2160 and 1920×1080; additional interaction/development checks at 1440×900. Two-pane screenshots reviewed; no page overflow. Physical display ergonomics are not certified. |
| TypeScript, focused tests and production build | Met. Results below. |

**Phase 1 acceptance criteria are met within the tested scope. Stop for review; Phase 2 has not started.**

## Verification evidence

- **5/5 focused unit tests:** singleton opening/focus, recovery after removing all tabs, side placement, native model changes updating metadata, product pop-out disabled and bridge subscription disposal.
- **7/7 production browser scenarios:** [machine-readable results](phase1-evidence/browser-results.json), [test environment](phase1-evidence/environment.json), [test source](../frontend/tests/browser/workspace.spec.ts).
- The browser runner captured no page exceptions, console errors/warnings or failed HTTP responses in the tested main-page flows. The first auxiliary window also captured no page exceptions. The [development/boundary smoke report](phase1-evidence/development-and-boundaries.json) separately checks development diagnostics, product test-marker exclusion and excluded product dependencies.
- **Automated accessibility:** all three tested desktop layouts recorded 23 passing checks, no violations and no incomplete checks for the selected WCAG A/AA rule tags. [1440p](phase1-evidence/accessibility-1440p.json), [4K](phase1-evidence/accessibility-4k.json), [1080p](phase1-evidence/accessibility-desktop-1080.json). This is not a full accessibility or screen-reader certification.
- [Synthetic update measurements and lifecycle events](phase1-evidence/update-probe.json); [pop-out lifecycle/context evidence](phase1-evidence/popout-probe.json). These are test data, not telemetry or replay.
- TypeScript, ESLint and Prettier checks passed. Normal and verification Vite builds passed without build warnings. The normal build has approximately 108 kB application code, 189 kB docking engine and 219 kB React runtime (minified; roughly 152 kB total JavaScript gzip), plus 38 kB CSS. Cached engine/runtime chunks use Vite's [documented Rolldown splitting configuration](https://rolldown.rs/reference/OutputOptions.codeSplitting); this changes cache boundaries, not total functionality.
- The dependency tree resolves without peer conflicts. npm installation reported zero vulnerabilities. Both source-document hashes and the complete existing Phase 0 boundary/fixture checks still pass. No tracked pre-existing implementation files were changed apart from adding build/report exclusions to `.gitignore`.

Visual evidence: [1440p split shell](phase1-evidence/shell-1440p.png), [4K split shell](phase1-evidence/shell-4k.png), [keyboard focus](phase1-evidence/keyboard-focus.png), [native-close floating return](phase1-evidence/popout-return-float.png), [development shell](phase1-evidence/development-smoke.png).

## Findings resolved during verification

1. FlexLayout's React portal content did not reliably bubble F6 to its DOM tabpanel handler. The pane host handles the content-to-tab direction; the library handles tab-to-content. Both directions are tested. Native tab semantics and keyboard activation remain library-owned.
2. Disabling tabset close also prevents FlexLayout 0.10.8 from deleting empty tabsets. This initially left empty floats/windows after return. Enabling close and delete-when-empty fixed cleanup; the bridge finds a valid current main tabset instead of storing an obsolete parent ID.
3. Radix's menu-close focus restoration could supersede a view-open command. After a chosen workspace command, the menu explicitly hands focus to the resulting view. Dismissing a menu normally retains Radix's trigger-focus behaviour.
4. The published FlexLayout theme references a missing CSS source map. A narrow Vite transform removes only that unresolved comment. Vendor code is unmodified. Its offscreen measurement text is hidden from the accessibility tree without changing its measurement dimensions. Solid semantic backgrounds allow the automated contrast checks to finish.

## Versions and deliberate limits

Runtime: **FlexLayout 0.10.8**, React/React DOM 19.3.0, Zustand 5.0.15, Radix Dropdown Menu 2.1.24/Dialog 1.1.23, Lucide 1.44.0. Toolchain: Vite 8.3.0, TypeScript **6.0.3**, Tailwind/Vite plugin 4.3.3, Vitest 5.0.0, Playwright 1.63.0. Full exact dependencies are locked in `frontend/package-lock.json`.

TypeScript differs from the isolated Phase 0 experiment's 7.0.2 because typescript-eslint 8.70.0 supports TypeScript below 6.1. The product uses a supported combination rather than forcing peer dependencies. The selected FlexLayout version is unchanged. Tests ran with Node 24.20.0 and headless Microsoft Edge 152.0.4191.66 on the existing Windows machine. Node's test-runner colour-environment warning (`NO_COLOR`/`FORCE_COLOR`) is cosmetic and separate from browser/build diagnostics.

The shell does not persist its layout over refresh. Open to Side is a no-op when moving the sole tab beside its own sole tabset; it focuses that existing view. Pop-out entry controls are available only in the separate verification harness. Return redocks to a valid active/first main tabset, not necessarily the original geometry. The main window remains the test-context owner; opener loss, background timer throttling, popup-blocker policies, other browsers, screen readers, OS display scaling and physical multi-monitor use require later validation. The synthetic update rate is not an FPS, latency, map-rendering or telemetry-throughput guarantee.

No backend services, authoritative world publication, domain validation, entity-selection stores, simulation adapter implementation, MapLibre/Cesium resources, real analytics, replay, provider integrations or ECharts were implemented. Immutable publication/domain validation remain Phase 2. Full pop-out/real-view integration remains Phase 8. Provider, datum, account, spending and hardware choices remain in [the demo runbook](demo-runbook.md); organiser questions remain in [the compatibility register](../contracts/simulation/compatibility-decisions.md). None was treated as resolved by this shell work.
