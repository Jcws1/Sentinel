import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import {
  useOperationalRuntime,
  useOperationalSnapshot,
} from '../../app/OperationalContext';
import { MAX_SCENARIO_UNITS } from '../../contracts/scenarios';
import './units.css';
import { BoundaryPanel } from './BoundaryPanel';
import { ScenarioLocation } from './ScenarioLocation';
import { UnitEditor } from './UnitEditor';
import { PlacementForm } from './PlacementForm';
import { AffiliationMark, UnitSilhouette } from './UnitSymbols';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import type { ViewId } from '../workspace/viewRegistry';
import { profileOptions, unitProfiles } from '../../world/unitProfiles';
import { scenarioDeletionImpact } from '../../world/scenarioSelection';
const categories = [
  {
    id: 'friendly',
    name: 'Friendly',
    detail: 'Sentinel control · role editable',
  },
  { id: 'hostile', name: 'Hostile', detail: 'Observation only' },
  { id: 'unknown', name: 'Unknown entity', detail: 'Observation only' },
] as const;

export const UnitsPane = memo(function UnitsPane({
  bridge,
  targetMap,
  visible,
}: {
  bridge: WorkspaceBridge;
  targetMap?: ViewId;
  visible: boolean;
}) {
  const runtime = useOperationalRuntime()!,
    state = useOperationalSnapshot(runtime),
    scenario = state.scenario;
  const [query, setQuery] = useState(''),
    [expanded, setExpanded] = useState<'friendly' | 'hostile'>();
  const [unitQuery, setUnitQuery] = useState(''),
    [filter, setFilter] = useState('all');
  const [paletteOpen, setPaletteOpen] = useState(!scenario.draft.units.length);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [inspectSelection, setInspectSelection] = useState(true);
  const revealEditor = useRef(false);
  const previousDefinition = useRef(scenario.saved?.definitionId);
  useEffect(() => {
    if (previousDefinition.current !== scenario.saved?.definitionId) {
      setPaletteOpen(!scenario.draft.units.length);
      setQuery('');
      setUnitQuery('');
      setFilter('all');
      previousDefinition.current = scenario.saved?.definitionId;
    }
  }, [scenario.saved?.definitionId, scenario.draft.units.length]);
  const [deleteIds, setDeleteIds] = useState<string[]>();
  const deletionDraft = useRef(scenario.draft);
  const deleteTrigger = useRef<HTMLElement | null>(null);
  function reviewDeletion(ids: string[]) {
    deletionDraft.current = scenario.draft;
    deleteTrigger.current = paneRef.current?.ownerDocument
      .activeElement as HTMLElement;
    setDeleteIds(ids);
  }
  function cancelDeletion() {
    setDeleteIds(undefined);
    requestAnimationFrame(
      () => deleteTrigger.current?.isConnected && deleteTrigger.current.focus(),
    );
  }
  const paneRef = useRef<HTMLDivElement>(null),
    bodyRef = useRef<HTMLDivElement>(null),
    errorRef = useRef<HTMLDivElement>(null),
    deleteRef = useRef<HTMLDivElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  const selection = state.session.selection.items
    .filter((i) => i.kind === 'scenario-unit')
    .map((i) => i.id);
  const selected = scenario.draft.units.find(
    (u) =>
      u.id ===
      (scenario.edit?.id ??
        (inspectSelection && selection.length === 1
          ? selection[0]
          : undefined)),
  );
  useLayoutEffect(() => {
    if (visible && revealEditor.current && selected) {
      paneRef.current
        ?.querySelector<HTMLElement>('.units-editor input')
        ?.focus();
      revealEditor.current = false;
    }
  }, [visible, selected, inspectSelection, state.session.selection.revision]);
  const shown = scenario.draft.units.filter(
    (u) =>
      (filter === 'all' || u.category === filter) &&
      `${u.label} ${u.profileId ? unitProfiles[u.profileId].label : ''}`
        .toLowerCase()
        .includes(unitQuery.toLowerCase()),
  );
  const hiddenSelected = selection.filter(
    (id) => !shown.some((u) => u.id === id),
  ).length;
  const locked = !!scenario.pending || scenario.busy || !!scenario.blocked;
  const editing =
    locked ||
    !!scenario.locationEdit ||
    !!scenario.edit ||
    !!scenario.actionEdit ||
    !!scenario.boundaryEdit ||
    !!scenario.placement ||
    scenario.reviewing;
  const impact = deleteIds
    ? scenarioDeletionImpact(scenario.draft, deleteIds)
    : undefined;
  const hasSettingsEdit = !!scenario.locationEdit || !!scenario.boundaryEdit;
  useEffect(() => {
    if (hasSettingsEdit) setSettingsOpen(true);
  }, [hasSettingsEdit]);
  useEffect(() => {
    if (scenario.placement) setPaletteOpen(true);
  }, [scenario.placement]);
  useEffect(() => {
    if (!visible || !scenario.placement) return;
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        runtime.armPlacement();
        event.preventDefault();
      }
    };
    const owner = paneRef.current?.ownerDocument.defaultView;
    owner?.addEventListener('keydown', cancel);
    return () => owner?.removeEventListener('keydown', cancel);
  }, [runtime, visible, scenario.placement]);
  useEffect(() => {
    if (deleteIds && visible) deleteRef.current?.focus();
  }, [deleteIds, visible]);
  useEffect(() => {
    if (!scenario.active || deletionDraft.current !== scenario.draft)
      setDeleteIds(undefined);
  }, [scenario.active, scenario.draft]);
  useLayoutEffect(() => {
    if (visible && bodyRef.current)
      bodyRef.current.scrollTop = bridge.authoringScroll.get('units') ?? 0;
  }, [bridge, visible]);
  useEffect(() => {
    if (!visible) {
      runtime.armPlacement();
      runtime.disarmScenarioLocation();
      runtime.disarmBoundary();
    }
  }, [runtime, visible]);
  useEffect(
    () => () => {
      runtime.armPlacement();
      runtime.disarmScenarioLocation();
      runtime.disarmBoundary();
    },
    [runtime],
  );
  const previousPlacement = useRef(scenario.placement);
  useEffect(() => {
    if (previousPlacement.current && !scenario.placement && visible) {
      setInspectSelection(true);
      const target = returnFocus.current;
      requestAnimationFrame(() => {
        if (target?.isConnected && !target.hasAttribute('disabled'))
          target.focus();
      });
    }
    previousPlacement.current = scenario.placement;
  }, [scenario.placement, visible]);
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
      className="units-pane units-content"
      ref={paneRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && deleteIds) {
          cancelDeletion();
          event.preventDefault();
          event.stopPropagation();
        } else if (event.key === 'Escape' && scenario.placement) {
          runtime.armPlacement();
          event.preventDefault();
        }
      }}
    >
      <div
        className="units-body"
        ref={bodyRef}
        onScroll={(e) =>
          bridge.authoringScroll.set('units', e.currentTarget.scrollTop)
        }
      >
        <details
          className="units-palette orchestrator-disclosure"
          open={paletteOpen || !!scenario.placement}
          onToggle={(e) => setPaletteOpen(e.currentTarget.open)}
        >
          <summary>
            Add units{' '}
            <span>
              {scenario.draft.units.length}/{MAX_SCENARIO_UNITS}
            </span>
          </summary>
          <div aria-label="Unit palette">
            <label className="units-search">
              <Search size={14} />
              <input
                aria-label="Search unit categories"
                placeholder="Find a category or profile"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            {categories
              .filter(
                (c) =>
                  c.name.toLowerCase().includes(query.toLowerCase()) ||
                  profileOptions[c.id].some((id) =>
                    unitProfiles[id].label
                      .toLowerCase()
                      .includes(query.toLowerCase()),
                  ),
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
                    <AffiliationMark category={c.id} />
                    <span>
                      <strong>{c.name}</strong>
                      <small>{c.detail}</small>
                    </span>
                    <Plus size={14} />
                  </button>
                  {(expanded === c.id ||
                    (query.trim() && c.id !== 'unknown')) && (
                    <div
                      className="units-subtypes"
                      aria-label={`${c.id} unit types`}
                    >
                      {profileOptions[c.id]
                        .filter(
                          (id) =>
                            !query.trim() ||
                            c.name
                              .toLowerCase()
                              .includes(query.toLowerCase()) ||
                            unitProfiles[id].label
                              .toLowerCase()
                              .includes(query.toLowerCase()),
                        )
                        .map((id) => (
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
                            <UnitSilhouette profileId={id} />
                            <span className="units-profile-copy">
                              <strong>{unitProfiles[id].label}</strong>
                              <small>
                                {unitProfiles[id].cruiseKmh} km/h
                                {c.id === 'friendly'
                                  ? ` · pursuit ${unitProfiles[id].pursuitKmh}`
                                  : ''}
                              </small>
                            </span>
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              ))}
            <p className="units-hint">
              Choose a category and type, then click the authoring map. Speeds
              are notional simulation profiles. One click places one unit at 150
              m ellipsoid height.
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
                  {bridge.getViewTitle(scenario.placement.viewId as ViewId)} or
                  enter coordinates.{' '}
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
                        <button onClick={() => runtime.beginScenarioLocation()}>
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
          </div>
        </details>

        <section className="units-arrangement" aria-label="Placed units">
          <div className="units-section-title">
            <h2>Arrangement</h2>
            <span>
              {scenario.draft.units.length} units ·{' '}
              {
                scenario.draft.units.filter((u) => u.commandRole === 'sentinel')
                  .length
              }{' '}
              controlled
            </span>
          </div>
          <div className="arrangement-filters">
            <label>
              <span className="sr-only">Find placed units</span>
              <input
                aria-label="Find placed units"
                placeholder="Find placed units"
                value={unitQuery}
                onChange={(e) => setUnitQuery(e.target.value)}
              />
            </label>
            <label>
              <span className="sr-only">Filter placed units</span>
              <select
                aria-label="Filter placed units"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              >
                <option value="all">All affiliations</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div
            className="arrangement-selection"
            role="group"
            aria-label="Unit selection"
          >
            <span role="status">
              {selection.length} selected
              {hiddenSelected ? ` · ${hiddenSelected} hidden by filter` : ''}
            </span>
            <div className="units-actions">
              <button
                disabled={editing || !shown.length}
                onClick={() => {
                  setInspectSelection(false);
                  runtime.selectScenarioUnits([
                    ...new Set([...selection, ...shown.map((u) => u.id)]),
                  ]);
                }}
              >
                Select all shown ({shown.length})
              </button>
              <button
                disabled={editing || !selection.length}
                onClick={() => {
                  setInspectSelection(false);
                  runtime.selectScenarioUnit();
                }}
              >
                Clear selection
              </button>
              <button
                disabled={editing || selection.length !== 1}
                onClick={() => {
                  revealEditor.current = true;
                  setInspectSelection(true);
                  if (inspectSelection) {
                    paneRef.current
                      ?.querySelector<HTMLElement>('.units-editor input')
                      ?.focus();
                    revealEditor.current = false;
                  }
                }}
              >
                Edit selected
              </button>
              <button
                disabled={editing || !selection.length}
                onClick={() => reviewDeletion([...selection])}
              >
                <Trash2 size={13} />
                Delete selected ({selection.length})
              </button>
            </div>
          </div>
          {impact && (
            <div
              ref={deleteRef}
              tabIndex={-1}
              className="units-notice deletion-review"
              role="region"
              aria-label="Review unit deletion"
            >
              <strong>
                Delete {impact.units.length}{' '}
                {impact.units.length === 1 ? 'unit' : 'units'} from this draft?
              </strong>
              <p>{impact.units.map((u) => u.label).join(', ')}</p>
              {impact.actions.length > 0 ? (
                <>
                  <p role="alert">
                    Deletion blocked: {impact.actions.length} scripted actions
                    reference these units. Remove their actions in Conductor
                    first. Dependent actions must be resolved before their
                    predecessors. No units will be deleted.
                  </p>
                  <ul>
                    {impact.actions.map((a) => (
                      <li key={a.id}>
                        {
                          scenario.draft.units.find((u) => u.id === a.unitId)
                            ?.label
                        }{' '}
                        · {a.id}
                        {a.afterActionId ? ' · has predecessor' : ''}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => {
                      setDeleteIds(undefined);
                      bridge.open('conductor');
                    }}
                  >
                    Review actions in Conductor
                  </button>
                </>
              ) : (
                <p>
                  Existing runs and recordings stay unchanged. Save a new
                  revision after deletion.
                </p>
              )}
              <div className="units-actions">
                <button
                  className="units-danger"
                  disabled={editing || !impact.canDelete}
                  onClick={() => {
                    if (
                      deletionDraft.current === scenario.draft &&
                      runtime.deleteScenarioUnits(deleteIds!)
                    ) {
                      setDeleteIds(undefined);
                      requestAnimationFrame(() =>
                        paneRef.current
                          ?.querySelector<HTMLInputElement>(
                            '[aria-label="Find placed units"]',
                          )
                          ?.focus(),
                      );
                    }
                  }}
                >
                  Confirm delete {impact.units.length}
                </button>
                <button onClick={cancelDeletion}>Keep units</button>
              </div>
            </div>
          )}
          {!scenario.draft.units.length ? (
            <p className="units-empty">
              No units yet. Choose a profile above to place your first unit.
            </p>
          ) : !shown.length ? (
            <p className="units-empty">No units match this filter.</p>
          ) : (
            <ul>
              {shown.map((u) => (
                <li
                  key={u.id}
                  className={`arrangement-item units-${u.category}`}
                  data-selected={selection.includes(u.id)}
                >
                  <input
                    type="checkbox"
                    aria-label={`Select unit ${u.label}`}
                    checked={selection.includes(u.id)}
                    disabled={editing}
                    onChange={() => {
                      setInspectSelection(false);
                      runtime.selectScenarioUnit(u.id, true);
                    }}
                  />
                  <button
                    className={`units-row units-${u.category}`}
                    aria-pressed={selection.includes(u.id)}
                    disabled={editing}
                    onClick={(e) => {
                      const additive = e.ctrlKey || e.metaKey || e.shiftKey;
                      setInspectSelection(!additive);
                      revealEditor.current = !additive;
                      runtime.selectScenarioUnit(u.id, additive);
                    }}
                  >
                    <AffiliationMark category={u.category} />
                    <UnitSilhouette profileId={u.profileId} />
                    <span>
                      <strong>{u.label}</strong>
                      <small>
                        {u.profileId
                          ? unitProfiles[u.profileId].label
                          : u.category}{' '}
                        ·{' '}
                        {u.commandRole === 'sentinel'
                          ? 'Controlled'
                          : 'Observation'}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
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
              !!targetMap && scenario.draft.units.length < MAX_SCENARIO_UNITS
            }
            onLocate={() => {
              if (targetMap) runtime.locateScenarioUnit(selected.id, targetMap);
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
            onDelete={() => reviewDeletion([selected.id])}
          />
        )}

        <details
          className="orchestrator-disclosure units-settings"
          open={settingsOpen || hasSettingsEdit}
          onToggle={(e) => setSettingsOpen(e.currentTarget.open)}
        >
          <summary>
            Location & boundaries{' '}
            <span>{scenario.draft.boundaries?.length ?? 0} boundaries</span>
          </summary>
          <ScenarioLocation viewId={targetMap} />
          <BoundaryPanel viewId={targetMap} />
        </details>
      </div>
    </div>
  );
});
