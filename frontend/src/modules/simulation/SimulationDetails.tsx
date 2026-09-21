import { simulationEntityDetail } from './contracts';

export function SimulationDetails({ value }: { value: unknown }) {
  const detail = simulationEntityDetail(value);
  if (!detail) return null;
  return (
    <section className="detail-section" aria-label="External simulation detail">
      <h2>Simulation outcome</h2>
      <dl className="simulation-identity">
        <dt>External ID</dt>
        <dd>{detail.droneId}</dd>
        <dt>Class</dt>
        <dd>{detail.droneClass}</dd>
        <dt>Health</dt>
        <dd>
          {detail.inputHealth} → {detail.health} / 100 · {detail.reportedStatus}
        </dd>
        <dt>Profile</dt>
        <dd>
          {detail.calibration.profileId} / {detail.calibration.version} ·{' '}
          {detail.calibration.evidenceStatus}
        </dd>
        <dt>Command</dt>
        <dd>{detail.commandId}</dd>
      </dl>
      <p className="entity-note">
        Module-specific simulated health. Source altitude is MSL; no
        terrain-clearance inference.
      </p>
      {detail.stateDiscontinuity && (
        <p className="entity-notice">
          Supplied health differs from the last recorded outcome. The correction
          is recorded.
        </p>
      )}
    </section>
  );
}
