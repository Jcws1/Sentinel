// Saved-plan input through the ordinary scenario API/Conductor workflow.
export function performanceScenario(
  perSide = 20,
  { routeHalfSpanDeg = 0.025, location = 'default' } = {},
) {
  if (![0.025, 0.035].includes(routeHalfSpanDeg))
    throw Error('Unsupported bounded verification route span');
  const units = ['friendly', 'hostile'].flatMap((category, side) =>
    Array.from({ length: perSide }, (_, i) => ({
      id: `${category}-${i + 1}`,
      label: `${side ? 'Hostile' : 'Friendly'} ${String(i + 1).padStart(2, '0')}`,
      category,
      commandRole: side ? 'observation' : 'sentinel',
      profileId: 'hornet-10-v1',
      headingTrueDeg: side ? 270 : 90,
      position: {
        longitudeDeg: 103.85 + (side ? 0.002 : -0.002),
        latitudeDeg: 1.289 + i * 0.00012,
        altitude: { metres: 180, reference: 'ELLIPSOID', datumId: 'WGS84' },
      },
    })),
  );
  const content = {
    name: `Performance ${perSide}v${perSide}`,
    units,
    boundaries: [],
    boundaryRuleVersion: 'local-boundary-v1',
    scheduleRuleVersion: 'local-schedule-v2',
    actions: units.flatMap((unit, i) =>
      Array.from({ length: 3 }, (_, leg) => ({
        id: `${unit.id}-leg-${leg}`,
        unitId: unit.id,
        kind: 'move',
        ordinal: i * 3 + leg,
        ...(leg === 0
          ? { offsetMs: 0 }
          : { afterActionId: `${unit.id}-leg-${leg - 1}`, delayMs: 0 }),
        destination: {
          longitudeDeg:
            103.85 +
            (unit.category === 'hostile' ? -1 : 1) *
              (leg % 2 ? -routeHalfSpanDeg : routeHalfSpanDeg),
          latitudeDeg: unit.position.latitudeDeg,
        },
      })),
    ),
  };
  if (location === 'sydney') {
    // Same metre-scale workload at the already supported Sydney origin.
    const ratio =
      Math.cos((1.29 * Math.PI) / 180) / Math.cos((-33.9461 * Math.PI) / 180);
    const translate = (p) => {
      p.longitudeDeg = 151.1772 + (p.longitudeDeg - 103.85) * ratio;
      p.latitudeDeg = -33.9461 + (p.latitudeDeg - 1.29);
    };
    content.units.forEach((u) => translate(u.position));
    content.actions.forEach((a) => translate(a.destination));
    content.boundaries.push({
      id: 'sydney-verification-patrol',
      name: 'Sydney verification Patrol',
      type: 'patrol',
      vertices: [
        [103.846, 1.286],
        [103.854, 1.286],
        [103.854, 1.294],
        [103.846, 1.294],
      ].map(([longitudeDeg, latitudeDeg]) => {
        const position = { longitudeDeg, latitudeDeg };
        translate(position);
        return [position.longitudeDeg, position.latitudeDeg];
      }),
    });
    content.localGeometry = {
      modelId: 'local-horizontal-v2',
      halfExtentMetres: 5000,
      origin: { longitudeDeg: 151.1772, latitudeDeg: -33.9461 },
    };
    content.name += ' Sydney';
  } else if (location !== 'default')
    throw Error('Unsupported verification location');
  return content;
}
