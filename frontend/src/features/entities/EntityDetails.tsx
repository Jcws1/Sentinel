import { Camera, Pin, X } from 'lucide-react';
import { cockpitCandidate } from '../../world/cockpit';
import {
  useOperationalRuntime,
  useOperationalSnapshot,
} from '../../app/OperationalContext';
import { entityRows, type EntityRow } from '../../world/entityRows';
import { observedSegments } from '../../world/observedSegments';
import type { ApplicationRuntime, RuntimeSnapshot } from '../../app/runtime';
import { inspectorIdentity, type ViewId } from '../workspace/viewRegistry';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import { MovementDetails, executionLabel } from '../movement/MovementPane';
import { terminalExecution } from '../../world/movement';
import { behaviorLabel } from '../../world/behavior';
import { observationText, freshness, countText } from './values';
import {
  sourceLabel,
  boundSourceLabel,
  entityType,
  assetStatus,
  controlLabel,
} from './presentation';
import { formatSgt } from '../../world/time';
import { CopyValue } from './CopyValue';
import { AssetPortrait } from './AssetPortrait';
import { UnitSilhouette, AffiliationMark } from '../units/UnitSymbols';
import { DemoProfile } from './DemoProfile';
import { SimulationDetails } from '../../modules/simulation/SimulationDetails';
import { simulationNamespace } from '../../modules/simulation/contracts';
import { selectForDetails } from './selectionActions';
import './entities.css';
import './details.css';

function Trail({
  state,
  runtime,
  row,
}: {
  state: RuntimeSnapshot;
  runtime: ApplicationRuntime;
  row: EntityRow;
}) {
  const frame = state.presentation.frame!,
    selected = state.session.selection.primary?.id === row.entity.id;
  const observed = state.observed,
    data = selected && observed.status === 'ready' ? observed.data : undefined;
  const segments = observedSegments(frame, state.session.filters, row, data);
  return (
    <details className="detail-section">
      <summary>Observed trail</summary>
      <p className="entity-note">
        Primary entity’s displayed Track · last 60 s at the presented frame.
        Lines connect observations; breaks are preserved.
      </p>
      <button
        className="text-control"
        aria-pressed={selected && !!state.session.overlays.history}
        onClick={() => {
          if (!selected) runtime.selectEntity(row.entity.id);
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
                )}{' '}
                · {countText(segments.length, 'segment')}
                {data.truncated ? ' · bounded result' : ''}
              </p>
              {data.throughFrameId !== frame.frameId && (
                <p>
                  Refreshing · trail through{' '}
                  <time title={data.throughAt}>
                    {formatSgt(data.throughAt, { date: true })}
                  </time>
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
                    <dl>
                      <CopyValue
                        label="Segment source"
                        value={segment.source.id}
                      />
                      <CopyValue
                        label="First observation UTC"
                        value={segment.points[0].sample.timestamp}
                      />
                      <CopyValue
                        label="Last observation UTC"
                        value={segment.points.at(-1)!.sample.timestamp}
                      />
                    </dl>
                  </div>
                ))}
              </details>
            </>
          ) : (
            'No recorded trail available.'
          )}
        </div>
      )}
    </details>
  );
}

