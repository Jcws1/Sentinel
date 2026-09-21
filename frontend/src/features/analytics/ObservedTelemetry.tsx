import { useContext, useEffect, useMemo, useState } from 'react';
import type { ApplicationRuntime } from '../../app/runtime';
import type { ImmutableFrame, DeepReadonly } from '../../contracts/types';
import type { ObservedHistory } from '../../contracts/generated';
import { PaneVisibilityContext } from '../../app/OperationalContext';
import { altitudeGroup } from './projections';
import { assertHistoryAnchor } from '../../world/observedHistory';

function summary(values: number[]) {
  return values.length
    ? {
        count: values.length,
        min: Math.min(...values),
        max: Math.max(...values),
        mean: values.reduce((a, b) => a + b, 0) / values.length,
      }
    : undefined;
}
export function summarizeTelemetry(history: DeepReadonly<ObservedHistory>) {
  const seen = new Set<string>(),
    speeds: number[] = [],
    heights = new Map<string, number[]>();
  let samples = 0,
    missingSpeed = 0,
    excludedAltitude = 0;
  for (const s of history.segments)
    for (const p of s.points) {
      const key = JSON.stringify([
        s.trackId,
        s.historySeriesId,
        s.source,
        p.sample.timestamp,
      ]);
      if (seen.has(key)) continue;
      seen.add(key);
      samples++;
      if (p.sample.velocity?.speedMps != null)
        speeds.push(p.sample.velocity.speedMps);
      else missingSpeed++;
      const group = altitudeGroup(p.sample.position.altitude, s.source.id);
      if (group) {
        const values = heights.get(group) ?? [];
        values.push(p.sample.position.altitude.metres);
        heights.set(group, values);
      } else excludedAltitude++;
    }
  return {
    samples,
    missingSpeed,
    excludedAltitude,
    speed: summary(speeds),
    altitudes: [...heights].map(([group, values]) => ({
      group,
      ...summary(values)!,
    })),
  };
}
export function ObservedTelemetry({
  runtime,
  anchor,
  entityId,
}: {
  runtime: ApplicationRuntime;
  anchor: ImmutableFrame;
  entityId?: string;
}) {
  const visible = useContext(PaneVisibilityContext),
    [seconds, setSeconds] = useState(60);
  const [result, setResult] = useState<{
    key: string;
    data?: ObservedHistory;
    error?: string;
  }>();
  const key = JSON.stringify([
    anchor.mission.id,
    anchor.frameId,
    entityId,
    seconds,
  ]);
  useEffect(() => {
    if (!visible || !entityId) return;
    const abort = new AbortController();
    let current = true;
    const timer = setTimeout(() => {
      current = false;
      abort.abort();
      setResult({ key, error: 'Observed telemetry read timed out.' });
    }, 10000);
    void runtime
      .readObservedHistory(
        anchor.mission.id,
        entityId,
        anchor.frameId,
        seconds,
        abort.signal,
      )
      .then((data) => {
        assertHistoryAnchor(data, anchor, entityId, seconds);
        if (current) setResult({ key, data });
      })
      .catch((error) => {
        if (current) setResult({ key, error: String(error) });
      })
      .finally(() => clearTimeout(timer));
    return () => {
      current = false;
      clearTimeout(timer);
      abort.abort();
    };
  }, [runtime, visible, anchor, entityId, seconds, key]);
  const data = result?.key === key ? result.data : undefined;
  const stats = useMemo(
    () => (data ? summarizeTelemetry(data) : undefined),
    [data],
  );
  return (
    <section className="analytic-section">
      <h3>Selected observed telemetry at the audit cutoff</h3>
      <p>
        Separate source-time range: the last {seconds} seconds ending{' '}
        {anchor.effectiveAt}. Each retained track/source/series/timestamp counts
        once; the existing history query applies correction precedence.
        Arithmetic means weight observations equally, not elapsed time. Missing
        samples are excluded, never zero.
      </p>
      <label>
        Telemetry window{' '}
        <select
          value={seconds}
          onChange={(e) => setSeconds(Number(e.target.value))}
        >
          {[15, 60, 120, 300].map((n) => (
            <option key={n} value={n}>
              {n} seconds
            </option>
          ))}
        </select>
      </label>
      {!entityId ? (
        <p>
          Select an entity in the map or Fleet for retained sample statistics.
        </p>
      ) : result?.key === key && result.error ? (
        <p role="alert">{result.error}</p>
      ) : !stats ? (
        <p>Reading bounded observations…</p>
      ) : (
        <>
          <p>
            {stats.samples} retained observations; {stats.missingSpeed} without
            speed; {stats.excludedAltitude} AGL samples excluded from
            common-altitude statistics.{' '}
            {data?.truncated
              ? 'INCOMPLETE bounded history; recording remains intact.'
              : 'Complete within the returned history bounds.'}
          </p>
          <table>
            <caption>
              Observed telemetry ·{' '}
              {anchor.entities[entityId]?.label ?? entityId}
            </caption>
            <thead>
              <tr>
                <th>Measurement</th>
                <th>Samples</th>
                <th>Minimum</th>
                <th>Mean</th>
                <th>Maximum</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Horizontal speed m/s</th>
                <td>{stats.speed?.count ?? 0}</td>
                <td>{stats.speed?.min.toFixed(2) ?? 'Unknown'}</td>
                <td>{stats.speed?.mean.toFixed(2) ?? 'Unknown'}</td>
                <td>{stats.speed?.max.toFixed(2) ?? 'Unknown'}</td>
              </tr>
              {stats.altitudes.map((a) => (
                <tr key={a.group}>
                  <th>Altitude m · {a.group}</th>
                  <td>{a.count}</td>
                  <td>{a.min.toFixed(2)}</td>
                  <td>{a.mean.toFixed(2)}</td>
                  <td>{a.max.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
