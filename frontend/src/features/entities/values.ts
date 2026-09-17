import type { EntityRow } from '../../world/entityRows';

export function countText(count: number, singular: string) {
  return `${count} ${singular}${count === 1 ? '' : 's'}`;
}

export function altitudeText(row?: EntityRow) {
  const altitude = row?.track?.latest.position.altitude;
  return altitude
    ? `${altitude.metres.toLocaleString('en-GB', { maximumFractionDigits: 2 })} m ${altitude.reference}`
    : 'Unavailable';
}
export function speedText(row?: EntityRow) {
  const speed = row?.track?.latest.velocity?.speedMps;
  return speed != null
    ? `${speed.toLocaleString('en-GB', { maximumFractionDigits: 2 })} m/s`
    : 'Unavailable';
}
export function observationText(row: EntityRow) {
  return row.entity.presence === 'removed'
    ? 'Removed'
    : !row.track
      ? 'No position'
      : row.entity.presence !== 'present' || row.track.state === 'stale'
        ? 'Last known'
        : row.track.state === 'ended'
          ? 'Ended'
          : 'Tracking';
}
/** Age is relative to the presented frame, never the Singapore wall clock. */
export function freshness(row: EntityRow, effectiveAt: string) {
  if (!row.track) return 'No recorded position';
  const seconds =
    (Date.parse(effectiveAt) - Date.parse(row.track.latest.timestamp)) / 1000;
  return `${Math.max(0, seconds).toLocaleString('en-GB', { maximumFractionDigits: 1 })} s before frame`;
}