/** Selection-following and explicitly pinned inspection share presentation, never ownership. */
export function EntityDetails({
  bridge,
  id = 'details',
}: {
  bridge: WorkspaceBridge;
  id?: ViewId;
}) {
  const runtime = useOperationalRuntime()!,
    state = useOperationalSnapshot(runtime);
  const pinned = id !== 'details',
    identity = pinned ? inspectorIdentity(id) : undefined,
    frame = state.presentation.frame;
  const primary = state.session.selection.primary;
  const entityId = pinned
    ? identity?.entityId
    : primary?.kind === 'entity'
      ? primary.id
      : undefined;
  const missionId = pinned ? identity?.missionId : frame?.mission.id;
  const active = !!frame && frame.mission.id === missionId;
  const row = active
    ? entityRows(frame, state.session.filters).find(
        (r) => r.entity.id === entityId,
      )
    : undefined;
  const sample = row?.track?.latest,
    source = row?.track?.source ?? row?.entity.provenance.source;
  const bindings =
    frame?.interactive?.controls.filter((b) => b.entityId === entityId) ?? [];
  const label = row?.entity.label || 'Entity';
  const profile =
    !frame?.scenario &&
    frame?.interactive?.templateId === 'singapore-local-v2' &&
    bindings.length > 0;
  const unitProfile = row && frame?.unitProfiles?.[row.entity.id];
  const heading = sample?.velocity?.headingTrueDeg;
  const speed = sample?.velocity?.speedMps;
  const altitude = sample?.position.altitude;
  const moving = frame?.interactive?.executions?.find(
    (e) => e.entityId === entityId && !terminalExecution(e),
  );
  const status =
    frame && entityId
      ? moving
        ? executionLabel(moving)
        : assetStatus(frame, entityId)
      : undefined;
  const numeric = (value: number, digits = 1) =>
    value.toLocaleString('en-GB', { maximumFractionDigits: digits });
  const wedgetailReference =
    row?.entity.classification?.scheme === 'wedgetail-sandbox' &&
    row.entity.classification.code === 'friendly' &&
    row.entity.affiliation === 'friendly';
  const count = state.session.selection.items.filter(
    (i) => i.kind === 'entity',
  ).length;
  const displayedDifferent =
    !!source && bindings.some((b) => b.sourceId !== source.id);
  const behavior =
    frame && entityId ? behaviorLabel(frame, entityId) : undefined;
  const policy = frame?.fleetBehavior?.members?.find(
    (m) => m.entityId === entityId,
  );
  const outcome = frame?.fleetBehavior?.outcomes?.find((o) =>
    o.participants.some((p) => p.entityId === entityId),
  );
  return (
    <article
      className={`entity-details ${pinned ? 'entity-inspector' : 'selection-details'}`}
      aria-label={
        pinned ? `Pinned inspector for ${label}` : 'Selected entity details'
      }
      data-entity-id={entityId}
      data-mission-id={missionId}
      data-frame-id={active ? frame?.frameId : undefined}
      data-selection={entityId}
      data-has-entity={!!row}
      data-selection-state={
        !entityId
          ? 'empty'
          : !row
            ? 'missing'
            : !row.visible
              ? 'filtered'
              : row.observation
      }
    >
      <header className="details-heading">
        <div>
          <span className="quiet-label">
            {pinned ? 'PINNED INSPECTOR' : 'DETAILS'}
          </span>
          {!row && <h1>{entityId ? 'Entity unavailable' : 'Details'}</h1>}
        </div>
        <div className="details-header-actions">
          {!pinned && row && (
            <button
              className="icon-button"
              aria-label="Pin inspector"
              title="Pin inspector"
              onClick={() => bridge.openInspector(missionId!, entityId!, label)}
            >
              <Pin size={14} aria-hidden="true" />
            </button>
          )}
          <button
            className="icon-button"
            aria-label={pinned ? 'Close pinned inspector' : 'Close Details'}
            onClick={() => bridge.close(id)}
          >
            <X size={16} />
          </button>
        </div>
      </header>
      {row && (
        <AssetPortrait
          profileId={unitProfile?.id}
          wedgetailReference={wedgetailReference}
        />
      )}
      {row && frame && (
        <div className="details-identity">
          {wedgetailReference ? (
            <AffiliationMark category="friendly" />
          ) : (
            <UnitSilhouette profileId={unitProfile?.id} />
          )}
          <div className="details-name">
            <span className="details-type">
              {wedgetailReference
                ? 'Wedgetail Interceptor'
                : (unitProfile?.label ?? entityType(row, frame))}
            </span>
            <h1>{label}</h1>
          </div>
          <span
            className={`details-affiliation affiliation-${row.entity.affiliation}`}
          >
            {row.entity.affiliation.toUpperCase()}
          </span>
        </div>
      )}
      <p className="details-follow">
        {pinned
          ? 'Pinned to this mission and entity'
          : `Follows selection${count > 1 ? ` · ${count} selected` : ''}`}
      </p>
      {!entityId ? (
        <p className="entity-empty">
          {pinned
            ? 'Select an entity, then choose Pin inspector in Details.'
            : 'Select an entity in Fleet, Tracks or either map.'}
        </p>
      ) : !active ? (
        <div className="entity-empty">
          <h2>Mission not active</h2>
          <p>This inspector retains its original identity.</p>
          <button
            className="text-control"
            onClick={() => runtime.loadMission(missionId!)}
          >
            Load this mission
          </button>
        </div>
      ) : !row ? (
        <p className="entity-notice">
          This identity is missing from the presented frame. Selection has been
          retained.
        </p>
      ) : (
        <>
          <p className="details-state">
            {status}
            {row.observation !== 'tracking' && observationText(row) !== status
              ? ` · ${observationText(row)}`
              : ''}
          </p>
          {frame.unitProfiles?.[row.entity.id] && (
            <p className="entity-notice">
              {frame.unitProfiles[row.entity.id].variant} · notional simulation
              profile
              <br />
              Cruise{' '}
              {Math.round(
                frame.unitProfiles[row.entity.id].cruiseMps * 3.6,
              )}{' '}
              km/h
              {row.entity.affiliation === 'friendly' &&
                ` · pursuit ${Math.round(frame.unitProfiles[row.entity.id].pursuitMps * 3.6)} km/h`}
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
          {!row.track && <p className="entity-notice">No position supplied.</p>}
          {row.entity.affiliation === 'friendly' && (
            <button
              className="text-control entity-cockpit-action"
              onClick={() => {
                if (runtime.openCockpit(row.entity.id)) bridge.open('cockpit');
              }}
              disabled={
                !cockpitCandidate(
                  {
                    presentation: state.presentation,
                    session: state.session,
                    connection: state.connection,
                    authoring: state.scenario.active,
                  },
                  row.entity.id,
                ).binding
              }
              title={
                cockpitCandidate(
                  {
                    presentation: state.presentation,
                    session: state.session,
                    connection: state.connection,
                    authoring: state.scenario.active,
                  },
                  row.entity.id,
                ).reason ??
                'Open or rebind the one simulated video view. Viewing does not acquire control.'
              }
            >
              <Camera size={14} aria-hidden="true" /> Video Feed
            </button>
          )}
          {state.presentation.status === 'stale' && (
            <p className="entity-notice" role="status">
              {state.presentation.sourceDelayed
                ? 'Source report delayed'
                : 'Stale frame'}{' '}
              · Last committed measurements retained.
            </p>
          )}
          <section className="detail-section telemetry-section">
            <h2>
              Telemetry{' '}
              <span>{frame.interactive ? 'Simulation' : 'Observation'}</span>
            </h2>
            <div className="telemetry-instruments">
              <div
                className="heading-instrument"
                aria-label={
                  heading == null
                    ? 'Heading unavailable'
                    : `Heading ${numeric(heading)} degrees true`
                }
              >
                <svg viewBox="0 0 80 80" aria-hidden="true">
                  <circle
                    cx="40"
                    cy="40"
                    r="31"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="0.6"
                  />
                  <path
                    d="M40 6v6M40 68v6M6 40h6M68 40h6"
                    stroke="currentColor"
                    strokeWidth="1"
                  />
                  {heading != null && (
                    <path
                      d="M36 16 40 9 44 16Z"
                      fill="currentColor"
                      transform={`rotate(${heading} 40 40)`}
                    />
                  )}
                </svg>
                <span>
                  {heading == null ? '—' : `${numeric(heading, 0)}°`}
                  <small>TRUE</small>
                </span>
              </div>
              <dl className="telemetry-grid">
                <div>
                  <dt>Speed</dt>
                  <dd>
                    {speed == null ? (
                      'Unavailable'
                    ) : (
                      <>
                        {numeric(speed * 3.6)} <small>km/h</small>{' '}
                        <span className="secondary-measure">
                          {numeric(speed)} m/s
                        </span>
                      </>
                    )}
                  </dd>
                </div>
                <div>
                  <dt>Altitude</dt>
                  <dd>
                    {altitude ? (
                      <>
                        {numeric(altitude.metres, 2)} <small>m</small>{' '}
                        <span className="secondary-measure">
                          {altitude.reference}
                          {altitude.datumId
                            ? ` · ${altitude.datumId}`
                            : ' · datum unspecified'}
                        </span>
                      </>
                    ) : (
                      'Unavailable'
                    )}
                  </dd>
                </div>
              </dl>
            </div>
            <dl className="position-readout">
              <dt>
                Position <span>lon / lat</span>
              </dt>
              <dd>
                {sample
                  ? `${sample.position.longitudeDeg.toFixed(6)}°, ${sample.position.latitudeDeg.toFixed(6)}°`
                  : 'Unavailable'}
              </dd>
            </dl>
            <div className="observation-clock">
              <span>{frame.interactive ? 'Sim. observed' : 'Observed'}</span>
              <time dateTime={sample?.timestamp} title={sample?.timestamp}>
                {formatSgt(sample?.timestamp)}
              </time>
            </div>
            <p className="telemetry-freshness">
              <span title="Observation lag relative to this presented world frame">
                {freshness(row, frame.effectiveAt)}
              </span>
              <span>
                Delivery ·{' '}
                {state.connection !== 'connected'
                  ? state.connection
                  : state.presentation.sourceDelayed
                    ? 'source delayed'
                    : state.presentation.status === 'current'
                      ? 'current'
                      : 'unverified'}
              </span>
            </p>
          </section>
          {(behavior || outcome) && (
            <section
              className="detail-section behavior-details"
              aria-label="Current behavior and condition"
            >
              <strong>{behavior}</strong>
              {policy && <p>{policy.reason}</p>}
              {outcome && (
                <p>
                  SIMULATED ENGAGEMENT · both participants NON-OP. Local demo
                  rule {outcome.ruleVersion}. Recorded at source tick{' '}
                  {outcome.tick}; supplied heights preserved.
                </p>
              )}
            </section>
          )}
          {frame.interactive && !state.interactive.current?.ownsControl && (
            <p className="entity-note">
              {bindings.length
                ? controlLabel(state)
                : 'Observation only · no command binding'}
            </p>
          )}
          {pinned && (
            <button
              className="text-control"
              onClick={() => selectForDetails(runtime, bridge, entityId)}
            >
              Select entity
            </button>
          )}
          {frame.interactive && (
            <MovementDetails
              state={state}
              runtime={runtime}
              entityId={entityId}
              expanded
              readOnly
            />
          )}
          <details className="detail-section">
            <summary>
              Measurements & sources
              {displayedDifferent ? ' · display ≠ control' : ''}
            </summary>
            <dl className="detail-facts">
              <div>
                <dt>
                  {frame.interactive
                    ? 'Simulation observation · SGT date'
                    : 'Observation · SGT date'}
                </dt>
                <dd>{formatSgt(sample?.timestamp, { date: true })}</dd>
              </div>
              <div>
                <dt>Longitude / latitude</dt>
                <dd>
                  {sample
                    ? `${sample.position.longitudeDeg.toFixed(6)}°, ${sample.position.latitudeDeg.toFixed(6)}°`
                    : 'Unavailable'}
                </dd>
              </div>
              <div>
                <dt>Heading · true</dt>
                <dd>
                  {sample?.velocity?.headingTrueDeg != null
                    ? `${sample.velocity.headingTrueDeg}°`
                    : 'Unavailable'}
                </dd>
              </div>
              {sample?.confidence != null && (
                <div>
                  <dt>Supplied confidence</dt>
                  <dd>{(sample.confidence * 100).toFixed(1)}%</dd>
                </div>
              )}
              <div>
                <dt>Displayed source</dt>
                <dd>{sourceLabel(source, frame)}</dd>
              </div>
              <div>
                <dt>Control source</dt>
                <dd>
                  {bindings.length
                    ? bindings
                        .map((b) => boundSourceLabel(b.sourceId, frame))
                        .join(', ')
                    : 'No control binding'}
                </dd>
              </div>
            </dl>
            <p className="entity-note">
              {displayedDifferent
                ? 'The displayed Track and command source differ. '
                : ''}
              Measurements retain their supplied altitude reference. Display
              rounding does not change recorded or submitted values.
            </p>
            {bindings.map((b) => (
              <p className="entity-note" key={b.assetId}>
                {b.reason} · Reference: {b.positionReference}
              </p>
            ))}
            {row.tracks.length > 1 && (
              <p className="entity-note">
                {row.tracks.length} source Tracks. Display choice uses filters,
                non-ended Track, newest observation, then identifier; no fusion.
              </p>
            )}
          </details>
          {profile && !frame.unitProfiles?.[row.entity.id] && <DemoProfile />}
          <SimulationDetails
            value={row.entity.extensions?.[simulationNamespace]}
          />
          <Trail state={state} runtime={runtime} row={row} />
        </>
      )}
      {entityId && (
        <details className="detail-section technical-details">
          <summary>Technical details</summary>
          <dl className="detail-facts">
            <CopyValue label="Entity ID" value={entityId} />
            <CopyValue label="Mission ID" value={missionId} />
            {active && (
              <>
                <CopyValue label="Frame ID" value={frame.frameId} />
                <CopyValue label="Commit sequence" value={frame.sequence} />
                <CopyValue
                  label="Frame effective UTC"
                  value={frame.effectiveAt}
                />
                <CopyValue label="Recorded UTC" value={frame.recordedAt} />
                <CopyValue label="Observed UTC" value={sample?.timestamp} />
                <CopyValue label="Displayed Track ID" value={row?.track?.id} />
                <CopyValue label="Displayed source ID" value={source?.id} />
                <CopyValue
                  label="Longitude degrees"
                  value={sample?.position.longitudeDeg}
                />
                <CopyValue
                  label="Latitude degrees"
                  value={sample?.position.latitudeDeg}
                />
                <CopyValue
                  label="Altitude metres"
                  value={sample?.position.altitude.metres}
                />
                <CopyValue
                  label="Altitude reference"
                  value={sample?.position.altitude.reference}
                />
                <CopyValue
                  label="Vertical datum"
                  value={sample?.position.altitude.datumId}
                />
                <CopyValue
                  label="Speed metres per second"
                  value={sample?.velocity?.speedMps}
                />
                {bindings.map((b, index) => (
                  <CopyValue
                    key={index}
                    label={`Control binding ${index + 1}`}
                    value={JSON.stringify(b, null, 2)}
                  />
                ))}
              </>
            )}
          </dl>
          {active && row && (
            <details>
              <summary>Supplied metadata & associations</summary>
              <dl>
                <CopyValue
                  label="Supplied metadata JSON"
                  value={JSON.stringify(
                    {
                      entity: row.entity,
                      tracks: row.tracks,
                      assets: Object.values(frame.assets).filter(
                        (a) => a.entityId === entityId,
                      ),
                      sensors: Object.values(frame.sensors).filter(
                        (s) => s.entityId === entityId,
                      ),
                      tasks: Object.values(frame.tasks).filter(
                        (t) =>
                          t.subjectEntityIds?.includes(entityId) ||
                          t.assetIds?.some(
                            (a) => frame.assets[a]?.entityId === entityId,
                          ),
                      ),
                    },
                    null,
                    2,
                  )}
                />
              </dl>
            </details>
          )}
        </details>
      )}
      {!pinned && row && (
        <div className="details-actions">
          <button
            className="text-control"
            onClick={() => runtime.selectEntity(undefined)}
          >
            Clear selection
          </button>
        </div>
      )}
    </article>
  );
}
