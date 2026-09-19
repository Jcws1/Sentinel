import { ScenarioLocation } from './ScenarioLocation';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Drone, CircleHelp, Plus, Save, Play, Search } from 'lucide-react';
import {
  useOperationalRuntime,
  useOperationalSnapshot,
} from '../../app/OperationalContext';
import type { ScenarioContent } from '../../contracts/generated';
import { MAX_SCENARIO_UNITS } from '../../contracts/scenarios';
import './units.css';
import { BoundaryPanel, LiveBoundaryList } from './BoundaryPanel';
import { UnitEditor } from './UnitEditor';
import { PlacementForm } from './PlacementForm';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import { viewKind, type ViewId } from '../workspace/viewRegistry';
import { missionDisplayName } from '../mission/MissionControls';
import { profileOptions, unitProfiles } from '../../world/unitProfiles';
const categories = [
  {
    id: 'friendly',
    name: 'Friendly drone',
    detail: 'Sentinel control · role editable',
    icon: Drone,
  },
  {
    id: 'hostile',
    name: 'Hostile drone',
    detail: 'Observation only',
    icon: Drone,
  },
  {
    id: 'unknown',
    name: 'Unknown entity',
    detail: 'Observation only',
    icon: CircleHelp,
  },
] as const;
export function UnitsPane({ bridge }: { bridge: WorkspaceBridge }) {
  const runtime = useOperationalRuntime()!;
  const state = useOperationalSnapshot(runtime),
    scenario = state.scenario;
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<'friendly' | 'hostile'>();
  const [loadId, setLoadId] = useState('');
  const [confirm, setConfirm] = useState<'new' | 'load'>();
  const workspace = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const [chosenMap, setChosenMap] = useState<ViewId>('tactical');
  const maps = workspace.views.filter(
    (v) => ['tactical', 'three-d'].includes(viewKind(v.id)) && v.selectedInPane,
  );
  const targetMap = maps.some((v) => v.id === chosenMap)
    ? chosenMap
    : maps[0]?.id;
  const returnFocus = useRef<HTMLElement | null>(null);
  const paneRef = useRef<HTMLDivElement>(null);
  const reviewRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const previousPlacement = useRef(scenario.placement);
  useEffect(() => {
    if (scenario.active && scenario.error && !scenario.edit) {
      const frame = requestAnimationFrame(() => errorRef.current?.focus());
      return () => cancelAnimationFrame(frame);
    }
  }, [scenario.active, scenario.error, scenario.edit]);
  useEffect(() => {
    if (previousPlacement.current && !scenario.placement && scenario.active) {
      const target = returnFocus.current;
      requestAnimationFrame(() => {
        if (target?.isConnected && !target.hasAttribute('disabled'))
          target.focus();
        else
          paneRef.current
            ?.querySelector<HTMLElement>(
              '[aria-label="Search unit categories"]',
            )
            ?.focus();
      });
    }
    previousPlacement.current = scenario.placement;
  }, [scenario.placement, scenario.active]);
  useEffect(() => () => runtime.armPlacement(), [runtime]);
  const selected = scenario.draft.units.find(
    (u) => u.id === (scenario.edit?.id ?? state.session.selection.primary?.id),
  );
  const locked = !!scenario.pending || scenario.busy || !!scenario.blocked;
  const documentLocked =
    locked ||
    !!scenario.locationEdit ||
    !!scenario.edit ||
    !!scenario.actionEdit ||
    !!scenario.boundaryEdit ||
    !!scenario.placement ||
    scenario.reviewing;
  const activeRun = state.interactive.entry?.activeMissionId;
  useEffect(() => {
    if (!scenario.active || !scenario.placement) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        runtime.armPlacement();
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [runtime, scenario.active, scenario.placement]);
  function replace(kind: 'new' | 'load') {
    setConfirm(undefined);
    runtime.selectScenarioUnit();
    if (kind === 'new') runtime.newScenario();
    else
      void runtime.loadScenario(loadId || scenario.saved?.definitionId || '');
  }
  function requestReplace(kind: 'new' | 'load') {
    if (scenario.dirty) setConfirm(kind);
    else replace(kind);
  }
  function arm(
    category: 'friendly' | 'hostile' | 'unknown',
    operation?: {
      replaceId?: string;
      duplicateId?: string;
      profileId?: keyof typeof unitProfiles;
    },
  ) {
    if (!targetMap) return;
    returnFocus.current = paneRef.current?.ownerDocument
      .activeElement as HTMLElement;
    runtime.armPlacement({ category, ...operation, viewId: targetMap });
  }
  return (
    <div
      className="units-pane"
      ref={paneRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && scenario.placement) {
          runtime.armPlacement();
          event.preventDefault();
        }
      }}
    >
      <header className="units-header">
        <span className="units-eyebrow">LOCAL SIMULATION</span>
        <h1>Scenario composition</h1>
        <p>Arrange · Save · Validate · Run</p>
      </header>
      {!scenario.active ? (
        <div className="units-intro">
          <LiveBoundaryList />
          <p>Create or revise a saved arrangement in both map views.</p>
          {state.missionId && (
            <p>
              Opening the editor leaves the current view. An active simulation
              continues.
            </p>
          )}
          <button
            className="units-primary"
            disabled={
              state.interactive.startingDemo || !!state.interactive.pending
            }
            onClick={() => runtime.enterAuthoring()}
          >
            Open scenario editor
          </button>
          {scenario.saved && (
            <p>
              {scenario.saved.content.name} · revision {scenario.saved.revision}{' '}
              retained
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="units-body">
            <div className="units-document">
              <label>
                Arrangement name
                <input
                  aria-label="Arrangement name"
                  maxLength={80}
                  disabled={documentLocked}
                  value={scenario.draft.name}
                  onChange={(e) =>
                    runtime.updateScenario({
                      ...structuredClone(scenario.draft),
                      name: e.target.value,
                    } as ScenarioContent)
                  }
                />
              </label>
              <div className="units-revision">
                <span>
                  {scenario.saved
                    ? `Revision ${scenario.saved.revision}`
                    : 'Unsaved arrangement'}
                </span>
                <span>
                  {scenario.actionEdit
                    ? 'Unapplied Conductor edit'
                    : scenario.boundaryEdit
                      ? 'Unapplied boundary edits'
                      : scenario.edit
                        ? 'Unapplied unit edits'
                        : scenario.dirty
                          ? 'Unsaved changes'
                          : scenario.saved
                            ? 'Saved'
                            : 'Draft'}
                </span>
              </div>
              <div className="units-actions">
                <button
                  disabled={documentLocked}
                  onClick={() => requestReplace('new')}
                >
                  <Plus size={13} />
                  New
                </button>
                <button
                  disabled={documentLocked || !scenario.draft.name.trim()}
                  onClick={() => void runtime.saveScenario()}
                >
                  <Save size={13} />
                  Save revision
                </button>
                {scenario.saved && (
                  <button
                    disabled={documentLocked}
                    onClick={() => void runtime.saveScenario(true)}
                  >
                    Save as new
                  </button>
                )}
              </div>
              <div className="units-load">
                <select
                  aria-label="Saved arrangements"
                  disabled={documentLocked}
                  value={loadId || scenario.saved?.definitionId || ''}
                  onChange={(e) => setLoadId(e.target.value)}
                >
                  <option value="">Saved arrangements…</option>
                  {scenario.catalog.map((r) => (
                    <option key={r.definitionId} value={r.definitionId}>
                      {r.content.name} · r{r.revision}
                    </option>
                  ))}
                </select>
                <button
                  disabled={
                    documentLocked || !(loadId || scenario.saved?.definitionId)
                  }
                  onClick={() => requestReplace('load')}
                >
                  Load latest
                </button>
              </div>
              {confirm && (
                <div className="units-notice" role="alert">
                  <p>
                    Replace the unsaved draft? Saved revisions remain available.
                  </p>
                  <button onClick={() => replace(confirm)}>
                    Replace draft
                  </button>
                  <button onClick={() => setConfirm(undefined)}>
                    Keep editing
                  </button>
                </div>
              )}
              {scenario.error &&
                !scenario.edit &&
                !scenario.boundaryEdit &&
                !scenario.placement && (
                  <div
                    className="units-notice"
                    role="alert"
                    ref={errorRef}
                    tabIndex={-1}
                  >
                    {scenario.error}
                  </div>
                )}
              {scenario.message && (
                <p className="units-save-status" role="status">
                  {scenario.message}
                </p>
              )}
              {scenario.pending && (
                <div className="units-actions">
                  <button
                    disabled={scenario.busy}
                    onClick={() => void runtime.reconcileScenario()}
                  >
                    Check save
                  </button>
                  <button
                    disabled={scenario.busy}
                    onClick={() => void runtime.reconcileScenario(true)}
                  >
                    Retry saved request
                  </button>
                </div>
              )}
            </div>
            <div className="units-target">
              <label>
                Authoring map
                <select
                  aria-label="Authoring map"
                  value={targetMap ?? ''}
                  disabled={locked || !!scenario.edit}
                  onChange={(event) => {
                    runtime.armPlacement();
                    runtime.disarmBoundary();
                    setChosenMap(event.target.value as ViewId);
                  }}
                >
                  {!maps.length && (
                    <option value="">Open a map to place or locate</option>
                  )}
                  {maps.map((map) => (
                    <option key={map.id} value={map.id}>
                      {bridge.getViewTitle(map.id)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="units-hint">
                Placement and Locate affect only this map.
              </p>
            </div>
            <ScenarioLocation viewId={targetMap} />
            <BoundaryPanel viewId={targetMap} />
            <section className="units-palette" aria-label="Unit palette">
              <div className="units-section-title">
                <h2>Place units</h2>
                <span>
                  {scenario.draft.units.length}/{MAX_SCENARIO_UNITS}
                </span>
              </div>
              <label className="units-search">
                <Search size={14} />
                <input
                  aria-label="Search unit categories"
                  placeholder="Search categories"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              {categories
                .filter((c) =>
                  c.name.toLowerCase().includes(query.toLowerCase()),
                )
                .map((c) => (
                  <div key={c.id}>
                    <button
                      className={`units-category units-${c.id}`}
                      disabled={
                        locked ||
                        !!scenario.locationEdit ||
                        !!scenario.edit ||
                        !!scenario.actionEdit ||
                        !!scenario.boundaryEdit ||
                        scenario.reviewing ||
                        !targetMap ||
                        scenario.draft.units.length >= MAX_SCENARIO_UNITS
                      }
                      aria-pressed={
                        scenario.placement?.category === c.id &&
                        !scenario.placement.replaceId
                      }
                      aria-expanded={
                        c.id === 'unknown' ? undefined : expanded === c.id
                      }
                      onClick={() => {
                        if (c.id === 'unknown') arm(c.id);
                        else {
                          runtime.armPlacement();
                          setExpanded(expanded === c.id ? undefined : c.id);
                        }
                      }}
                    >
                      <c.icon size={21} />
                      <span>
                        <strong>{c.name}</strong>
                        <small>{c.detail}</small>
                      </span>
                      <Plus size={14} />
                    </button>
                    {expanded === c.id && (
                      <div
                        className="units-subtypes"
                        aria-label={`${c.id} unit types`}
                      >
                        {profileOptions[c.id].map((id) => (
                          <button
                            key={id}
                            disabled={
                              locked ||
                              !!scenario.locationEdit ||
                              !!scenario.edit ||
                              !!scenario.actionEdit ||
                              !!scenario.boundaryEdit ||
                              scenario.reviewing ||
                              !targetMap ||
                              scenario.draft.units.length >= MAX_SCENARIO_UNITS
                            }
                            aria-pressed={
                              scenario.placement?.profileId === id &&
                              scenario.placement.category === c.id
                            }
                            onClick={() => arm(c.id, { profileId: id })}
                          >
                            <span>{unitProfiles[id].label}</span>
                            <small>
                              {unitProfiles[id].cruiseKmh} km/h
                              {c.id === 'friendly'
                                ? ` · pursuit ${unitProfiles[id].pursuitKmh}`
                                : ''}
                            </small>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              <p className="units-hint">
                Choose a category and type, then click the authoring map. Speeds
                are notional simulation profiles. One click places one unit at
                150 m ellipsoid height.
              </p>
              {scenario.placement && (
                <div className="units-placement" aria-label="Placement tool">
                  <strong>
                    {scenario.placement.duplicateId
                      ? 'Duplicate'
                      : scenario.placement.replaceId
                        ? 'Reposition'
                        : 'Place'}{' '}
                    · {scenario.placement.category}
                    {scenario.placement.profileId &&
                      ` · ${unitProfiles[scenario.placement.profileId].label}`}
                  </strong>
                  <p>
                    Click{' '}
                    {bridge.getViewTitle(scenario.placement.viewId as ViewId)}{' '}
                    or enter coordinates.{' '}
                    {scenario.placement.duplicateId
                      ? 'Choose a different position; the source stays unchanged.'
                      : ''}
                  </p>
                  <PlacementForm
                    key={`${scenario.placement.category}:${scenario.placement.replaceId ?? scenario.placement.duplicateId ?? 'new'}`}
                    category={scenario.placement.category}
                    source={scenario.draft.units.find(
                      (u) =>
                        u.id ===
                        (scenario.placement?.replaceId ??
                          scenario.placement?.duplicateId),
                    )}
                    onPlace={(lon, lat, pose) => {
                      const placed = runtime.placeScenarioUnit(lon, lat, pose);
                      if (!placed)
                        requestAnimationFrame(() => errorRef.current?.focus());
                      return placed;
                    }}
                    onInvalid={(message) => {
                      runtime.reportScenarioError(message);
                      requestAnimationFrame(() => errorRef.current?.focus());
                    }}
                  />
                  {scenario.error && (
                    <div
                      className="units-notice"
                      role="alert"
                      ref={errorRef}
                      tabIndex={-1}
                    >
                      {scenario.error}
                      {scenario.error.includes('operating square') && (
                        <div className="units-actions">
                          <button
                            disabled={!targetMap}
                            onClick={() =>
                              targetMap && runtime.showScenarioArea(targetMap)
                            }
                          >
                            Show operating area
                          </button>
                          <button
                            onClick={() => runtime.beginScenarioLocation()}
                          >
                            Change origin
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  <button
                    className="units-cancel"
                    onClick={() => runtime.armPlacement()}
                  >
                    Cancel placement · Esc
                  </button>
                </div>
              )}
            </section>
            <button onClick={() => bridge.open('conductor')}>
              Conductor · {scenario.draft.actions?.length ?? 0} timed actions
            </button>
            <section className="units-arrangement" aria-label="Placed units">
              <div className="units-section-title">
                <h2>Arrangement</h2>
                <span>
                  {
                    scenario.draft.units.filter(
                      (u) => u.commandRole === 'sentinel',
                    ).length
                  }{' '}
                  controlled
                </span>
              </div>
              {!scenario.draft.units.length && (
                <p className="units-empty">
                  Your arrangement is empty.
                  <br />
                  Place a unit to begin.
                </p>
              )}
              <ul>
                {scenario.draft.units.map((u) => (
                  <li key={u.id}>
                    <button
                      className={`units-row units-${u.category}`}
                      aria-pressed={selected?.id === u.id}
                      onClick={() => runtime.selectScenarioUnit(u.id)}
                    >
                      <span className="units-marker">
                        {u.category === 'friendly'
                          ? '○'
                          : u.category === 'hostile'
                            ? '◇'
                            : '?'}
                      </span>
                      <span>
                        <strong>{u.label}</strong>
                        <small>
                          {u.category} ·{' '}
                          {u.profileId &&
                            `${unitProfiles[u.profileId].label} · `}
                          {u.commandRole === 'sentinel'
                            ? 'Sentinel control'
                            : 'Observation only'}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
            {selected && (
              <UnitEditor
                unit={selected}
                edit={scenario.edit}
                disabled={
                  locked ||
                  !!scenario.locationEdit ||
                  !!scenario.actionEdit ||
                  !!scenario.boundaryEdit ||
                  !!scenario.placement ||
                  scenario.reviewing
                }
                canLocate={!!targetMap}
                canDuplicate={
                  !!targetMap &&
                  scenario.draft.units.length < MAX_SCENARIO_UNITS
                }
                onLocate={() => {
                  if (targetMap)
                    runtime.locateScenarioUnit(selected.id, targetMap);
                }}
                onDuplicate={() =>
                  arm(selected.category, { duplicateId: selected.id })
                }
                onEdit={(edit) => runtime.editScenarioUnit(edit)}
                onApply={() => runtime.applyScenarioUnitEdit()}
                onDiscard={() => runtime.discardScenarioUnitEdit()}
                error={scenario.error}
                onReposition={() =>
                  arm(selected.category, { replaceId: selected.id })
                }
                onDelete={() => {
                  if (
                    scenario.draft.actions?.some(
                      (a) => a.unitId === selected.id,
                    )
                  ) {
                    runtime.reportScenarioError(
                      'Remove this unit’s actions in Conductor before deleting it.',
                    );
                    return;
                  }
                  runtime.updateScenario({
                    ...structuredClone(scenario.draft),
                    units: scenario.draft.units.filter(
                      (u) => u.id !== selected.id,
                    ),
                  } as ScenarioContent);
                  runtime.selectScenarioUnit();
                }}
              />
            )}
            {scenario.review && (
              <div
                className="units-review"
                ref={reviewRef}
                tabIndex={-1}
                aria-label="Scenario validation review"
              >
                <div className="units-section-title">
                  <h2>
                    {scenario.review.canRun
                      ? 'Ready to run'
                      : 'Review needs attention'}
                  </h2>
                  <span>REVISION {scenario.review.reference.revision}</span>
                </div>
                <strong>{scenario.review.name}</strong>
                <p>
                  {scenario.review.counts.total} entities ·{' '}
                  {scenario.review.counts.controlled} controlled ·{' '}
                  {scenario.review.counts.observationOnly} observation only
                </p>
                <p>
                  {scenario.review.counts.friendly} friendly ·{' '}
                  {scenario.review.counts.hostile} hostile ·{' '}
                  {scenario.review.counts.unknown} unknown
                </p>
                <p>
                  Notional horizontal motion ·{' '}
                  {Object.keys(scenario.review.motionPreset.unitProfiles ?? {})
                    .length
                    ? 'per unit profile'
                    : `${(scenario.review.motionPreset.speedMps * 3.6).toFixed(0)} km/h`}
                  . Supplied height is preserved. Unknown entities remain
                  stationary.
                </p>
                <p>
                  {scenario.review.actionCount} scripted actions · last authored
                  start at{' '}
                  {(scenario.review.scriptDurationMs / 1000).toFixed(1)} s.
                  Friendly observation-only and hostile motion does not grant
                  live control.
                </p>
                <details>
                  <summary>Revision and model</summary>
                  <dl>
                    <dt>Definition</dt>
                    <dd>{scenario.review.reference.definitionId}</dd>
                    <dt>Content hash</dt>
                    <dd>{scenario.review.reference.contentHash}</dd>
                    <dt>Preset / model</dt>
                    <dd>
                      {scenario.review.motionPreset.templateId} /{' '}
                      {scenario.review.motionPreset.modelId}
                    </dd>
                  </dl>
                </details>
                <p>
                  {scenario.review.boundaryCount} boundaries · horizontal rules
                  at all demo heights
                </p>
                {scenario.review.issues.map((issue, index) => (
                  <p role="alert" key={`${issue.code}:${index}`}>
                    {issue.message}
                  </p>
                ))}
                <p className="units-hint">
                  Run rechecks current admission. Validation grants no control.
                </p>
              </div>
            )}
          </div>
          <footer className="units-run">
            <button
              className="units-validate"
              disabled={documentLocked || scenario.dirty || !scenario.saved}
              onClick={async () => {
                await runtime.validateScenario();
                requestAnimationFrame(() => reviewRef.current?.focus());
              }}
            >
              {scenario.reviewing ? 'Validating…' : 'Validate saved revision'}
            </button>
            <button
              className="units-primary"
              disabled={
                documentLocked ||
                scenario.dirty ||
                !scenario.saved ||
                !scenario.review?.canRun ||
                !scenario.draft.units.length ||
                !!activeRun ||
                state.interactive.busy ||
                !!state.interactive.pending ||
                state.interactive.startingDemo
              }
              onClick={() => void runtime.runScenario()}
            >
              <Play size={14} />
              Run saved revision
              {scenario.saved ? ` ${scenario.saved.revision}` : ''}
            </button>
            <p>
              {scenario.edit
                ? 'Unapplied unit edits · Apply or Discard before Save or Run.'
                : activeRun
                  ? `End the active demo (${missionDisplayName(state.catalog.missions.find((m) => m.id === activeRun))}) before starting another.`
                  : scenario.dirty || !scenario.saved
                    ? 'Save your arrangement to enable Run.'
                    : !scenario.review?.canRun
                      ? 'Validate this saved revision before Run.'
                      : 'Creates a new demo from this exact revision.'}
            </p>
            {activeRun && (
              <button onClick={() => runtime.loadMission(activeRun)}>
                Return to active demo
              </button>
            )}
            {state.interactive.pending && (
              <button
                disabled={state.interactive.busy}
                onClick={() => void runtime.reconcileInteractive(true)}
              >
                Retry Run request
              </button>
            )}
            {state.interactive.error && (
              <p role="alert">{state.interactive.error}</p>
            )}
          </footer>
        </>
      )}
    </div>
  );
}
