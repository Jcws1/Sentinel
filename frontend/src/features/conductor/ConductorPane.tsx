import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Copy,
  Crosshair,
  Pencil,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { useOperationalRuntime } from '../../app/OperationalContext';
import { orderedActions } from '../../services/scenarioClient';
import type { ScheduledAction } from '../../contracts/generated';
import {
  actionTime,
  actionLegNumbers,
  scriptPlan,
} from '../../world/scriptPlan';
import { actionPreviewRows } from '../../world/scriptAuthoring';
import { ScenarioRunReview } from './ScenarioRunReview';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import { viewKind, type ViewId } from '../workspace/viewRegistry';
import '../units/units.css';
import './conductor.css';

export function ConductorPane({
  bridge,
  visible,
}: {
  bridge: WorkspaceBridge;
  visible: boolean;
}) {
  const runtime = useOperationalRuntime()!,
    state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    s = state.scenario;
  const workspace = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const [mapId, setMapId] = useState<ViewId>('tactical');
  const maps = workspace.views.filter(
    (v) => ['tactical', 'three-d'].includes(viewKind(v.id)) && v.selectedInPane,
  );
  const target = maps.some((v) => v.id === mapId) ? mapId : maps[0]?.id;
  const schedule = state.presentation.frame?.scenarioSchedule,
    frame = state.presentation.frame,
    edit = s.actionEdit;
  const actions = s.active
    ? orderedActions((s.draft.actions ?? []) as ScheduledAction[])
    : orderedActions(
        (schedule?.actions.map((e) => e.action) ?? []) as ScheduledAction[],
      );
  const selectedId = s.selectedActionId;
  const legNumbers = actionLegNumbers(actions);
  const selected = actions.find((a) => a.id === selectedId);
  const selectedActors = state.session.selection.items
    .filter((i) => i.kind === 'scenario-unit')
    .map((i) => i.id);
  const selectedActions =
    s.selectedActionIds ?? (s.selectedActionId ? [s.selectedActionId] : []);
  const nominal = s.active ? scriptPlan(s.draft) : [];
  const batchPreview = edit ? actionPreviewRows(s.draft, edit) : [];
  const locked =
    !!s.pending ||
    s.busy ||
    !!s.blocked ||
    !!s.edit ||
    !!s.boundaryEdit ||
    !!s.placement ||
    s.reviewing;
  const root = useRef<HTMLDivElement>(null),
    actorInput = useRef<HTMLSelectElement>(null),
    error = useRef<HTMLDivElement>(null),
    focusReturn = useRef<HTMLElement | null>(null);
  const previousEdit = useRef(edit),
    previousPick = useRef(edit?.viewId);
  useEffect(() => {
    if (edit && !previousEdit.current)
      requestAnimationFrame(() => actorInput.current?.focus());
    if (!edit && previousEdit.current)
      requestAnimationFrame(() => {
        if (
          focusReturn.current?.isConnected &&
          !focusReturn.current.hasAttribute('disabled')
        )
          focusReturn.current.focus();
        else
          root.current
            ?.querySelector<HTMLButtonElement>('[data-add-action]')
            ?.focus();
      });
    previousEdit.current = edit;
  }, [edit]);
  useEffect(() => {
    if (previousPick.current && edit && !edit.viewId && visible)
      requestAnimationFrame(() =>
        root.current
          ?.querySelector<HTMLInputElement>(
            '[aria-label="Script destination longitude"]',
          )
          ?.focus(),
      );
    previousPick.current = edit?.viewId;
  }, [edit, visible]);
  useEffect(() => {
    if (s.active && s.error && visible)
      requestAnimationFrame(() => {
        error.current?.focus();
        error.current?.scrollIntoView({ block: 'nearest' });
      });
  }, [s.error, s.active, visible]);
  useEffect(() => {
    if (!visible) runtime.disarmAction();
  }, [runtime, visible]);
  useEffect(() => () => runtime.disarmAction(), [runtime]);
  const label = (unitId: string) =>
    s.active
      ? (s.draft.units.find((u) => u.id === unitId)?.label ?? 'Missing actor')
      : (frame?.entities[frame.scenario?.entityIds[unitId] ?? '']?.label ??
        'Unavailable actor');
  function begin(id?: string, duplicate = false) {
    focusReturn.current = root.current?.ownerDocument
      .activeElement as HTMLElement;
    runtime.beginAction(id, duplicate);
  }
  const activeStatus =
    selected && schedule?.actions.find((e) => e.action.id === selected.id);
  const noMovement = (
    s.active
      ? s.draft.units.map((u) => u.id)
      : Object.keys(frame?.scenario?.entityIds ?? {})
  ).filter((id) => !actions.some((a) => a.unitId === id));
  return (
    <div
      className="units-pane conductor-pane"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && edit) {
          if (edit.viewId) runtime.disarmAction();
          else runtime.cancelAction();
          e.preventDefault();
          e.stopPropagation();
        }
      }}
    >
      <header className="units-header">
        <span className="units-eyebrow">LOCAL SIMULATION · CONDUCTOR</span>
        <h1>{s.active ? 'Scenario script' : 'Script execution'}</h1>
        <p>
          {s.active
            ? 'Arrange motion on the simulation clock'
            : 'Committed source actions · inspection only'}
        </p>
      </header>
      <div className="units-body conductor-body">
        {!s.active && !schedule && (
          <div className="units-intro">
            <p>
              Schedule movement for friendly and hostile actors from a saved
              arrangement. Unknown entities stay stationary.
            </p>
            <button
              className="units-primary"
              disabled={
                state.interactive.startingDemo || !!state.interactive.pending
              }
              onClick={() => runtime.enterAuthoring()}
            >
              Open Conductor editor
            </button>
            <button onClick={() => bridge.open('units')}>Open Units</button>
          </div>
        )}
        {!s.active && schedule && (
          <div className="conductor-context">
            <strong>
              {frame?.scenario?.name} · revision {frame?.scenario?.revision}
            </strong>
            <span>
              {frame?.interactive?.state.toUpperCase()} ·{' '}
              {((frame?.interactive?.tick ?? 0) * 0.2).toFixed(1)} s
            </span>
            <p>
              Use Fleet for live Move, Stop and Return to script. A restart
              interrupts the script; create a fresh Run to restart it.
            </p>
          </div>
        )}
        {s.active && (
          <>
            <div className="conductor-context">
              <strong>{s.draft.name}</strong>
              <span>
                {edit
                  ? 'Unapplied action edit'
                  : s.dirty
                    ? 'Unsaved changes'
                    : s.saved
                      ? `Saved revision ${s.saved.revision}`
                      : 'Unsaved arrangement'}
              </span>
              <p>{actions.length}/128 actions · 0–600 seconds · 200 ms ticks</p>
            </div>
            {s.pending && (
              <div className="units-notice">
                <p>
                  {s.busy
                    ? 'Saving the exact request…'
                    : 'Save outcome unknown. Your exact request is retained.'}
                </p>
                <button
                  disabled={s.busy}
                  onClick={() => void runtime.reconcileScenario()}
                >
                  Check save
                </button>
                <button
                  disabled={s.busy}
                  onClick={() => void runtime.reconcileScenario(true)}
                >
                  Retry saved request
                </button>
              </div>
            )}
            <div className="conductor-toolbar">
              <button
                data-add-action
                disabled={
                  locked ||
                  !!edit ||
                  actions.length >= 128 ||
                  !s.draft.units.some((u) => u.category !== 'unknown')
                }
                onClick={() => begin()}
              >
                <Plus size={14} />
                Add action
              </button>
              <button onClick={() => bridge.open('units')}>Units</button>
            </div>
            <details className="conductor-actor-picker">
              <summary>Actors · {selectedActors.length} selected</summary>
              <p className="units-hint">
                Shift-click or drag-select actors on the map, or use these
                checkboxes. Choose one category.
              </p>
              <button
                disabled={locked || !!edit || !selectedActors.length}
                onClick={() => runtime.selectScenarioUnit()}
              >
                Clear actor selection
              </button>
              {s.draft.units.map((u) => (
                <label key={u.id}>
                  <input
                    type="checkbox"
                    aria-label={`Script select ${u.label}`}
                    checked={selectedActors.includes(u.id)}
                    disabled={locked || !!edit || u.category === 'unknown'}
                    onChange={() => runtime.selectScenarioUnit(u.id, true)}
                  />
                  <span>
                    {u.label}
                    <small>
                      {u.category} ·{' '}
                      {u.commandRole === 'sentinel'
                        ? 'controlled'
                        : 'observation only'}
                      {!actions.some((a) => a.unitId === u.id)
                        ? ' · No scripted movement'
                        : ''}
                    </small>
                  </span>
                </label>
              ))}
              <button
                disabled={locked || !!edit || !selectedActors.length}
                onClick={() => runtime.beginActionBatch(selectedActors)}
              >
                Add movement for {selectedActors.length} selected{' '}
                {selectedActors.length === 1 ? 'actor' : 'actors'}
              </button>
            </details>
            {!s.draft.units.some((u) => u.category !== 'unknown') && (
              <p className="units-hint">
                Place a friendly or hostile actor in Units to begin.
              </p>
            )}
            {(s.edit || s.boundaryEdit || s.placement) && (
              <p className="units-notice">
                Finish or discard the current Units/boundary edit before
                scripting.
              </p>
            )}
          </>
        )}
        {(s.active || schedule) && (
          <>
            {s.active && (
              <div className="conductor-plan-controls">
                <label>
                  Map plans
                  <select
                    aria-label="Script plan filter"
                    value={s.planFilter ?? 'all'}
                    onChange={(e) =>
                      runtime.setPlanPresentation({
                        planFilter: e.target.value as 'all' | 'selected',
                      })
                    }
                  >
                    <option value="all">All scripted entities</option>
                    <option value="selected">
                      Selected entities / actions
                    </option>
                  </select>
                </label>
                <label>
                  Labels
                  <select
                    aria-label="Script label density"
                    value={s.planLabels ?? 'all'}
                    onChange={(e) =>
                      runtime.setPlanPresentation({
                        planLabels: e.target.value as 'all' | 'selected',
                      })
                    }
                  >
                    <option value="all">All leg labels</option>
                    <option value="selected">
                      Selected labels + compact markers
                    </option>
                  </select>
                </label>
              </div>
            )}
            {s.active && s.planLabels === 'selected' && (
              <small className="units-hint">
                Full labels follow selected actions first; otherwise selected
                entities. Other endpoints keep their entity and leg markers. Leg
                numbers identify actions; timing determines execution order.
              </small>
            )}
            <div className="conductor-table-wrap">
              <table className="conductor-table" aria-label="Scenario actions">
                <thead>
                  <tr>
                    {s.active && (
                      <th className="conductor-select-column">
                        <span className="sr-only">Select actions</span>
                      </th>
                    )}
                    <th>Timing</th>
                    <th>Entity</th>
                    <th>Action</th>
                    <th>Destination</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {actions.map((a) => {
                    const execution = schedule?.actions.find(
                      (e) => e.action.id === a.id,
                    );
                    return (
                      <tr key={a.id} data-selected={selectedId === a.id}>
                        {s.active && (
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`Select for batch ${label(a.unitId)} ${actionTime(a)}`}
                              checked={selectedActions.includes(a.id)}
                              disabled={!!edit}
                              onChange={() => runtime.selectAction(a.id, true)}
                            />
                          </td>
                        )}
                        <td>
                          <button
                            disabled={!!edit}
                            aria-label={`Select action ${label(a.unitId)} ${actionTime(a)}`}
                            onClick={() => runtime.selectAction(a.id)}
                          >
                            {a.afterActionId
                              ? `After previous + ${(a.delayMs ?? 0) / 1000}s`
                              : `${(a.offsetMs! / 1000).toFixed(1)} s`}
                          </button>
                        </td>
                        <td>
                          <span>{label(a.unitId)}</span>
                          <span>Leg {legNumbers.get(a.id)}</span>
                        </td>
                        <td>Move</td>
                        <td>
                          <span>{a.destination.longitudeDeg.toFixed(5)}</span>
                          <span>{a.destination.latitudeDeg.toFixed(5)}</span>
                        </td>
                        <td>
                          <span
                            className="conductor-status"
                            data-state={s.active ? 'Plan' : execution?.state}
                          >
                            {s.active
                              ? s.dirty || !s.saved
                                ? 'Unsaved plan'
                                : 'Saved plan'
                              : execution?.state === 'Pending' &&
                                  a.afterActionId
                                ? 'Waiting for previous'
                                : execution?.state}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!!noMovement.length && (
              <details className="conductor-no-movement">
                <summary>
                  No scripted movement · {noMovement.length} entities
                </summary>
                <p>{noMovement.map(label).join(' · ')}</p>
              </details>
            )}
            {s.active && selectedActions.length > 1 && (
              <button
                disabled={locked || !!edit}
                onClick={() =>
                  runtime.beginActionBatch(
                    actions
                      .filter((a) => selectedActions.includes(a.id))
                      .map((a) => a.unitId),
                    [...selectedActions],
                  )
                }
              >
                Edit {selectedActions.length} selected movements
              </button>
            )}
            {!actions.length && (
              <p className="units-empty">
                No timed actions. Actors hold their placed positions until
                commanded.
              </p>
            )}
            {selected && !edit && (
              <div className="conductor-selection">
                <strong>
                  {label(selected.unitId)} · Leg {legNumbers.get(selected.id)} ·{' '}
                  {actionTime(selected)}
                </strong>
                {s.active && (
                  <p>
                    Estimated start{' '}
                    {nominal.find((l) => l.action.id === selected.id)
                      ?.startTick == null
                      ? 'unavailable'
                      : `${(nominal.find((l) => l.action.id === selected.id)!.startTick! * 0.2).toFixed(1)}s`}
                    {selected.afterActionId
                      ? ` · previous action ${selected.afterActionId.slice(0, 8)}`
                      : ''}
                    . {nominal.find((l) => l.action.id === selected.id)?.reason}
                  </p>
                )}
                {s.active ? (
                  <>
                    <div className="units-actions">
                      <button
                        disabled={locked}
                        onClick={() => begin(selected.id)}
                      >
                        <Pencil size={13} />
                        Edit action
                      </button>
                      <button
                        disabled={locked || actions.length >= 128}
                        onClick={() => begin(selected.id, true)}
                      >
                        <Copy size={13} />
                        Duplicate action
                      </button>
                      <button
                        disabled={locked}
                        onClick={() => runtime.deleteAction(selected.id)}
                      >
                        <Trash2 size={13} />
                        Delete action
                      </button>
                    </div>
                    <div className="units-actions">
                      <button
                        aria-label="Earlier at same tick"
                        disabled={
                          locked ||
                          selected.offsetMs == null ||
                          actions[actions.indexOf(selected) - 1]?.offsetMs !==
                            selected.offsetMs
                        }
                        onClick={() => runtime.reorderAction(selected.id, -1)}
                      >
                        <ArrowUp size={13} />
                        Earlier
                      </button>
                      <button
                        aria-label="Later at same tick"
                        disabled={
                          locked ||
                          selected.offsetMs == null ||
                          actions[actions.indexOf(selected) + 1]?.offsetMs !==
                            selected.offsetMs
                        }
                        onClick={() => runtime.reorderAction(selected.id, 1)}
                      >
                        <ArrowDown size={13} />
                        Later
                      </button>
                      <small>Order within the same tick</small>
                    </div>
                  </>
                ) : (
                  <>
                    <p>
                      {activeStatus?.reason ??
                        'Awaiting the committed simulation tick.'}
                    </p>
                    <p>
                      {activeStatus?.motion
                        ? `Actual accepted tick ${activeStatus.motion.acceptedTick} (${(activeStatus.motion.acceptedTick * 0.2).toFixed(1)}s)`
                        : 'Not accepted'}
                      {activeStatus?.terminalTick != null
                        ? ` · terminal at ${(activeStatus.terminalTick * 0.2).toFixed(1)}s`
                        : ''}
                      {activeStatus &&
                      schedule?.manualOverrides?.includes(activeStatus.entityId)
                        ? ' · MANUAL OVERRIDE'
                        : ''}
                    </p>
                    {activeStatus?.motion && (
                      <p>
                        {activeStatus.motion.remainingMetres.toFixed(1)} m
                        remaining · supplied height{' '}
                        {activeStatus.motion.destination.altitude.metres} m
                      </p>
                    )}
                  </>
                )}
              </div>
            )}
            {s.active && edit && (
              <form
                className="conductor-editor"
                aria-label="Script action editor"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!runtime.applyAction())
                    requestAnimationFrame(() => {
                      error.current?.focus();
                      error.current?.scrollIntoView({ block: 'nearest' });
                    });
                }}
              >
                <fieldset disabled={locked}>
                  <legend>
                    {edit.batch
                      ? `${edit.batch.length} movements · atomic batch`
                      : edit.originalId
                        ? 'Edit movement'
                        : 'New movement'}
                  </legend>
                  <label>
                    Actor
                    <select
                      ref={actorInput}
                      aria-label="Script actor"
                      value={edit.unitId}
                      disabled={!!edit.batch}
                      onChange={(e) =>
                        runtime.editAction({ unitId: e.target.value })
                      }
                    >
                      {s.draft.units
                        .filter((u) => u.category !== 'unknown')
                        .map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.label} ·{' '}
                            {u.commandRole === 'sentinel'
                              ? 'controlled'
                              : 'observation only'}
                          </option>
                        ))}
                    </select>
                  </label>
                  <label>
                    Begin movement
                    <select
                      aria-label="Movement timing mode"
                      value={edit.timingMode ?? 'absolute'}
                      onChange={(e) =>
                        runtime.editAction({
                          timingMode: e.target.value as
                            'absolute' | 'after' | 'keep',
                        })
                      }
                    >
                      {edit.batch?.some((m) => m.originalId) && (
                        <option value="keep">
                          Keep each selected action's timing
                        </option>
                      )}
                      <option value="absolute">
                        At a simulation time after Start
                      </option>
                      <option value="after">
                        After previous movement + delay
                      </option>
                    </select>
                  </label>
                  {edit.timingMode === 'after' && !edit.batch && (
                    <label>
                      Previous movement
                      <select
                        aria-label="Previous movement"
                        value={edit.predecessorId ?? ''}
                        onChange={(e) =>
                          runtime.editAction({ predecessorId: e.target.value })
                        }
                      >
                        <option value="">Choose a previous movement</option>
                        {actions
                          .filter(
                            (a) => a.unitId === edit.unitId && a.id !== edit.id,
                          )
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              Leg{' '}
                              {
                                nominal.find((l) => l.action.id === a.id)
                                  ?.number
                              }{' '}
                              · {actionTime(a)} · {a.id.slice(0, 8)}
                            </option>
                          ))}
                      </select>
                    </label>
                  )}
                  {edit.timingMode === 'after' ? (
                    <label>
                      Delay after successful completion (seconds)
                      <input
                        aria-label="Completion delay"
                        inputMode="decimal"
                        value={edit.delaySeconds ?? '0'}
                        onChange={(e) =>
                          runtime.editAction({ delaySeconds: e.target.value })
                        }
                        onBlur={() => runtime.snapActionTime()}
                      />
                    </label>
                  ) : (
                    edit.timingMode !== 'keep' && (
                      <label>
                        Time after Start (seconds)
                        <input
                          aria-label="Action time after Start"
                          inputMode="decimal"
                          value={edit.seconds}
                          onChange={(e) =>
                            runtime.editAction({ seconds: e.target.value })
                          }
                          onBlur={() => runtime.snapActionTime()}
                        />
                      </label>
                    )
                  )}
                  <small>
                    Snaps to the nearest 0.2 s before Apply. No wall-clock
                    scheduling.
                  </small>
                  <div className="units-coordinate-grid">
                    <label>
                      Longitude
                      <input
                        aria-label="Script destination longitude"
                        inputMode="decimal"
                        value={edit.longitude}
                        onChange={(e) =>
                          runtime.editAction({ longitude: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Latitude
                      <input
                        aria-label="Script destination latitude"
                        inputMode="decimal"
                        value={edit.latitude}
                        onChange={(e) =>
                          runtime.editAction({ latitude: e.target.value })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Destination map
                    <select
                      aria-label="Script destination map"
                      value={target ?? ''}
                      onChange={(e) => {
                        runtime.disarmAction();
                        setMapId(e.target.value as ViewId);
                      }}
                    >
                      {maps.map((v) => (
                        <option key={v.id} value={v.id}>
                          {bridge.getViewTitle(v.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={!target}
                    onClick={() => target && runtime.armAction(target)}
                  >
                    <Crosshair size={14} />
                    Pick scripted destination
                  </button>
                  {edit.viewId && (
                    <p role="status" className="units-notice">
                      Click the owning map to set a destination. Escape cancels
                      the pick and keeps these edits.{' '}
                      <button
                        type="button"
                        onClick={() => runtime.disarmAction()}
                      >
                        Cancel destination pick
                      </button>
                    </p>
                  )}
                  <p className="units-hint">
                    Straight intent line only; not route clearance. Supplied
                    operational height is preserved. Unknown entities cannot be
                    scripted.
                  </p>
                  {edit.batch && (
                    <div className="conductor-batch-preview">
                      <strong>Exact batch destinations</strong>
                      <p>
                        The anchor translates horizontal offsets without
                        rotation or scaling. Each action executes independently
                        {edit.timingMode === 'after'
                          ? '; each actor may start at a different completion tick'
                          : ''}
                        .
                      </p>
                      {batchPreview.length ? (
                        batchPreview.map((row) => (
                          <p key={row.id}>
                            {row.label} · {row.timing}
                            <br />
                            {row.destination.longitudeDeg.toFixed(6)},{' '}
                            {row.destination.latitudeDeg.toFixed(6)}
                          </p>
                        ))
                      ) : (
                        <p role="status">
                          Complete valid timing and coordinates to preview this
                          batch.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="units-actions">
                    <button type="submit" className="units-primary">
                      {edit.batch ? 'Apply complete batch' : 'Apply action'}
                    </button>
                    <button
                      type="button"
                      onClick={() => runtime.cancelAction()}
                    >
                      Cancel action edit
                    </button>
                  </div>
                </fieldset>
              </form>
            )}
          </>
        )}
        {s.active && s.error && (
          <div className="units-notice" role="alert" ref={error} tabIndex={-1}>
            {s.error}
          </div>
        )}
        {s.active && s.message && (
          <p className="units-hint" role="status">
            {s.message}
          </p>
        )}
        {s.active && (
          <p className="units-hint">
            Scripted observation-only actors remain outside Sentinel live
            control. Apply changes, save a revision, then validate and run
            below.
          </p>
        )}
        {s.active && <ScenarioRunReview />}
      </div>
      {s.active && (
        <footer className="units-footer conductor-footer">
          <button
            disabled={locked || !!edit || (!s.dirty && !!s.saved)}
            onClick={() => void runtime.saveScenario()}
          >
            <Save size={14} />
            Save revision
          </button>
          <button
            className="units-primary"
            disabled={locked || !!edit || s.dirty || !s.saved}
            onClick={() => {
              void runtime.validateScenario();
              requestAnimationFrame(() =>
                root.current
                  ?.querySelector('[aria-label="Saved scenario launch"]')
                  ?.scrollIntoView({ block: 'nearest' }),
              );
            }}
          >
            Validate → Run review
          </button>
        </footer>
      )}
    </div>
  );
}
