import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Play, Save } from 'lucide-react';
import {
  PaneVisibilityContext,
  useOperationalRuntime,
  useOperationalSnapshot,
} from '../../app/OperationalContext';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import { viewKind, type ViewId } from '../workspace/viewRegistry';
import { UnitsPane } from '../units/UnitsPane';
import { ConductorPane } from '../conductor/ConductorPane';
import { ScenarioRunReview } from '../conductor/ScenarioRunReview';
import { LiveBoundaryList } from '../units/BoundaryPanel';
import { missionDisplayName } from '../mission/MissionControls';
import { originFor } from '../../world/localGeometry';
import type { ScenarioContent } from '../../contracts/generated';
import './orchestrator.css';

export function OrchestratorPane({
  bridge,
  visible,
}: {
  bridge: WorkspaceBridge;
  visible: boolean;
}) {
  const runtime = useOperationalRuntime()!,
    state = useOperationalSnapshot(runtime),
    s = state.scenario;
  const workspace = useSyncExternalStore(bridge.subscribe, bridge.getSnapshot);
  const tab = workspace.orchestratorTab;
  const [mapId, setMapId] = useState<ViewId>('tactical');
  const [loadId, setLoadId] = useState('');
  const [replace, setReplace] = useState<'new' | 'load'>();
  const [reviewOpen, setReviewOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null),
    notice = useRef<HTMLDivElement>(null);
  const previousActive = useRef(s.active);
  const frame = state.presentation.frame;
  const maps = workspace.views.filter(
    (v) => ['tactical', 'three-d'].includes(viewKind(v.id)) && v.selectedInPane,
  );
  const targetMap = maps.some((v) => v.id === mapId) ? mapId : maps[0]?.id;
  const activeId = state.interactive.entry?.activeMissionId;
  const activeMission = state.catalog.missions.find((m) => m.id === activeId);
  const origin = originFor(s.draft);
  const inlineError =
    tab === 'units' &&
    !reviewOpen &&
    !!(s.edit || s.placement || s.boundaryEdit);
  const editLabel = s.locationEdit
    ? 'origin change'
    : s.edit
      ? 'unit edit'
      : s.boundaryEdit
        ? 'boundary edit'
        : s.actionEdit
          ? 'action edit'
          : s.placement
            ? 'unit placement'
            : undefined;
  const locked =
    !!s.pending || s.busy || !!s.blocked || !!editLabel || s.reviewing;
  const launching =
    state.interactive.busy ||
    !!state.interactive.pending ||
    state.interactive.startingDemo;
  const runReason = s.pending
    ? 'Reconcile the pending save before editing or running.'
    : s.blocked
      ? 'Resolve the saved draft error before continuing.'
      : editLabel
        ? `Finish or cancel the ${editLabel} before Save, Validate or Run.`
        : activeId
          ? `Active demo: ${missionDisplayName(activeMission)}. End it before starting another run.`
          : s.dirty || !s.saved
            ? 'Save this draft, then validate its saved revision.'
            : !s.review?.canRun
              ? 'Validate this saved revision before Run.'
              : `Run creates a new mission from saved revision ${s.saved.revision}.`;
  useEffect(() => {
    if (previousActive.current && !s.active) {
      setReviewOpen(false);
      bridge.setOrchestratorTab('conductor');
    }
    previousActive.current = s.active;
  }, [s.active, bridge]);
  useEffect(() => {
    if (!s.review) setReviewOpen(false);
  }, [s.review]);
  useLayoutEffect(() => {
    if (visible && reviewOpen && s.review)
      root.current
        ?.querySelector<HTMLElement>(
          '[aria-label="Scenario validation review"]',
        )
        ?.focus();
  }, [visible, reviewOpen, s.review]);
  useEffect(() => {
    if (s.error && visible) notice.current?.focus();
  }, [s.error, visible]);
  function chooseTab(next: 'units' | 'conductor', focus = false) {
    setReviewOpen(false);
    bridge.setOrchestratorTab(next);
    if (focus)
      root.current
        ?.querySelector<HTMLButtonElement>(`#orchestrator-tab-${next}`)
        ?.focus();
  }
  function replaceDraft(kind: 'new' | 'load') {
    setReplace(undefined);
    runtime.selectScenarioUnit();
    if (kind === 'new') runtime.newScenario();
    else void runtime.loadScenario(loadId || s.saved?.definitionId || '');
  }
  function requestReplace(kind: 'new' | 'load') {
    if (s.dirty) setReplace(kind);
    else replaceDraft(kind);
  }
  async function validate() {
    await runtime.validateScenario();
    if (runtime.getSnapshot().scenario.review) {
      setReviewOpen(true);
    }
  }
  return (
    <div className="units-pane orchestrator-pane" ref={root}>
      <header className="orchestrator-header">
        <div className="orchestrator-status">
          <span>{s.active ? 'SCENARIO AUTHORING' : 'SCENARIO INSPECTION'}</span>
          <strong>
            {s.active
              ? editLabel
                ? `Unapplied ${editLabel}`
                : s.pending
                  ? 'Save pending'
                  : s.dirty
                    ? `${s.saved ? `r${s.saved.revision} · ` : ''}Unsaved changes`
                    : s.saved
                      ? `Saved r${s.saved.revision}`
                      : 'Draft'
              : (frame?.interactive?.state ?? 'No run selected')}
          </strong>
        </div>
        {s.active ? (
          <label className="orchestrator-name">
            <span className="sr-only">Arrangement name</span>
            <input
              aria-label="Arrangement name"
              disabled={locked}
              maxLength={80}
              value={s.draft.name}
              onChange={(e) =>
                runtime.updateScenario({
                  ...structuredClone(s.draft),
                  name: e.target.value,
                } as ScenarioContent)
              }
            />
          </label>
        ) : (
          <strong className="orchestrator-title">
            {frame?.scenario?.name ?? 'Scenario workspace'}
            {frame?.scenario ? ` · r${frame.scenario.revision}` : ''}
          </strong>
        )}
        {s.active && (
          <div className="orchestrator-meta">
            <span>
              {s.draft.units.length}/40 units · {s.draft.actions?.length ?? 0}
              /128 actions
            </span>
            <button
              disabled={locked}
              onClick={() => {
                chooseTab('units');
                runtime.beginScenarioLocation();
              }}
            >
              Location · {origin.latitudeDeg.toFixed(3)}°,{' '}
              {origin.longitudeDeg.toFixed(3)}°
            </button>
          </div>
        )}
      </header>
      <div
        className="orchestrator-tabs"
        role="tablist"
        aria-label="Orchestrator sections"
        onKeyDown={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            chooseTab(
              e.key === 'Home'
                ? 'units'
                : e.key === 'End'
                  ? 'conductor'
                  : tab === 'units'
                    ? 'conductor'
                    : 'units',
              true,
            );
          }
        }}
      >
        {(['units', 'conductor'] as const).map((t) => (
          <button
            key={t}
            id={`orchestrator-tab-${t}`}
            role="tab"
            aria-selected={tab === t}
            aria-controls={`orchestrator-panel-${t}`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => chooseTab(t)}
          >
            {t === 'units' ? 'Units' : 'Conductor'}
          </button>
        ))}
      </div>
      {s.active && (
        <details className="orchestrator-document">
          <summary>Scenario file & authoring map</summary>
          <div>
            <div className="units-actions">
              <button disabled={locked} onClick={() => requestReplace('new')}>
                New scenario
              </button>
              <button
                disabled={locked || !s.saved}
                onClick={() => void runtime.saveScenario(true)}
              >
                Save as new
              </button>
            </div>
            <div className="units-load">
              <select
                aria-label="Saved arrangements"
                disabled={locked}
                value={loadId || s.saved?.definitionId || ''}
                onChange={(e) => setLoadId(e.target.value)}
              >
                <option value="">Saved arrangements…</option>
                {s.catalog.map((r) => (
                  <option key={r.definitionId} value={r.definitionId}>
                    {r.content.name} · r{r.revision}
                  </option>
                ))}
              </select>
              <button
                disabled={locked || !(loadId || s.saved?.definitionId)}
                onClick={() => requestReplace('load')}
              >
                Load latest
              </button>
            </div>
            <label>
              Authoring map
              <select
                aria-label="Authoring map"
                value={targetMap ?? ''}
                disabled={locked}
                onChange={(e) => {
                  runtime.armPlacement();
                  runtime.disarmBoundary();
                  runtime.disarmScenarioLocation();
                  runtime.disarmAction();
                  setMapId(e.target.value as ViewId);
                }}
              >
                {!maps.length && <option value="">Open a map to author</option>}
                {maps.map((m) => (
                  <option key={m.id} value={m.id}>
                    {bridge.getViewTitle(m.id)}
                  </option>
                ))}
              </select>
            </label>
            {replace && (
              <div className="units-notice" role="alert">
                <p>
                  Replace the unsaved draft? Saved revisions remain available.
                </p>
                <button disabled={locked} onClick={() => replaceDraft(replace)}>
                  Replace draft
                </button>
                <button onClick={() => setReplace(undefined)}>
                  Keep editing
                </button>
              </div>
            )}
          </div>
        </details>
      )}
      {s.active && ((s.error && !inlineError) || s.pending) && (
        <div
          className="orchestrator-notice units-notice"
          tabIndex={-1}
          ref={notice}
          role="alert"
        >
          <p>
            {s.error ??
              (s.busy
                ? 'Saving the exact request…'
                : 'Save outcome unknown. The exact request is retained.')}
          </p>
          {s.pending && (
            <div className="units-actions">
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
        </div>
      )}
      <div className="orchestrator-content">
        <div
          id="orchestrator-panel-units"
          role="tabpanel"
          aria-labelledby="orchestrator-tab-units"
          hidden={tab !== 'units' || reviewOpen}
        >
          <PaneVisibilityContext.Provider
            value={visible && tab === 'units' && !reviewOpen}
          >
            {s.active ? (
              <UnitsPane
                bridge={bridge}
                targetMap={targetMap}
                visible={visible && tab === 'units' && !reviewOpen}
              />
            ) : (
              <div className="units-intro">
                <p>
                  Arrange units and boundaries in a scenario draft. Open the
                  editor below to create or revise a plan.
                </p>
                <LiveBoundaryList />
              </div>
            )}
          </PaneVisibilityContext.Provider>
        </div>
        <div
          id="orchestrator-panel-conductor"
          role="tabpanel"
          aria-labelledby="orchestrator-tab-conductor"
          hidden={tab !== 'conductor' || reviewOpen}
        >
          <PaneVisibilityContext.Provider
            value={visible && tab === 'conductor' && !reviewOpen}
          >
            <ConductorPane
              bridge={bridge}
              visible={visible && tab === 'conductor' && !reviewOpen}
              mapId={targetMap}
              setMapId={setMapId}
            />
          </PaneVisibilityContext.Provider>
        </div>
        {reviewOpen && (
          <div className="orchestrator-review">
            <button onClick={() => chooseTab(tab, true)}>
              Back to {tab === 'units' ? 'Units' : 'Conductor'}
            </button>
            <ScenarioRunReview />
          </div>
        )}
      </div>
      <footer
        className="orchestrator-lifecycle"
        aria-label="Saved scenario launch"
      >
        {s.active ? (
          <>
            <div className="orchestrator-launch-actions">
              <button
                aria-label="Save revision"
                disabled={
                  locked || !s.draft.name.trim() || (!s.dirty && !!s.saved)
                }
                onClick={() => void runtime.saveScenario()}
              >
                <Save size={13} />
                Save
              </button>
              <button
                aria-label="Validate saved revision"
                disabled={locked || s.dirty || !s.saved}
                onClick={() => void validate()}
              >
                {s.reviewing ? 'Validating…' : 'Validate'}
              </button>
              <button
                aria-label={`Run saved revision ${s.saved?.revision ?? ''}`}
                className="units-primary"
                disabled={
                  locked ||
                  launching ||
                  s.dirty ||
                  !s.saved ||
                  !s.review?.canRun ||
                  !s.draft.units.length ||
                  !!activeId
                }
                onClick={() => void runtime.runScenario()}
              >
                <Play size={13} />
                Run {s.saved ? `r${s.saved.revision}` : ''}
              </button>
            </div>
            <p>{runReason}</p>
            {s.review && !reviewOpen && (
              <button
                className="orchestrator-review-link"
                onClick={() => setReviewOpen(true)}
              >
                {s.review.canRun ? 'Ready to run' : 'Review needs attention'} ·
                r{s.review.reference.revision} · View validation
              </button>
            )}
            {s.message && (
              <p className="units-save-status" role="status">
                {s.message}
              </p>
            )}
            {activeId && (
              <button onClick={() => runtime.loadMission(activeId)}>
                Return to active demo
              </button>
            )}
          </>
        ) : (
          <>
            <button
              className="units-primary"
              disabled={launching}
              onClick={() => runtime.enterAuthoring()}
            >
              Open scenario editor
            </button>
            <p>
              {activeId
                ? 'The active demo continues while you edit a separate draft.'
                : 'Create or revise a saved scenario. Recorded runs remain unchanged.'}
            </p>
          </>
        )}
        {state.interactive.pending && (
          <button
            disabled={state.interactive.busy}
            onClick={() => void runtime.reconcileInteractive(true)}
          >
            {state.interactive.pending.missionId
              ? 'Retry pending command'
              : 'Retry Run request'}
          </button>
        )}
        {state.interactive.error && (
          <p role="alert">{state.interactive.error}</p>
        )}
      </footer>
    </div>
  );
}
