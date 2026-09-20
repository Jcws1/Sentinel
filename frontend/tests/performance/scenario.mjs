// Saved-plan input through the ordinary scenario API/Conductor workflow.
export function performanceScenario(
  perSide = 20,
  { routeHalfSpanDeg = 0.025 } = {},
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
  return {
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
}
