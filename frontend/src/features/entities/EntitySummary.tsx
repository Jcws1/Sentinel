import { X } from 'lucide-react';
import type { ApplicationRuntime, RuntimeSnapshot } from '../../app/runtime';
import { entityRows, selectionStatus } from '../../world/entityRows';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import { altitudeText, speedText, freshness, observationText } from './values';
import './entities.css';

export function EntitySummary({
  state,
  runtime,
  bridge,
  map = false,
}: {
  state: RuntimeSnapshot;
  runtime: ApplicationRuntime;
  bridge: WorkspaceBridge;
  map?: boolean;
}) {
  const frame = state.presentation.frame,
    id =
      state.session.selection.primary?.kind === 'entity'
        ? state.session.selection.primary.id
        : undefined;
  if (!id) return null;
  const row = frame
    ? entityRows(frame, state.session.filters).find((r) => r.entity.id === id)
    : undefined;
  const status = selectionStatus(row),
    track = row?.track;
  return (
    <section
      className={`${map ? 'map-selection ' : ''}entity-summary`}
      aria-label="Selected entity summary"
      data-selection={id}
      data-selection-state={status}
    >
      <div className="entity-summary-heading">
        <span className="quiet-label">SELECTED</span>
        <strong className="entity-value" title={id}>
          {row?.entity.label || id}
        </strong>
        <button
          className="icon-button"
          aria-label="Clear selection"
          onClick={() => runtime.selectEntity()}
        >
          <X size={13} />
        </button>
      </div>
      {status !== 'visible' && (
        <p className="entity-notice" role="status">
          {status === 'filtered'
            ? 'Hidden by shared filters'
            : status === 'unlocated'
              ? 'No position supplied'
              : 'Unavailable in this frame'}
        </p>
      )}
      {row && (
        <>
          <p className="entity-identity-line">
            {row.entity.affiliation.toUpperCase()} · {observationText(row)}
            {row.entity.classification
              ? ` · ${row.entity.classification.label ?? row.entity.classification.code}`
              : ''}
          </p>
          <dl className="summary-measurements">
            <div>
              <dt>Altitude</dt>
              <dd>{altitudeText(row)}</dd>
            </div>
            <div>
              <dt>Speed</dt>
              <dd>{speedText(row)}</dd>
            </div>
          </dl>
          <div className="summary-observation">
            <div className="summary-observation-meta">
              <span className="quiet-label">Observed UTC</span>
              {frame && (
                <span className="quiet-label">
                  {freshness(row, frame.effectiveAt)}
                </span>
              )}
            </div>
            <time className="entity-value" dateTime={track?.latest.timestamp}>
              {track?.latest.timestamp ?? 'Unavailable'}
            </time>
            <span
              className="summary-source entity-value"
              title={track?.source.id ?? row.entity.provenance.source.id}
            >
              Source · {track?.source.id ?? row.entity.provenance.source.id}
            </span>
          </div>
        </>
      )}
      <div className="entity-summary-actions">
        <button
          className="text-control"
          onClick={() =>
            state.missionId &&
            bridge.openInspector(state.missionId, id, row?.entity.label || id)
          }
        >
          Open Details
        </button>
        {status === 'filtered' && (
          <button
            className="text-control"
            onClick={() => runtime.resetFilters()}
          >
            Reset filters
          </button>
        )}
        {state.presentation.status === 'stale' && (
          <span className="constraint-tag">STALE</span>
        )}
      </div>
    </section>
  );
}
