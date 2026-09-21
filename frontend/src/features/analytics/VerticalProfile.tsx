import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from 'react';
import { PaneVisibilityContext } from '../../app/OperationalContext';
import type { EChartsType } from 'echarts/core';
import type { EChartsOption } from 'echarts';
import type { ApplicationRuntime, RuntimeSnapshot } from '../../app/runtime';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import { selectForDetails } from '../entities/selectionActions';
import { observedSegments } from '../../world/observedSegments';
import { ChartHost, chartBase } from './ChartHost';
import {
  profileColour,
  profileSeries,
  type ProfileDatum,
} from './profileSeries';
import { createProfileLayer, profileMotionBounds } from './profileLayer';
import {
  altitudeGroup,
  capturedOrigin,
  missionOrigin,
  profilePoints,
  radialKm,
  type CurrentProjection,
  type ProfileOrigin,
} from './projections';

export function VerticalProfile({
  runtime,
  state,
  projection,
  bridge,
}: {
  runtime: ApplicationRuntime;
  state: RuntimeSnapshot;
  projection: CurrentProjection;
  bridge: WorkspaceBridge;
}) {
  const [captured, setCaptured] = useState<ProfileOrigin>();
  const layer = useMemo(() => createProfileLayer(), []);
  const [requestedGroup, setGroup] = useState('');
  const [inspectPage, setInspectPage] = useState(0);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyEnabled, setHistoryEnabled] = useState(false),
    [historySeconds, setHistorySeconds] = useState(60);
  const visible = useContext(PaneVisibilityContext),
    demandId = useId();
  useEffect(() => {
    if (visible && historyEnabled)
      runtime.profileHistoryDemand(demandId, historySeconds);
    return () => runtime.profileHistoryDemand(demandId);
  }, [runtime, demandId, visible, historyEnabled, historySeconds]);
  const frame = projection.frame;
  const origin = useMemo(
    () =>
      captured?.missionId === frame.mission.id
        ? captured
        : missionOrigin(frame),
    [captured, frame],
  );
  const points = useMemo(
    () => profilePoints(projection, origin),
    [projection, origin],
  );
  const groups = [
    ...new Set(points.flatMap((p) => (p.group ? [p.group] : []))),
  ].sort();
  const group = groups.includes(requestedGroup) ? requestedGroup : groups[0];
  const included = useMemo(
    () =>
      points.filter(
        (p) => group != null && p.group === group && !p.beforeOrigin,
      ),
    [points, group],
  );
  const primary = state.session.selection.primary;
  const selected =
    primary?.kind === 'entity'
      ? projection.rows.find((r) => r.entity.id === primary.id)
      : undefined;
  const selectedIds = state.session.selection.items
    .filter((i) => i.kind === 'entity')
    .map((i) => i.id);
  const selectedKey = JSON.stringify(selectedIds);
  const filterKey = JSON.stringify(state.session.filters);
  const history =
    historyEnabled && state.observed.status === 'ready'
      ? state.observed.data
      : undefined;
  const historical = useMemo(() => {
    type Point = {
      value: number[];
      name: string;
      timestamp: string;
      entityId: string;
    };
    const result = {
      paths: [] as { data: Point[]; reason: string }[],
      retainedInWindow: 0,
      excludedDatum: 0,
      excludedBeforeOrigin: 0,
      excludedMissingOrigin: 0,
    };
    for (const s of observedSegments(
      frame,
      state.session.filters,
      selected,
      history,
      historySeconds,
    )) {
      let active: Point[] | undefined,
        boundary = false;
      for (const p of s.points) {
        result.retainedInWindow++;
        // Counts use only the displayed track/source and current plot window.
        // Reasons are exclusive; invalid boundaries still break the trajectory.
        if (!origin) result.excludedMissingOrigin++;
        else if (
          group == null ||
          altitudeGroup(p.sample.position.altitude, s.source.id) !== group
        )
          result.excludedDatum++;
        else if (origin.notBefore && p.sample.timestamp < origin.notBefore)
          result.excludedBeforeOrigin++;
        else {
          if (!active) {
            active = [];
            result.paths.push({
              data: active,
              reason: boundary ? 'datum/origin boundary' : s.breakReason,
            });
          }
          active.push({
            value: [
              radialKm(origin, p.sample.position),
              p.sample.position.altitude.metres,
            ],
            name: `Observed\n${p.sample.timestamp}\n${s.source.id}\n${group}`,
            timestamp: p.sample.timestamp,
            entityId: history!.entityId,
          });
          continue;
        }
        active = undefined;
        boundary = true;
      }
    }
    return result;
  }, [frame, filterKey, selected, history, historySeconds, origin, group]);
  const { paths } = historical;
  const markers = useMemo(
    () =>
      included.map((p) => ({
        point: p,
        label: `${p.row.entity.label}\n${p.row.track!.latest.timestamp}\n${p.row.observation} · ${p.altitude.reference}`,
        colour: profileColour(
          p.row.entity.affiliation,
          p.row.observation === 'tracking',
        ),
        size: selectedIds.includes(p.row.entity.id) ? 13 : 8,
      })),
    [included, selectedKey],
  );
  const scatter = useCallback(
    (now?: number): ProfileDatum[] =>
      markers.map(({ point: p, label, colour, size }) => {
        const t = p.row.track!;
        const position =
          now == null || state.presentation.status !== 'current'
            ? t.latest.position
            : runtime.motion.sampleTrack(
                frame.frameId,
                t.id,
                t.latest.position,
                now,
              );
        return [
          radialKm(origin!, position),
          position.altitude.metres,
          p.row.entity.id,
          label,
          colour,
          size,
        ];
        // The semantic selection key avoids recreating a chart on unrelated runtime ticks.
      }),
    [markers, origin, frame.frameId, runtime, state.presentation.status],
  );
  const option = useMemo<EChartsOption>(() => {
    const now = performance.now();
    const bounds = origin
      ? profileMotionBounds(
          origin,
          markers.map(({ point: p }) => ({
            committed: p.row.track!.latest.position,
            current:
              state.presentation.status === 'current'
                ? runtime.motion.sampleTrack(
                    frame.frameId,
                    p.row.track!.id,
                    p.row.track!.latest.position,
                    now,
                  )
                : p.row.track!.latest.position,
          })),
        )
      : [];
    return {
      ...chartBase,
      tooltip: {
        trigger: 'item',
        confine: true,
        // ECharts owns the tooltip DOM; enterable:false lets pointer hits pass
        // through even when confinement places it over the current marker.
        renderMode: 'html',
        triggerOn: 'none',
        enterable: false,
        transitionDuration: 0,
        hideDelay: 0,
        formatter: layer.htmlTooltip,
      },
      xAxis: {
        type: 'value',
        name: 'Distance (km)',
        nameLocation: 'middle',
        nameGap: 28,
        min: 0,
        axisLabel: { hideOverlap: true },
        splitLine: { lineStyle: { color: '#263342' } },
      },
      yAxis: {
        type: 'value',
        name: 'Altitude (m)',
        scale: true,
        splitLine: { lineStyle: { color: '#263342' } },
      },
      series: [
        profileSeries(scatter(now)),
        ...paths.map((s, i) => ({
          id: `history-${i}`,
          name: `Observed · ${s.reason}`,
          type: 'line' as const,
          data: s.data,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { width: 1.5, type: 'dashed' as const, color: '#9db1c4' },
          triggerLineEvent: true,
        })),
        {
          id: 'motion-axis-bounds',
          type: 'scatter',
          data: bounds,
          symbolSize: 0,
          silent: true,
          tooltip: { show: false },
          emphasis: { disabled: true },
        },
      ],
    };
  }, [
    scatter,
    paths,
    origin,
    markers,
    state.presentation.status,
    runtime,
    frame.frameId,
    layer,
  ]);
  const pick = useCallback(
    (id: string) => selectForDetails(runtime, bridge, id),
    [runtime, bridge],
  );
  const onMotion = useCallback(
    (chart: EChartsType, now: number) => {
      layer.paint(
        chart,
        scatter(now),
        pick,
        JSON.stringify([frame.mission.id, frame.streamEpoch, group]),
      );
    },
    [scatter, layer, pick, frame.mission.id, frame.streamEpoch, group],
  );
  const page = Math.min(
    inspectPage,
    Math.max(0, Math.ceil(included.length / 50) - 1),
  );
  const start = page * 50;
  const historyRows = paths.flatMap((s, segment) =>
    s.data.map((p) => ({ ...p, segment, reason: s.reason })),
  );
  const historyIndex = Math.min(
    historyPage,
    Math.max(0, Math.ceil(historyRows.length / 50) - 1),
  );
  return (
    <section
      className="analytic-section"
      aria-label="Vertical engagement profile"
    >
      <div className="analytic-section-heading">
        <h2>Vertical engagement profile</h2>
        <button onClick={() => bridge.openToSide('vertical', 'command')}>
          Open profile to side
        </button>
      </div>
      <p>
        Altitude against radial horizontal distance. This is not a terrain
        cross-section.
      </p>
      <div className="analytic-controls">
        <button onClick={() => setCaptured(undefined)}>
          Use mission reference
        </button>
        <button
          disabled={!capturedOrigin(frame, selected)}
          onClick={() => setCaptured(capturedOrigin(frame, selected))}
        >
          Use selected position as fixed origin
        </button>
        <label>
          Altitude group{' '}
          <select
            value={group ?? ''}
            onChange={(e) => {
              setGroup(e.target.value);
              setInspectPage(0);
            }}
          >
            {!groups.length && <option value="">No compatible altitude</option>}
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="analytic-context">
        Origin:{' '}
        {origin
          ? `${origin.label} · ${origin.latitudeDeg.toFixed(5)}°, ${origin.longitudeDeg.toFixed(5)}°`
          : 'Unavailable — mission has no fixed reference'}
        .
        {origin?.notBefore
          ? ` Captured source time ${origin.notBefore}; earlier history is excluded. The reference stays fixed.`
          : ' Fixed mission origin applies throughout the history range.'}
      </p>
      <p className="analytic-context">
        Axis: {group ?? 'unavailable'}. {included.length} plotted;{' '}
        {projection.visible.length - included.length} excluded (missing
        position, AGL, another datum or before origin capture).
      </p>
      {origin && (
        <ChartHost
          option={option}
          label={`Vertical profile, ${group ?? 'no datum'}`}
          onPick={pick}
          motion={runtime.motion}
          onMotion={onMotion}
          onDispose={layer.dispose}
          replaceSeries
        />
      )}
      <div className="analytic-controls">
        <label>
          <input
            type="checkbox"
            checked={historyEnabled}
            onChange={(e) => setHistoryEnabled(e.target.checked)}
          />{' '}
          Selected observed history
        </label>
        <label>
          History range{' '}
          <select
            value={historySeconds}
            onChange={(e) => setHistorySeconds(Number(e.target.value))}
          >
            {[15, 60, 120, 300].map((n) => (
              <option key={n} value={n}>
                {n} seconds
              </option>
            ))}
          </select>
        </label>
      </div>
      <details>
        <summary>Altitude, presentation and history policy</summary>
        <p>
          No geoid or terrain conversion is configured. Original MSL/ellipsoid
          values are preserved; AGL is excluded. No terrain clearance, sensor
          coverage or engagement feasibility is inferred.
        </p>
        <p className="analytic-context">
          Source time {frame.effectiveAt}. Points use the maps’ bounded current
          interpolation; dim points are last known. Numeric values below are
          committed observations. Dashed lines contain retained observations
          only, with gaps preserved. Hover current markers; inspect historical
          samples in the numeric table below.
        </p>
      </details>
      {historyEnabled && (
        <p role="status">
          History:{' '}
          {history
            ? `${historySeconds}-second plot · retained ${history.windowSeconds}-second read through source ${history.throughAt} · ${paths.reduce((n, p) => n + p.data.length, 0)} compatible samples${history.truncated ? ' · bounded/incomplete (recording retained)' : ''}`
            : state.observed.status === 'error'
              ? `Unavailable · ${state.observed.error ?? 'Observed history read failed'}`
              : `${state.observed.status} · ${selected ? 'reading retained observations' : 'select an entity with observations'}`}
          . No prediction or replay.
          {history && (
            <>
              {' '}
              Plot window ends at source {frame.effectiveAt}; expired points are
              clipped while refreshing. Live history refreshes at most once per
              second, unless the map also requests history. Of{' '}
              {historical.retainedInWindow} retained samples in this
              track/source plot window,{' '}
              {historical.excludedDatum +
                historical.excludedBeforeOrigin +
                historical.excludedMissingOrigin}{' '}
              excluded: {historical.excludedDatum} incompatible altitude,{' '}
              {historical.excludedBeforeOrigin} before captured origin,{' '}
              {historical.excludedMissingOrigin} without an origin.
            </>
          )}
          {state.observed.status === 'error' && (
            <button onClick={() => runtime.retryHistory()}>
              Retry history
            </button>
          )}
        </p>
      )}
      {historyEnabled && historyRows.length > 0 && (
        <details>
          <summary>
            Inspect {historyRows.length} plotted historical observations
          </summary>
          <div className="analytic-table-scroll">
            <table>
              <caption>
                Retained observed points · {group} · source time · fixed origin
              </caption>
              <thead>
                <tr>
                  <th>Source UTC</th>
                  <th>Distance km</th>
                  <th>Altitude m</th>
                  <th>Segment / break</th>
                </tr>
              </thead>
              <tbody>
                {historyRows
                  .slice(historyIndex * 50, historyIndex * 50 + 50)
                  .map((p, i) => (
                    <tr key={`${p.segment}-${p.timestamp}-${i}`}>
                      <td>{p.timestamp}</td>
                      <td>{p.value[0].toFixed(3)}</td>
                      <td>{p.value[1].toFixed(2)}</td>
                      <td>
                        {p.segment + 1} · {p.reason}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <div className="analytic-controls">
            <button
              disabled={historyIndex === 0}
              onClick={() => setHistoryPage(historyIndex - 1)}
            >
              Previous observations
            </button>
            <span>
              {historyIndex * 50 + 1}–
              {Math.min(historyIndex * 50 + 50, historyRows.length)} of{' '}
              {historyRows.length}
            </span>
            <button
              disabled={(historyIndex + 1) * 50 >= historyRows.length}
              onClick={() => setHistoryPage(historyIndex + 1)}
            >
              Next observations
            </button>
          </div>
        </details>
      )}
      <div className="analytic-table-scroll">
        <table>
          <caption>
            Committed positions · {included.length} compatible of{' '}
            {projection.visible.length} filtered entities
          </caption>
          <thead>
            <tr>
              <th>Entity</th>
              <th>Distance km</th>
              <th>Altitude m</th>
              <th>Observation / source time</th>
            </tr>
          </thead>
          <tbody>
            {included.slice(start, start + 50).map((p) => (
              <tr key={p.row.entity.id}>
                <td>
                  <button
                    aria-pressed={selectedIds.includes(p.row.entity.id)}
                    onClick={() => pick(p.row.entity.id)}
                  >
                    {p.row.entity.label || p.row.entity.id}
                  </button>
                </td>
                <td>{p.distanceKm.toFixed(3)}</td>
                <td>
                  {p.altitude.metres.toFixed(2)} {p.altitude.reference}
                </td>
                <td>
                  {p.row.observation} · {p.row.track!.latest.timestamp}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {included.length > 50 && (
        <div className="analytic-controls">
          <button
            disabled={page === 0}
            onClick={() => setInspectPage(page - 1)}
          >
            Previous positions
          </button>
          <span>
            {start + 1}–{Math.min(start + 50, included.length)} of{' '}
            {included.length}
          </span>
          <button
            disabled={start + 50 >= included.length}
            onClick={() => setInspectPage(page + 1)}
          >
            Next positions
          </button>
        </div>
      )}
    </section>
  );
}
