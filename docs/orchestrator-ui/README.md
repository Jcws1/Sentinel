# Orchestrator workspace

Orchestrator replaces the separate Units and Conductor workspace entries. Its internal **Units** and **Conductor** tabs share one scenario client, draft, selected authoring map and Save/Validate/Run area. The surrounding Fleet, Details, Tactical, 3D and Video Feed views retain their roles.

## Authoring

1. Open **Orchestrator → Open scenario editor**, or load a saved plan from Missions. The header identifies the scenario, saved revision and unapplied/unsaved state.
2. Use **Units → Add units**. Expand **Friendly** or **Hostile**, choose a profile, then place on the selected authoring map or enter coordinates. The palette and arrangement use the existing affiliation symbols and vehicle silhouettes. Unknown entities retain their existing observation-only workflow.
3. Select a placed unit to edit its label, role or supplied pose. Apply or discard the edit before saving. Location and boundaries are in a labelled disclosure; the header's **Location** shortcut opens the explicit origin editor. Existing ±5 km square, coordinate support and height semantics are unchanged.
4. Switch to **Conductor** to add existing supported movement actions. A new action initially uses the selected eligible actor. Internal tabs retain form edits, selection, filters and scroll position; map picking is disarmed when its tab is hidden. Same-category eligibility still governs batch movement, even though arrangement selection may span affiliations.
5. **Save** writes through the existing expected-revision/idempotency path. **Validate** reviews the exact saved revision. **Run rN** creates a mission from that revision and retains the existing active-run restrictions. Validation does not start a run. Use the review's Back button or an internal tab to return to editing.

**Scenario file & authoring map** contains New scenario, Save as new, Load latest and map ownership. Loading/replacing an unsaved draft requires the existing explicit replacement choice. Save uncertainty keeps the exact body and request identity; Check save/Retry saved request reconcile it before dependent editing. Closing the pane does not discard the shared draft or pending work.

Conductor shows committed schedule execution when inspecting a running or ended mission. Its authoring controls edit only a draft. Live entity commands remain in Fleet. Opening an authoring draft alongside a running/paused mission leaves that mission's snapshot, geometry and recordings intact.

## Selection and deletion

- Click an arrangement row to select one unit and focus its editor below the list. Checkboxes, Space, or Ctrl/Meta/Shift-click change membership without opening an editor or moving the list. **Edit selected** opens the editor for a single checked unit. Shift-click is additive, not a range operation.
- **Select all shown (N)** adds the currently filtered rows to the selection. **Clear selection** clears the entire draft selection. Search and affiliation filters do not silently drop selected units; the count reports how many are hidden.
- **Delete selected (N)** reviews every selected unit, including hidden selections. Single-unit Delete uses the same review. Escape/Keep units cancels and returns focus to the trigger.
- Deletion is atomic and draft-only. If any selected unit has scripted actions, the entire operation is blocked and the referencing actions are listed. Resolve them explicitly in Conductor first; actions with dependent successors cannot be deleted before those successors. There is no automatic cascade, position change, live deletion or partial success.
- A review is tied to its draft snapshot. Replacing/changing the draft invalidates it. Pending saves and unapplied unit/action/origin/boundary work block deletion. Saving a deletion creates another immutable revision.

## Design and compatibility

The layout uses Sentinel's dark surfaces, existing typography and semantic colours, compact rectangular controls, aligned profile rows and restrained dividers. Shared context and lifecycle controls sit outside the two tab bodies. Each tab has one main scrolling body; secondary file/map controls use a bounded disclosure. Important status and selection distinctions have text and accessible names as well as colour.

Legacy `units` and `conductor` navigation calls map to one `orchestrator` pane and the corresponding internal tab. Initial view lists and supplied FlexLayout JSON normalize deterministically: prefer a selected legacy pane in the active tabset, then any selected authoring pane, then traversal order. Retain that pane's placement and adjacent data, remove duplicate authoring panes, and store the internal tab in its config. Input JSON is not mutated. Closed borders and unrelated empty tabsets retain their state.

The baseline does **not** automatically save/restore browser workspace layouts. This change supports the bridge's initial-layout boundary and aliases; it does not invent a new persistence service or clear saved preferences. Draft/request persistence remains in its existing owner. No schema, wire contract, database migration, historical reader, provider or simulation rule changes are required.

See [plan and baseline](PLAN.md), [verification](VERIFICATION.md) and the critic reports in this directory. Historical location/performance reports certify their recorded source states, not this change. This task makes no new FPS claim.
