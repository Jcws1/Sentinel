import type { RuntimeSnapshot } from '../../app/runtime';
import type { DeepReadonly, ImmutableFrame } from '../../contracts/types';
import type { Altitude, Position3D } from '../../contracts/generated';
import {
  chooseTrack,
  entityRows,
  type EntityRow,
} from '../../world/entityRows';
import {
  simulationProjection,
  simulationNamespace,
} from '../../modules/simulation/contracts';

export const tally = (values: readonly string[]) => {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a.localeCompare(b));
};
export function sourceMode(frame: ImmutableFrame) {
  const external = simulationProjection(
    frame.mission.extensions?.[simulationNamespace],
  );
  if (external)
    return `External ${external.sourceMode} · ${external.phase} · ${external.calibration.evidenceStatus}`;
  return frame.interactive
    ? `Interactive simulation · ${frame.interactive.state}`
    : `Recorded source · ${[...new Set(Object.values(frame.tracks).map((t) => t.source.mode))].join(', ') || 'unknown'}`;
}
export function projectCurrent(state: RuntimeSnapshot) {
  const frame = state.presentation.frame;
  if (!frame) return;
  const rows = entityRows(frame, state.session.filters),
    visible = rows.filter((r) => r.visible);
  const ids = new Set(visible.map((r) => r.entity.id));
  const assets = Object.values(frame.assets).filter(
    (a) => a.missionId === frame.mission.id,
  );
  const selectedAssets = assets.filter((a) => ids.has(a.entityId));
  const managed = new Set(assets.map((a) => a.entityId));
  const observed = (list: EntityRow[]) => ({
    current: list.filter(
      (r) => r.track?.state === 'tracking' && r.entity.presence === 'present',
    ).length,
    stale: list.filter(
      (r) =>
        r.track &&
        (r.track.state !== 'tracking' || r.entity.presence !== 'present'),
    ).length,
    unlocated: list.filter((r) => !r.track).length,
  });
  return {
    frame,
    rows,
    visible,
    mode: sourceMode(frame),
    total: rows.length,
    observed: observed(visible),
    missionObserved: observed(
      state.session.filters.sourceIds.length
        ? rows.map((r) => ({ ...r, track: chooseTrack(r.tracks) }))
        : rows,
    ),
    affiliations: tally(visible.map((r) => r.entity.affiliation)),
    classifications: tally(
      visible.map((r) => r.entity.classification?.code ?? 'Unknown'),
    ),
    assets: selectedAssets,
    assetTotal: assets.length,
    managedTotal: managed.size,
    managedVisible: visible.filter((r) => managed.has(r.entity.id)).length,
    availability: tally(selectedAssets.map((a) => a.availability)),
    conditions: tally(
      visible
        .filter((r) => managed.has(r.entity.id))
        .map((r) => r.entity.condition),
    ),
    controls: frame.interactive?.controls.filter((c) => ids.has(c.entityId)),
    executions: frame.interactive
      ? tally(
          (frame.interactive.executions ?? [])
            .filter((e) => ids.has(e.entityId))
            .map((e) => e.state),
        )
      : undefined,
    assignments: frame.fleetBehavior?.assignments?.filter(
      (a) => a.state === 'active' && ids.has(a.interceptorId),
    ).length,
    reserves:
      frame.fleetBehavior?.ruleVersion === 'local-fleet-v1'
        ? frame.fleetBehavior.members?.filter(
            (m) => m.state === 'reserve' && ids.has(m.entityId),
          ).length
        : undefined,
  };
}
export type CurrentProjection = NonNullable<ReturnType<typeof projectCurrent>>;

/** One bounded cache per runtime; camera, selection and unrelated UI are not keys. */
export function createAnalyticProjection() {
  let frame: ImmutableFrame | undefined,
    filters = '',
    value: ReturnType<typeof projectCurrent>;
  let computations = 0;
  return {
    get(state: RuntimeSnapshot) {
      const key = JSON.stringify(state.session.filters);
      if (frame !== state.presentation.frame || filters !== key) {
        frame = state.presentation.frame;
        filters = key;
        value = projectCurrent(state);
        computations++;
      }
      return value;
    },
    diagnostics: () => ({ computations, cachedFrames: value ? 1 : 0 }),
    clear() {
      frame = undefined;
      filters = '';
      value = undefined;
    },
  };
}

export interface ProfileOrigin {
  missionId: string;
  longitudeDeg: number;
  latitudeDeg: number;
  label: string;
  // A captured entity reference must never be applied to earlier observations.
  notBefore?: string;
}
export function missionOrigin(
  frame: ImmutableFrame,
): ProfileOrigin | undefined {
  const point =
    frame.interactive?.localGeometry?.origin ?? frame.mission.referencePoint;
  return point
    ? {
        missionId: frame.mission.id,
        longitudeDeg: point.longitudeDeg,
        latitudeDeg: point.latitudeDeg,
        label: 'Fixed mission reference',
      }
    : undefined;
}
export function capturedOrigin(
  frame: ImmutableFrame,
  row?: EntityRow,
): ProfileOrigin | undefined {
  return row?.visible &&
    row.track &&
    row.observation === 'tracking' &&
    row.entity.presence === 'present'
    ? {
        missionId: frame.mission.id,
        ...row.track.latest.position,
        label: `Fixed capture · ${row.entity.label}`,
        notBefore: row.track.latest.timestamp,
      }
    : undefined;
}
/** Great-circle horizontal distance on the IUGG mean sphere, not slant range. */
export function radialKm(
  origin: Pick<ProfileOrigin, 'longitudeDeg' | 'latitudeDeg'>,
  p: Pick<Position3D, 'longitudeDeg' | 'latitudeDeg'>,
) {
  const rad = Math.PI / 180,
    dlat = (p.latitudeDeg - origin.latitudeDeg) * rad,
    dlon = (p.longitudeDeg - origin.longitudeDeg) * rad;
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(origin.latitudeDeg * rad) *
      Math.cos(p.latitudeDeg * rad) *
      Math.sin(dlon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, a))));
}
/** No configured reviewed geoid/terrain conversion exists. Never call visualHeight.
 * AGL is excluded; anonymous MSL datums are kept within their source identity. */
export function altitudeGroup(
  a: DeepReadonly<Altitude>,
  sourceId: string,
): string | undefined {
  if (a.reference === 'AGL') return;
  if (a.reference === 'ELLIPSOID') {
    const datum = a.datumId?.toUpperCase();
    return !datum || ['WGS84', 'WGS-84', 'EPSG:4979'].includes(datum)
      ? 'ELLIPSOID · WGS84'
      : `ELLIPSOID · ${a.datumId}`;
  }
  return a.datumId
    ? `MSL · datum ${a.datumId}`
    : `MSL · unspecified datum · source ${sourceId}`;
}
export function profilePoints(
  projection: CurrentProjection,
  origin?: ProfileOrigin,
) {
  if (!origin || origin.missionId !== projection.frame.mission.id) return [];
  return projection.visible.flatMap((row) =>
    row.track
      ? [
          {
            row,
            distanceKm: radialKm(origin, row.track.latest.position),
            altitude: row.track.latest.position.altitude,
            group: altitudeGroup(
              row.track.latest.position.altitude,
              row.track.source.id,
            ),
            beforeOrigin:
              !!origin.notBefore &&
              row.track.latest.timestamp < origin.notBefore,
          },
        ]
      : [],
  );
}
