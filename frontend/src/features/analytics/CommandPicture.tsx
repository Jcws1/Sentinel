import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useOperationalRuntime,
  useOperationalSnapshot,
  PaneVisibilityContext,
} from '../../app/OperationalContext';
import type { ApplicationRuntime, RuntimeSnapshot } from '../../app/runtime';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import { EntityFilters } from '../entities/EntityFilters';
import { selectForDetails } from '../entities/selectionActions';
import { ChartHost, barOption } from './ChartHost';
import { altitudeGroup, type CurrentProjection } from './projections';
import { VerticalProfile } from './VerticalProfile';
import { RecordedActivity } from './RecordedActivity';
import './analytics.css';

const lenses = [
  'Overview',
  'Resources',
  'Recorded activity',
  'Statistics',
  'Comparison',
  'Vertical profile',
] as const;
type Lens = (typeof lenses)[number];
export function CommandPicture(props: {
  bridge: WorkspaceBridge;
  vertical?: boolean;
}) {
  const owner = useRef<HTMLDivElement>(null),
    dockVisible = useContext(PaneVisibilityContext);
  const [documentVisible, setDocumentVisible] = useState(true);
  useEffect(() => {
    const doc = owner.current!.ownerDocument;
    const changed = () => setDocumentVisible(!doc.hidden);
    changed();
    doc.addEventListener('visibilitychange', changed);
    return () => doc.removeEventListener('visibilitychange', changed);
  }, []);
  return (
    <div ref={owner} className="analytic-owner">
      <PaneVisibilityContext.Provider value={dockVisible && documentVisible}>
        <CommandPictureContent {...props} />
      </PaneVisibilityContext.Provider>
    </div>
  );
}
function CommandPictureContent({
  bridge,
  vertical = false,
}: {
  bridge: WorkspaceBridge;
  vertical?: boolean;
}) {
  const runtime = useOperationalRuntime()!;
  const state = useOperationalSnapshot(runtime);
  const [lens, setLens] = useState<Lens>('Overview');
  // Hidden dock tabs do not recompute even if their parent rerenders for layout.
  const projection = useMemo(
    () => runtime.analytics.get(state),
    [runtime, state],
  );
  if (!projection)
    return (
      <div className="analytics">
        <h1>{vertical ? 'Vertical Profile' : 'Command Picture'}</h1>
        <p>Load a mission to inspect committed observations.</p>
      </div>
    );
  return (
    <div className="analytics" data-analytic-frame={projection.frame.frameId}>
      <header>
        <span className="constraint-tag">
          {projection.frame.mission.domain.includes('synthetic') ||
          projection.frame.interactive
            ? 'SIMULATION'
            : 'RECORDED DATA'}
        </span>
        <h1>{vertical ? 'Vertical Profile' : 'Command Picture'}</h1>
        <strong>{projection.frame.mission.name}</strong>
        <p className="analytic-context">
          {projection.mode} · {state.presentation.status}
          {state.presentation.sourceDelayed ? ' · source report delayed' : ''}
          <br />
          As of source {projection.frame.effectiveAt} · recorded{' '}
          {projection.frame.recordedAt} · frame {projection.frame.sequence}
        </p>
      </header>
      <div className="analytic-controls">
        <EntityFilters runtime={runtime} state={state} />
        <label>
          Shared entity search
          <input
            value={state.session.filters.search ?? ''}
            onChange={(e) => runtime.setFilters({ search: e.target.value })}
          />
        </label>
        <span>
          {projection.visible.length} filtered / {projection.total} mission
          entities
        </span>
      </div>
      {!vertical && (
        <nav className="analytic-lenses" aria-label="Command Picture lenses">
          {lenses.map((l) => (
            <button
              key={l}
              aria-pressed={lens === l}
              onClick={() => setLens(l)}
            >
              {l}
            </button>
          ))}
        </nav>
      )}
      <div key={projection.frame.mission.id}>
        {vertical || lens === 'Vertical profile' ? (
          <VerticalProfile
            runtime={runtime}
            state={state}
            projection={projection}
            bridge={bridge}
          />
        ) : lens === 'Overview' ? (
          <Overview projection={projection} />
        ) : lens === 'Resources' ? (
          <Resources projection={projection} />
        ) : lens === 'Comparison' ? (
          <Comparison
            projection={projection}
            state={state}
            runtime={runtime}
            bridge={bridge}
          />
        ) : (
          <RecordedActivity
            runtime={runtime}
            frame={projection.frame}
            bridge={bridge}
            statistics={lens === 'Statistics'}
            entityId={
              state.session.selection.primary?.kind === 'entity'
                ? state.session.selection.primary.id
                : undefined
            }
          />
        )}
      </div>
      <footer>
        Sensor confidence, coverage and predictive risk are unavailable. No
        authoritative input supports these analytics.
      </footer>
    </div>
  );
}
function Bars({
  title,
  values,
  unit = 'Count',
}: {
  title: string;
  values: readonly (readonly [string, number | null])[];
  unit?: string;
}) {
  const valuesKey = JSON.stringify(values);
  const option = useMemo(
    () => barOption(JSON.parse(valuesKey), unit),
    [valuesKey, unit],
  );
  return (
    <section className="analytic-card">
      <h3>{title}</h3>
      <ChartHost option={option} label={title} />
      <table>
        <caption>
          {title} · {unit}
        </caption>
        <tbody>
          {values.map(([key, value]) => (
            <tr key={key}>
              <th>{key}</th>
              <td>{value == null ? 'Unknown' : value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
function Overview({ projection: p }: { projection: CurrentProjection }) {
  return (
    <section className="analytic-section">
      <h2>What is present?</h2>
      <p>
        One displayed track per entity, using the same source arbitration and
        filters as the maps. Mission totals include removed and filtered
        identities; a tracking flag is not sensor confidence.
      </p>
      <table>
        <caption>Observation availability · entity counts</caption>
        <thead>
          <tr>
            <th>Observation</th>
            <th>Filtered</th>
            <th>Mission total</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th>Observed / tracking</th>
            <td>{p.observed.current}</td>
            <td>{p.missionObserved.current}</td>
          </tr>
          <tr>
            <th>Stale / unobserved / ended</th>
            <td>{p.observed.stale}</td>
            <td>{p.missionObserved.stale}</td>
          </tr>
          <tr>
            <th>Position unavailable</th>
            <td>{p.observed.unlocated}</td>
            <td>{p.missionObserved.unlocated}</td>
          </tr>
        </tbody>
      </table>
      <div className="analytic-grid">
        <Bars title="Affiliation · filtered entities" values={p.affiliations} />
        <Bars
          title="Classification · filtered entities"
          values={p.classifications}
        />
      </div>
    </section>
  );
}
function Resources({ projection: p }: { projection: CurrentProjection }) {
  return (
    <section className="analytic-section">
      <h2>Which resources are available?</h2>
      <p>
        {p.assets.length} filtered / {p.assetTotal} mission managed Asset
        records; {p.managedVisible} filtered / {p.managedTotal} mission managed
        entities. BLUE / Friendly affiliation alone never establishes management
        or authority.
      </p>
      <table>
        <caption>Distinct resource concepts · filtered scope</caption>
        <tbody>
          <tr>
            <th>Explicit control bindings</th>
            <td>{p.controls?.length ?? 'Unknown / not supplied'}</td>
          </tr>
          <tr>
            <th>Eligible control bindings</th>
            <td>
              {p.controls?.filter((c) => c.eligible).length ??
                'Unknown / not supplied'}
            </td>
          </tr>
          <tr>
            <th>Active intercept assignments</th>
            <td>{p.assignments ?? 'Unknown / not supplied'}</td>
          </tr>
          <tr>
            <th>Explicit reserves (legacy policy)</th>
            <td>{p.reserves ?? 'Not supplied by this policy'}</td>
          </tr>
        </tbody>
      </table>
      <p>
        Eligibility is a recorded control field, not permission to dispatch.
        Occupied resources use explicit assigned availability; execution states
        are shown separately.
      </p>
      <div className="analytic-grid">
        <Bars
          title="Managed Asset availability"
          values={(
            ['available', 'assigned', 'unavailable', 'unknown'] as const
          ).map((k) => [k, p.availability.find(([a]) => a === k)?.[1] ?? 0])}
        />
        <Bars
          title="Managed entity condition"
          values={(
            ['operational', 'degraded', 'non-operational', 'unknown'] as const
          ).map((k) => [k, p.conditions.find(([a]) => a === k)?.[1] ?? 0])}
        />
        {p.executions ? (
          <Bars title="Retained movement executions" values={p.executions} />
        ) : (
          <p>Execution data not supplied.</p>
        )}
      </div>
      <p>
        Execution counts cover the frame’s retained execution list, not lifetime
        command totals. Recorded activity provides the journal.
      </p>
    </section>
  );
}
export function Comparison({
  projection: p,
  state,
  runtime,
  bridge,
}: {
  projection: CurrentProjection;
  state: RuntimeSnapshot;
  runtime: ApplicationRuntime;
  bridge: WorkspaceBridge;
}) {
  const [metric, setMetric] = useState('speed'),
    [wantedGroup, setGroup] = useState(''),
    [find, setFind] = useState('');
  const ids = state.session.selection.items
    .filter((i) => i.kind === 'entity')
    .map((i) => i.id);
  const entries = ids.slice(0, 4).map((id) => ({
    id,
    row: p.rows.find((r) => r.entity.id === id),
  }));
  const rows = entries.map((entry) => entry.row).filter((r) => r !== undefined);
  const groups = [
    ...new Set(
      rows
        .flatMap((r) =>
          r.track
            ? [
                altitudeGroup(
                  r.track.latest.position.altitude,
                  r.track.source.id,
                ),
              ]
            : [],
        )
        .filter((g) => !!g),
    ),
  ];
  const group = groups.includes(wantedGroup) ? wantedGroup : groups[0];
  const measurements = entries.map(({ id, row: r }) => ({
    id,
    row: r,
    value:
      !r || !r.visible || !r.track
        ? null
        : metric === 'speed'
          ? (r.track.latest.velocity?.speedMps ?? null)
          : metric === 'age'
            ? Math.max(
                0,
                (Date.parse(p.frame.effectiveAt) -
                  Date.parse(r.track.latest.timestamp)) /
                  1000,
              )
            : group != null &&
                altitudeGroup(
                  r.track.latest.position.altitude,
                  r.track.source.id,
                ) === group
              ? r.track.latest.position.altitude.metres
              : null,
  }));
  const unit =
    metric === 'speed'
      ? 'm/s'
      : metric === 'age'
        ? 'seconds since source observation'
        : 'm';
  // The runtime/header stays on its current frame. Only unchanged plotted values
  // reuse their option; identities, order, labels, units and missing values count.
  const valuesKey = JSON.stringify(
    measurements.map((m) => [m.id, m.row?.entity.label ?? m.id, m.value]),
  );
  const option = useMemo(() => {
    const values = JSON.parse(valuesKey) as [string, string, number | null][];
    const result = barOption(
      values.map(([, label, value]) => [label, value]),
      unit,
      metric === 'altitude',
    );
    const series = result.series as { data: unknown[] }[];
    series[0].data = values.map(([entityId, , value]) => ({ value, entityId }));
    return result;
  }, [valuesKey, unit, metric]);
  const pick = useCallback(
    (id: string) => selectForDetails(runtime, bridge, id),
    [runtime, bridge],
  );
  const choices = p.visible.filter((r) =>
    `${r.entity.label} ${r.entity.id}`
      .toLowerCase()
      .includes(find.toLowerCase()),
  );
  return (
    <section className="analytic-section">
      <h2>Compare selected entities</h2>
      <p>
        Raw measurements for up to four shared selections. Missing, filtered or
        incompatible values remain unknown. No inferred specifications,
        capability scores or readiness.
      </p>
      <div className="analytic-controls">
        <label>
          Find entity
          <input value={find} onChange={(e) => setFind(e.target.value)} />
        </label>
        <label>
          Add to comparison
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) runtime.selectEntity(e.target.value, true);
            }}
          >
            <option value="">Choose an entity</option>
            {choices.slice(0, 50).map((r) => (
              <option
                key={r.entity.id}
                value={r.entity.id}
                disabled={!ids.includes(r.entity.id) && ids.length >= 4}
              >
                {r.entity.label}
              </option>
            ))}
          </select>
        </label>
        <span>
          First {Math.min(50, choices.length)} of {choices.length} matching
          choices.
        </span>
        <button onClick={() => runtime.selectEntity()}>Clear selection</button>
      </div>
      {ids.length > 4 && (
        <p>Showing the first four of {ids.length} shared selections.</p>
      )}
      <div className="analytic-controls">
        <label>
          Measurement
          <select value={metric} onChange={(e) => setMetric(e.target.value)}>
            <option value="speed">Observed horizontal speed</option>
            <option value="altitude">Source altitude</option>
            <option value="age">Observation age at frame</option>
          </select>
        </label>
        {metric === 'altitude' && (
          <label>
            Common native datum
            <select
              value={group ?? ''}
              onChange={(e) => setGroup(e.target.value)}
            >
              {!groups.length && <option value="">Unavailable</option>}
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <ChartHost
        option={option}
        label={`Entity comparison, ${unit}`}
        onPick={pick}
      />
      <table>
        <caption>
          Committed measurements · {unit}
          {metric === 'altitude' ? ` · ${group ?? 'datum unavailable'}` : ''}
        </caption>
        <thead>
          <tr>
            <th>Entity</th>
            <th>Value</th>
            <th>Observation</th>
            <th>Source time</th>
          </tr>
        </thead>
        <tbody>
          {measurements.map((m) => (
            <tr key={m.id}>
              <td>
                <button onClick={() => pick(m.id)}>
                  {m.row?.entity.label ?? m.id}
                </button>
              </td>
              <td>{m.value == null ? 'Unknown' : m.value.toFixed(2)}</td>
              <td>
                {m.row
                  ? m.row.visible
                    ? m.row.observation
                    : 'Filtered'
                  : 'Unavailable in this frame'}
              </td>
              <td>{m.row?.track?.latest.timestamp ?? 'Unknown'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {!ids.length && (
        <p>Select entities from the maps, Fleet or the chooser above.</p>
      )}
      <p>
        Speed is a supplied observation, not maximum aircraft speed. Age uses
        source/frame time, not wall-clock transport delay. Stale measurements
        are labelled and never extrapolated.
      </p>
    </section>
  );
}
