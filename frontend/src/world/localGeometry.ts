import type {
  LocalGeometry,
  MoveAnchor,
  ScenarioContent,
} from '../contracts/generated';
import type { DeepReadonly } from '../contracts/types';

export type GeometryOwner =
  | DeepReadonly<LocalGeometry>
  | {
      readonly localGeometry?: DeepReadonly<LocalGeometry> | null;
      readonly interactive?: {
        readonly localGeometry?: DeepReadonly<LocalGeometry> | null;
      } | null;
    }
  | null
  | undefined;
export const legacyOrigin = {
  longitudeDeg: 103.85,
  latitudeDeg: 1.29,
} as const;
export const horizontalScale = (6378137 * Math.PI) / 180;
export function geometryFor(
  owner?: GeometryOwner,
): DeepReadonly<LocalGeometry> | undefined {
  if (!owner) return;
  if ('modelId' in owner) return owner;
  return owner.localGeometry ?? owner.interactive?.localGeometry ?? undefined;
}
export function originFor(owner?: GeometryOwner) {
  return geometryFor(owner)?.origin ?? legacyOrigin;
}
export function sameGeometry(left?: GeometryOwner, right?: GeometryOwner) {
  const a = geometryFor(left),
    b = geometryFor(right);
  return !a || !b
    ? a === b
    : a.modelId === b.modelId &&
        a.halfExtentMetres === b.halfExtentMetres &&
        a.origin.longitudeDeg === b.origin.longitudeDeg &&
        a.origin.latitudeDeg === b.origin.latitudeDeg;
}
export function eastScale(owner?: GeometryOwner) {
  return (
    horizontalScale * Math.cos((originFor(owner).latitudeDeg * Math.PI) / 180)
  );
}
export function extentTolerance(owner?: GeometryOwner) {
  return geometryFor(owner) ? 0.0001 : 0;
}
export function validateLocalGeometry(geometry: DeepReadonly<LocalGeometry>) {
  const { longitudeDeg: lon, latitudeDeg: lat } = geometry.origin;
  if (
    geometry.modelId !== 'local-horizontal-v2' ||
    geometry.halfExtentMetres !== 5000
  )
    throw new Error('Unsupported scenario geometry version or extent.');
  if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 80)
    throw new Error(
      'Enter a finite longitude and latitude between 80°S and 80°N.',
    );
  const dx = 5000 / eastScale(geometry),
    dy = 5000 / horizontalScale;
  if (lon - dx < -180 || lon + dx > 180 || Math.abs(lat) + dy > 85.051129)
    throw new Error(
      'The entire operating square must fit without crossing the date line or the supported map latitude limit.',
    );
}
export function locationGeometry(
  longitudeDeg: number,
  latitudeDeg: number,
): LocalGeometry {
  const geometry: LocalGeometry = {
    modelId: 'local-horizontal-v2',
    origin: { longitudeDeg, latitudeDeg },
    halfExtentMetres: 5000,
  };
  validateLocalGeometry(geometry);
  return geometry;
}
export function insideExtent(
  p: DeepReadonly<MoveAnchor>,
  owner?: GeometryOwner,
) {
  const origin = originFor(owner),
    limit = 5000 + extentTolerance(owner);
  return (
    Number.isFinite(p.longitudeDeg) &&
    Number.isFinite(p.latitudeDeg) &&
    Math.abs((p.longitudeDeg - origin.longitudeDeg) * eastScale(owner)) <=
      limit &&
    Math.abs((p.latitudeDeg - origin.latitudeDeg) * horizontalScale) <= limit
  );
}
export function operatingCorners(owner?: GeometryOwner): [number, number][] {
  const origin = originFor(owner),
    dx = 5000 / eastScale(owner),
    dy = 5000 / horizontalScale;
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, y]) => [
    origin.longitudeDeg + x * dx,
    origin.latitudeDeg + y * dy,
  ]);
}
/** Pure preview; no translation, altitude conversion or changes to the draft. */
export function locationConflicts(
  content: DeepReadonly<ScenarioContent>,
  geometry: DeepReadonly<LocalGeometry>,
): string[] {
  validateLocalGeometry(geometry);
  const failures: string[] = [];
  for (const u of content.units)
    if (!insideExtent(u.position, geometry)) failures.push(`Unit: ${u.label}`);
  for (const a of content.actions ?? [])
    if (!insideExtent(a.destination, geometry))
      failures.push(
        `Destination: ${content.units.find((u) => u.id === a.unitId)?.label ?? a.unitId} (${a.id})`,
      );
  for (const b of content.boundaries ?? [])
    if (
      b.vertices.some(
        ([longitudeDeg, latitudeDeg]) =>
          !insideExtent({ longitudeDeg, latitudeDeg }, geometry),
      )
    )
      failures.push(`Boundary: ${b.name}`);
  return failures;
}
