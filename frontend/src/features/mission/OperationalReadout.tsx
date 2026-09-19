import {
  useOperationalRuntime,
  useOperationalSnapshot,
} from '../../app/OperationalContext';
import type { ApplicationRuntime } from '../../app/runtime';
import type { ViewId } from '../workspace/viewRegistry';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import { selectForDetails } from '../entities/selectionActions';
import { CopyValue } from '../entities/CopyValue';
import { formatSgt } from '../../world/time';

type ViewLabel = { title: string; unavailable: string };
function EmptyView({ view }: { view: ViewLabel }) {
  return (
    <div className="placeholder-content">
      <h1>{view.title}</h1>
      <p className="placeholder-description">{view.unavailable}</p>
    </div>
  );
}
export function OperationalReadout({
  view,
  viewId,
  bridge,
}: {
  view: ViewLabel;
  viewId: ViewId;
  bridge: WorkspaceBridge;
}) {
  const runtime = useOperationalRuntime();
  return runtime ? (
    <Readout runtime={runtime} view={view} viewId={viewId} bridge={bridge} />
  ) : (
    <EmptyView view={view} />
  );
}
function Readout({
  runtime,
  view,
  viewId,
  bridge,
}: {
  runtime: ApplicationRuntime;
  view: ViewLabel;
  viewId: ViewId;
  bridge: WorkspaceBridge;
}) {
  const state = useOperationalSnapshot(runtime);
  const frame = state.presentation.frame;
  if (!frame) return <EmptyView view={view} />;
  const selection = state.session.selection.primary;
  const selectedId = selection?.kind === 'entity' ? selection.id : undefined;
  const entities = Object.values(frame.entities);
  const stale = state.presentation.status !== 'current';
  return (
    <div
      className="world-readout"
      data-readout={viewId}
      data-frame-id={frame.frameId}
      data-sequence={frame.sequence}
    >
      <div className="readout-heading">
        <h1>{view.title}</h1>
        <span className="readout-scope">Shared state readout</span>
      </div>
      <p className="readout-limit">{view.unavailable}</p>
      {stale && (
        <p className="stale-notice" role="status">
          STALE SNAPSHOT / waiting for a verified connection
        </p>
      )}
      <dl className="frame-facts">
        <div>
          <dt>Observation time</dt>
          <dd data-field="effective-time">
            {formatSgt(frame.effectiveAt, { date: true })}
          </dd>
        </div>
        <div>
          <dt>Recorded</dt>
          <dd>{formatSgt(frame.recordedAt, { date: true })}</dd>
        </div>
      </dl>
      <details className="detail-section">
        <summary>Technical frame</summary>
        <dl>
          <div data-field="frame">
            <CopyValue label="Frame ID" value={frame.frameId} />
          </div>
          <div data-field="sequence">
            <CopyValue label="Sequence" value={frame.sequence} />
          </div>
          <CopyValue label="Observation UTC" value={frame.effectiveAt} />
          <CopyValue label="Recorded UTC" value={frame.recordedAt} />
        </dl>
      </details>
      <div className="readout-counts">
        <span>
          Entities <b data-field="entity-count">{entities.length}</b>
        </span>
        <span>
          Tracks <b>{Object.keys(frame.tracks).length}</b>
        </span>
        <span>
          Assets <b>{Object.keys(frame.assets).length}</b>
        </span>
      </div>
      <div className="selection-heading">
        <span>Shared entity selection</span>
        {selectedId && (
          <button
            className="text-control"
            onClick={() => runtime.selectEntity()}
          >
            Clear
          </button>
        )}
      </div>
      <table className="fixture-entities">
        <caption className="sr-only">Entities in the committed frame</caption>
        <thead>
          <tr>
            <th scope="col">Entity</th>
            <th scope="col">Affiliation</th>
          </tr>
        </thead>
        <tbody>
          {entities.map((entity) => (
            <tr key={entity.id} data-selected={selectedId === entity.id}>
              <td>
                <button
                  aria-label={`Select ${entity.label}`}
                  aria-pressed={selectedId === entity.id}
                  onClick={() => selectForDetails(runtime, bridge, entity.id)}
                >
                  {entity.label}
                </button>
              </td>
              <td>{entity.affiliation}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="selection-summary">
        Selected{' '}
        <span className="mono" data-field="selection">
          {selectedId
            ? (frame.entities[selectedId]?.label ?? 'Missing entity')
            : 'None'}
        </span>
        {selectedId && !Object.hasOwn(frame.entities, selectedId) && (
          <span>Unavailable in this frame</span>
        )}
      </div>
    </div>
  );
}
