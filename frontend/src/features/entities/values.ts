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
/**
 * Age is relative to the presented frame, never the Singapore wall clock.
 * Ages of an hour or more read in hours or days, not millions of seconds.
 */
export function freshness(row: EntityRow, effectiveAt: string) {
  if (!row.track) return 'No recorded position';
  const seconds = Math.max(
    0,
    (Date.parse(effectiveAt) - Date.parse(row.track.latest.timestamp)) / 1000,
  );
  if (seconds < 3600)
    return `${seconds.toLocaleString('en-GB', { maximumFractionDigits: 1 })} s before frame`;
  const minutes = Math.floor(seconds / 60),
    hours = Math.floor(minutes / 60);
  return hours < 24
    ? `${hours} h ${minutes % 60} min before frame`
    : `${Math.floor(hours / 24).toLocaleString('en-GB')} d ${hours % 24} h before frame`;
}
