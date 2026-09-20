# Orchestrator implementation plan and baseline

20 September 2026. Clean starting tree at `83364f6`; the scenario-location implementation is committed and is the baseline. No application/test listener was present on inspected ports 8000/5180, 5391/8191 or 8011/5181/5182. Inventoried 554 tracked files and 437 existing database artifacts before editing. Verification uses new Edge contexts and one task-owned database per backend; operator storage is not opened.

## Observed baseline

Foreground Edge 153.0.4234.48, 1440 × 900 CSS px and 760/820/900 px checks, blank providers. The existing UI was operated to create three units, rename one, switch to Conductor and delete all three. Screenshots and the runner are temporarily in ignored `frontend/test-results/orchestrator-ui/orchestrator-baseline/` for final external archival.

- Units and Conductor already share one scenario client, but duplicate scenario context, save, validation and launch controls. Conductor's launch review repeats its footer actions.
- Units places document, map, location and boundary content ahead of the palette. The arrangement list has its own small scrollbar inside the panel scrollbar. Editing/deletion requires moving between the list and a long form.
- The palette renders profile text only, although all four profile silhouettes already exist in `unitGlyphs`. Affiliation geometry and colours already exist in `symbology`.
- Single-unit deletion refuses a unit with any authored actions. Actions cannot be deleted while another action depends on them. Bulk deletion will preserve these rules, report dependencies and refuse the entire invalid batch.
- Conductor edits draft actions during authoring and inspects committed execution during a run. Live command authority remains in Fleet and the session owner.
- The current workspace bridge does not persist/import a browser layout automatically. It accepts initial view IDs and exposes FlexLayout JSON. Compatibility will normalize legacy IDs and serialized layout input without inventing a general layout-persistence feature or clearing preferences.

Baseline task counts, from the active editor: add and rename a unit requires six interactions (category, profile, map click, row selection, label edit, Apply), plus scrolling; switching Units to Conductor requires one click; deleting three units requires six clicks (three selections, three deletes), plus scrolling between the list and editor. These are scripted interaction counts, not a user study or timing benchmark.

Final measurement clarification: those recorded six-action paths include unnecessary reselection. The supported direct add/rename path needs five actions; deleting all three needs five clicks if the first already-selected unit is not reselected. The [final verification](VERIFICATION.md) uses these corrected comparisons and retains the original capture rather than overstating improvement.

## Bounded design and work

1. One Orchestrator workspace entry, shared scenario name/revision/status and a single lifecycle area; internal keyboard-accessible Units/Conductor tabs. Preserve the existing scenario client and exact pending requests.
2. Keep placement and arrangement work prominent. Compact profile rows reuse existing silhouettes and affiliation symbols. Secondary location/boundary settings are clearly labelled disclosures that open automatically when their edit is active. Give each tab one main scrolling body, retained while switching.
3. Add coordinated draft multi-selection, filtering, scoped select-all, visible/hidden selection counts and an explicit deletion review. Preserve same-category group-movement eligibility and block deletion of scripted actors without partial changes.
4. Normalize old Units/Conductor entry points and serialized pane IDs deterministically, keeping one Orchestrator and the relevant internal tab. Preserve adjacent panes and camera ownership.
5. Verify actual foreground UI, 40 moving actors, layout/keyboard/zoom, uncertain save/retry, frozen runs, legacy entry/layout mapping and hidden-pane ownership. Run meaningful regressions and current static/contract/build checks.
6. Obtain up to three fresh independent critic rounds against final source and actual UI; fix material findings and document responses. Archive raw evidence outside the checkout, verify preservation and remove only task-owned disposable outputs.

Visual direction: Sentinel's existing dark surfaces and colours, crisp rectangular controls, consistent alignment, restrained borders and clear typography. No provider, simulation, contract, renderer-quality or general performance changes are planned. No commit or push.
