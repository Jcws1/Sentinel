import {
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { EChartsOption } from 'echarts';
import { PaneVisibilityContext } from '../../app/OperationalContext';
import type { ApplicationRuntime } from '../../app/runtime';
import type { AuditQuery } from '../../contracts/generated';
import type { ImmutableFrame } from '../../contracts/types';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import { selectForDetails } from '../entities/selectionActions';
import { ChartHost, chartBase } from './ChartHost';
import { ObservedTelemetry } from './ObservedTelemetry';

const dormant = () => () => {};
const rangeStart = (at: string, minutes: number) =>
  new Date(Date.parse(at) - minutes * 60000).toISOString();
export function RecordedActivity({
  runtime,
  frame,
  bridge,
  statistics,
  entityId,
}: {
  runtime: ApplicationRuntime;
  frame: ImmutableFrame;
  bridge: WorkspaceBridge;
  statistics: boolean;
  entityId?: string;
}) {
  const visible = useContext(PaneVisibilityContext);
  const state = useSyncExternalStore(
    visible ? runtime.audit.subscribe : dormant,
    runtime.audit.get,
  );
  const [anchor, setAnchor] = useState(frame);
  const [from, setFrom] = useState(rangeStart(frame.recordedAt, 15)),
    [to, setTo] = useState(frame.recordedAt);
  const [search, setSearch] = useState(''),
    [kind, setKind] = useState<AuditQuery['kind']>('all');
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]);
  const [ceiling, setCeiling] = useState<number>();
  const query = useMemo<AuditQuery>(
    () => ({
      frameId: anchor.frameId,
      fromAt: from,
      toAt: to,
      search,
      kind,
      limit: 50,
    }),
    [anchor.frameId, from, to, search, kind],
  );
  const validRange =
    Number.isFinite(Date.parse(from)) &&
    Number.isFinite(Date.parse(to)) &&
    Date.parse(from) <= Date.parse(to) &&
    Date.parse(to) - Date.parse(from) <= 86400000 &&
    to <= anchor.recordedAt;
  const read = (after?: string, initial = false) => {
    if (!validRange) return;
    void runtime.audit.query(frame.mission.id, {
      ...query,
      after,
      receiptCeiling: initial ? undefined : ceiling,
    });
  };
  useEffect(() => {
    if (!visible) return;
    void runtime.audit.query(frame.mission.id, query);
    // Mount/reopen captures a declared cutoff. Live frames never move it.
  }, [runtime, visible, frame.mission.id]);
  useEffect(() => {
    if (state.data) setCeiling(state.data.receiptCeiling);
  }, [state.data]);
  const invalidate = () => {
    runtime.audit.invalidate();
    setCursors([undefined]);
    setCeiling(undefined);
  };
  const data = state.data,
    summary = data?.summary;
  const option = useMemo<EChartsOption>(
    () => ({
      ...chartBase,
      legend: {
        data: ['Events', 'Requests', 'Outcomes'],
        textStyle: { color: '#bcc9d5' },
      },
      xAxis: {
        type: 'category',
        data: summary?.buckets.map((b) => b.fromAt.slice(11, 23)) ?? [],
        axisLabel: { rotate: 30 },
      },
      yAxis: { type: 'value', minInterval: 1, name: 'Recorded rows' },
      series: (['events', 'requests', 'outcomes'] as const).map((key, i) => ({
        type: 'bar',
        name: ['Events', 'Requests', 'Outcomes'][i],
        data: summary?.buckets.map((b) => b[key]) ?? [],
      })),
    }),
    [summary],
  );
  return (
    <section
      className="analytic-section"
      aria-label={
        statistics ? 'Mission statistics' : 'Recorded operational audit'
      }
    >
      <h2>{statistics ? 'Mission statistics' : 'Recorded activity'}</h2>
      <p>
        Recorded operational audit. States are those recorded at each row, not a
        tamper-proof compliance log. Requests and their resulting events are
        separate records; exact retries add no new identity.
      </p>
      <div className="analytic-controls">
        <label>
          From UTC
          <input
            aria-label="Audit from UTC"
            value={from}
            onChange={(e) => {
              invalidate();
              setFrom(e.target.value);
            }}
          />
        </label>
        <label>
          Through UTC
          <input
            aria-label="Audit through UTC"
            value={to}
            onChange={(e) => {
              invalidate();
              setTo(e.target.value);
            }}
          />
        </label>
      </div>
      <div className="analytic-controls">
        <label>
          Audit search
          <input
            value={search}
            onChange={(e) => {
              invalidate();
              setSearch(e.target.value);
            }}
            placeholder="Literal recorded identity, type or detail"
          />
        </label>
        <label>
          Records
          <select
            value={kind}
            onChange={(e) => {
              invalidate();
              setKind(e.target.value as AuditQuery['kind']);
            }}
          >
            <option value="all">Requests and events</option>
            <option value="request">Requests</option>
            <option value="event">Events</option>
          </select>
        </label>
        <button
          disabled={!validRange || state.status === 'loading'}
          onClick={() => {
            setCursors([undefined]);
            read(undefined, true);
          }}
        >
          Read range
        </button>
        <button
          onClick={() => {
            invalidate();
            setAnchor(frame);
            setFrom(rangeStart(frame.recordedAt, 15));
            setTo(frame.recordedAt);
          }}
        >
          Use latest cutoff
        </button>
      </div>
      {!validRange && (
        <p role="alert">
          Enter an ordered UTC range of at most 24 hours, ending at or before
          the cutoff.
        </p>
      )}
      <p className="analytic-context">
        Pinned recording cutoff: {anchor.recordedAt} · frame {anchor.sequence}.
        Source time: {anchor.effectiveAt}. Range uses recording time, including
        paused-time commands. Shared map filters do not filter this journal; use
        Audit search/Records.
      </p>
      <p>
        Interactive receipts include recorded rejections. External
        pre-validation rejections and local unsent requests are not journaled.
        External interruption has no historical timestamp: use Simulation for
        current recovery status. This view does not move mission time or
        dispatch commands.
      </p>
      {state.status === 'error' && <p role="alert">{state.error}</p>}
      {state.status === 'loading' && (
        <p role="status">Reading the recording…</p>
      )}
      {state.status === 'idle' && (
        <p role="status">Choose Read range to inspect this cutoff.</p>
      )}
      {summary && (
        <>
          <p role="status">
            {summary.complete
              ? 'Complete range summary'
              : 'INCOMPLETE SUMMARY — first 20,000 matching rows only; narrow the range. Pagination still reaches remaining rows.'}{' '}
            · {summary.inspectedRows} rows ·{' '}
            {Object.values(summary.eventCounts).reduce((a, b) => a + b, 0)}{' '}
            events ·{' '}
            {Object.values(summary.requestStates).reduce((a, b) => a + b, 0)}{' '}
            requests
          </p>
          {statistics && (
            <>
              <ChartHost
                option={option}
                label="Recorded activity in twelve recording-time buckets"
              />
              <div className="analytic-table-scroll">
                <table>
                  <caption>
                    Recording-time buckets · outcomes are a subset of events
                  </caption>
                  <thead>
                    <tr>
                      <th>From UTC</th>
                      <th>Through UTC</th>
                      <th>Events</th>
                      <th>Requests</th>
                      <th>Outcomes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.buckets.map((b) => (
                      <tr key={b.fromAt}>
                        <td>{b.fromAt}</td>
                        <td>{b.toAt}</td>
                        <td>{b.events}</td>
                        <td>{b.requests}</td>
                        <td>{b.outcomes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="analytic-grid">
                <Counts title="Event types" values={summary.eventCounts} />
                <Counts
                  title="Request states at receipt"
                  values={summary.requestStates}
                />
                <Counts
                  title="Recorded interactions/outcomes"
                  values={summary.outcomeCounts}
                />
              </div>
              <p>
                {summary.affectedEntities} distinct affected entities with a
                recorded nonzero health change or simulated loss. An interaction
                counts once per recorded identity, including NO_EFFECT; affected
                entities count once across the range. Distinct commands are
                distinct evaluations. These are simulation outcomes, not
                real-world effectiveness.
              </p>
            </>
          )}
        </>
      )}
      {statistics && (
        <ObservedTelemetry
          runtime={runtime}
          anchor={anchor}
          entityId={entityId}
        />
      )}
      {!statistics && data && (
        <>
          <ol className="audit-list">
            {data.rows.map((row) => (
              <li key={row.id}>
                <div className="audit-row-heading">
                  <span className="constraint-tag">{row.kind}</span>
                  <strong>{row.type}</strong>
                  <span>
                    {row.state ?? 'State not supplied'}
                    {row.outcome ? ` · ${row.outcome}` : ''}
                  </span>
                </div>
                <div className="analytic-context">
                  Recorded {row.recordedAt}
                  {row.effectiveAt
                    ? ` · source ${row.effectiveAt}`
                    : ' · source time not supplied'}{' '}
                  · sequence {row.sequence}
                </div>
                <div>
                  Identity <code>{row.identity}</code>
                  {row.commandId && (
                    <>
                      {' '}
                      · request <code>{row.commandId}</code>
                    </>
                  )}
                </div>
                <div className="analytic-controls">
                  {(row.entityIds ?? []).map((id) => (
                    <button
                      key={id}
                      disabled={!frame.entities[id]}
                      title={
                        frame.entities[id]
                          ? 'Inspect in shared Details'
                          : 'Entity is absent from the current presented frame; original identity retained'
                      }
                      onClick={() => selectForDetails(runtime, bridge, id)}
                    >
                      {frame.entities[id]?.label || id}
                    </button>
                  ))}
                </div>
                <details>
                  <summary>Recorded detail</summary>
                  <pre>{row.detail}</pre>
                </details>
              </li>
            ))}
          </ol>
          {!data.rows.length && <p>No matching recorded rows in this range.</p>}
          <div className="analytic-controls">
            <button
              disabled={cursors.length <= 1 || state.status === 'loading'}
              onClick={() => {
                const next = cursors.slice(0, -1);
                setCursors(next);
                read(next[next.length - 1]);
              }}
            >
              Previous records
            </button>
            <button
              disabled={state.status === 'loading'}
              onClick={() => {
                setCursors([undefined]);
                read();
              }}
            >
              First page
            </button>
            <span>
              {data.rows.length} rows on this page ·{' '}
              {data.nextAfter ? 'more recorded rows' : 'end of range'}
            </span>
            <button
              disabled={!data.nextAfter || state.status === 'loading'}
              onClick={() => {
                if (data.nextAfter) {
                  setCursors([...cursors.slice(-99), data.nextAfter]);
                  read(data.nextAfter);
                }
              }}
            >
              Next records
            </button>
          </div>
        </>
      )}
    </section>
  );
}
function Counts({
  title,
  values,
}: {
  title: string;
  values: Record<string, number>;
}) {
  return (
    <table>
      <caption>{title}</caption>
      <tbody>
        {Object.entries(values).map(([k, v]) => (
          <tr key={k}>
            <th>{k}</th>
            <td>{v}</td>
          </tr>
        ))}
        {!Object.keys(values).length && (
          <tr>
            <td>None recorded</td>
            <td>0</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
