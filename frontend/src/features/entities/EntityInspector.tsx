import { useSyncExternalStore } from 'react';
import { useOperationalRuntime } from '../../app/OperationalContext';
import { entityRows } from '../../world/entityRows';
import { observedSegments } from '../../world/observedSegments';
import { inspectorIdentity, type ViewId } from '../workspace/viewRegistry';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import {
  altitudeText,
  speedText,
  observationText,
  freshness,
  countText,
} from './values';
import './entities.css';

export function EntityInspector({
  id,
  bridge,
}: {
  id: ViewId;
  bridge: WorkspaceBridge;
}) {
  const runtime = useOperationalRuntime()!,
    state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const identity = inspectorIdentity(id);
  const frame = state.presentation.frame;
  if (!identity)
    return (
      <div className="entity-empty">
        Select an entity, then use Open Details to pin its inspector.
      </div>
    );
  const { missionId, entityId } = identity;
  if (frame?.mission.id !== missionId)
    return (
      <div className="entity-empty">
        <h1>Mission not active</h1>
        <p>
          This inspector remains attached to{' '}
          <span className="entity-value">{entityId}</span>.
        </p>
        <p>
          Mission · <span className="entity-value">{missionId}</span>
        </p>
        <button
          className="text-control"
          onClick={() => runtime.loadMission(missionId)}
        >
          Load this mission
        </button>
      </div>
    );
  const row = entityRows(frame, state.session.filters).find(
    (r) => r.entity.id === entityId,
  );
  if (!row)
    return (
      <div className="entity-empty" data-frame-id={frame.frameId}>
        <h1>Entity unavailable</h1>
        <p className="entity-value">{entityId}</p>
        <p>
          This identity is absent from the presented frame. The inspector has
          not changed identity.
        </p>
      </div>
    );
  const { entity, track, tracks } = row,
    sample = track?.latest,
    source = track?.source ?? entity.provenance.source;
  const assets = Object.values(frame.assets).filter(
    (a) => a.entityId === entityId,
  );
  const sensors = Object.values(frame.sensors).filter(
    (s) => s.entityId === entityId,
  );
  const tasks = Object.values(frame.tasks).filter(
    (t) =>
      t.subjectEntityIds?.includes(entityId) ||
      t.assetIds?.some((a) => assets.some((asset) => asset.id === a)),
  );
  const selected = state.session.selection.primary?.id === entityId;
  const observed = state.observed;
  const data =
    selected && observed.status === 'ready' ? observed.data : undefined;
  const segments = observedSegments(frame, state.session.filters, row, data);
  return (
    <article
      className="entity-inspector"
      tabIndex={0}
      aria-label={`Details for ${entity.label || entityId}`}
      data-entity-id={entityId}
      data-mission-id={missionId}
      data-frame-id={frame.frameId}
    >
      <header className="inspector-heading">
        <div>
          <span className="quiet-label">ENTITY DETAILS</span>
          <h1 className="entity-value">{entity.label || entityId}</h1>
        </div>
        <button
          className="text-control"
          onClick={() => runtime.selectEntity(entityId)}
        >
          {selected ? 'Selected' : 'Select entity'}
        </button>
      </header>
      {state.presentation.status === 'stale' && (
        <p className="entity-notice" role="status">
          STALE FRAME · awaiting backend recovery
        </p>
      )}
      {!row.visible && (
        <p className="entity-notice">
          Hidden by shared filters.{' '}
          <button
            className="text-control"
            onClick={() => runtime.resetFilters()}
          >
            Reset filters
          </button>
        </p>
      )}
      <section>
        <h2>Identity</h2>
        <dl className="entity-facts">
          <div>
            <dt>Identifier</dt>
            <dd>{entityId}</dd>
          </div>
          <div>
            <dt>Affiliation</dt>
            <dd>{entity.affiliation.toUpperCase()}</dd>
          </div>
          <div>
            <dt>Classification</dt>
            <dd>
              {entity.classification?.label ??
                entity.classification?.code ??
                'Unknown'}
            </dd>
          </div>
          <div>
            <dt>Kind</dt>
            <dd>{entity.kind}</dd>
          </div>
          <div>
            <dt>Presence</dt>
            <dd>{entity.presence}</dd>
          </div>
          <div>
            <dt>Condition</dt>
            <dd>{entity.condition}</dd>
          </div>
        </dl>
      </section>
      <section>
        <h2>Displayed observation</h2>
        <dl className="entity-facts">
          <div>
            <dt>State</dt>
            <dd>{observationText(row)}</dd>
          </div>
          <div>
            <dt>Observed / UTC</dt>
            <dd>
              <time>{sample?.timestamp ?? 'Unavailable'}</time>
            </dd>
          </div>
          <div>
            <dt>Age at frame</dt>
            <dd>{freshness(row, frame.effectiveAt)}</dd>
          </div>
          <div>
            <dt>Altitude / reference</dt>
            <dd>{altitudeText(row)}</dd>
          </div>
          <div>
            <dt>Vertical datum</dt>
            <dd>{sample?.position.altitude.datumId ?? 'Unspecified'}</dd>
          </div>
          <div>
            <dt>Speed</dt>
            <dd>{speedText(row)}</dd>
          </div>
          <div>
            <dt>Longitude / latitude</dt>
            <dd>
              {sample
                ? `${sample.position.longitudeDeg.toFixed(6)}°, ${sample.position.latitudeDeg.toFixed(6)}°`
                : 'No position supplied'}
            </dd>
          </div>
          {sample?.velocity && (
            <div>
              <dt>Heading / true</dt>
              <dd>{sample.velocity.headingTrueDeg}°</dd>
            </div>
          )}
          {sample?.confidence != null && (
            <div>
              <dt>Supplied confidence</dt>
              <dd>{(sample.confidence * 100).toFixed(1)}%</dd>
            </div>
          )}
        </dl>
        <p className="entity-note">
          Source measurements. Map height conversions do not change these
          values.
        </p>
      </section>
      <section>
        <h2>Provenance</h2>
        <dl className="entity-facts">
          <div>
            <dt>Source</dt>
            <dd>{source.id}</dd>
          </div>
          <div>
            <dt>Kind / mode</dt>
            <dd>
              {source.kind} · {source.mode}
            </dd>
          </div>
          <div>
            <dt>Displayed track</dt>
            <dd>{track?.id ?? 'Unavailable'}</dd>
          </div>
          <div>
            <dt>Source tracks</dt>
            <dd>{tracks.length}</dd>
          </div>
        </dl>
        {tracks.length > 1 && (
          <p className="entity-note">
            Display choice: source filter, non-ended track, newest observation,
            then identifier. No fusion.
          </p>
        )}
      </section>
      <section>
        <h2>Observed trail</h2>
        {!row.track && (
          <p className="entity-note">
            No positioned displayed track in this frame.
          </p>
        )}
        <p className="entity-note">
          Selected entity’s displayed track · last 60 s at the presented frame.
          Lines connect supplied observations; breaks are preserved.
        </p>
        <button
          className="text-control"
          aria-pressed={selected && !!state.session.overlays.history}
          onClick={() => {
            runtime.selectEntity(entityId);
            runtime.setHistoryVisible(
              !(selected && state.session.overlays.history),
            );
          }}
        >
          {selected && state.session.overlays.history
            ? 'Hide observed trail'
            : 'Show observed trail'}
        </button>
        {selected && state.session.overlays.history && (
          <div className="trail-readout" role="status">
            {observed.status === 'loading' ? (
              'Loading recorded observations…'
            ) : observed.status === 'error' ? (
              <>
                {observed.error}{' '}
                <button
                  className="text-control"
                  onClick={() => runtime.retryHistory()}
                >
                  Retry history
                </button>
              </>
            ) : data ? (
              <>
                <p>
                  {countText(
                    segments.reduce((n, s) => n + s.points.length, 0),
                    'observation',
                  )}
                  {' · '}
                  {countText(segments.length, 'segment')}
                  {data.truncated ? ' · bounded result' : ''}
                </p>
                {data.throughFrameId !== frame.frameId && (
                  <p>
                    Refreshing · trail through{' '}
                    <time className="entity-value">{data.throughAt}</time>
                  </p>
                )}
                <details>
                  <summary>Recorded segments and breaks</summary>
                  {segments.map((segment, index) => (
                    <div className="trail-segment" key={index}>
                      <span>
                        {countText(segment.points.length, 'observation')} ·{' '}
                        {segment.breakReason}
                      </span>
                      <span className="entity-value">{segment.source.id}</span>
                      <span className="entity-value">
                        {segment.points[0].sample.timestamp} →{' '}
                        {segment.points.at(-1)!.sample.timestamp}
                      </span>
                    </div>
                  ))}
                </details>
              </>
            ) : (
              'Select an entity to inspect its trail.'
            )}
          </div>
        )}
      </section>
      <section>
        <h2>Supplied associations</h2>
        {!assets.length && !sensors.length && !tasks.length ? (
          <p className="entity-note">
            No resource, sensor or task associations supplied.
          </p>
        ) : (
          <dl className="entity-facts">
            {assets.map((a) => (
              <div key={a.id}>
                <dt>Resource · {a.availability}</dt>
                <dd>
                  {a.id}
                  {a.capabilityCodes?.length
                    ? ` · ${a.capabilityCodes.join(', ')}`
                    : ''}
                </dd>
              </div>
            ))}
            {sensors.map((s) => (
              <div key={s.id}>
                <dt>Sensor · {s.modality}</dt>
                <dd>
                  {s.id} · {s.status}
                </dd>
              </div>
            ))}
            {tasks.map((t) => (
              <div key={t.id}>
                <dt>Task · {t.type}</dt>
                <dd>
                  {t.id} · {t.status}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>
      <details className="technical-details">
        <summary>Technical metadata</summary>
        <dl className="entity-facts">
          <div>
            <dt>Mission</dt>
            <dd>{missionId}</dd>
          </div>
          <div>
            <dt>Presented / UTC</dt>
            <dd>{frame.effectiveAt}</dd>
          </div>
          <div>
            <dt>Frame</dt>
            <dd>{frame.frameId}</dd>
          </div>
          <div>
            <dt>Commit sequence</dt>
            <dd>{frame.sequence}</dd>
          </div>
          <div>
            <dt>Recorded / UTC</dt>
            <dd>{frame.recordedAt}</dd>
          </div>
          <div>
            <dt>Entity provenance / UTC</dt>
            <dd>
              {entity.provenance.effectiveAt} · recorded{' '}
              {entity.provenance.recordedAt}
            </dd>
          </div>
          {entity.classification && (
            <div>
              <dt>Classification scheme</dt>
              <dd>
                {entity.classification.scheme} · {entity.classification.code}
              </dd>
            </div>
          )}
        </dl>
        <pre>
          {JSON.stringify(
            { source, tracks, extensions: entity.extensions },
            null,
            2,
          )}
        </pre>
      </details>
      <button className="text-control" onClick={() => bridge.open('tracks')}>
        Open Tracks
      </button>
    </article>
  );
}
