import { draftScriptDestinations } from './scriptScene';
import type { DeepReadonly } from '../contracts/types';
import type { ScenarioState } from '../services/scenarioClient';
import type { SceneProjection } from '../renderers/contracts';
import type { SessionState } from '../state/sessionStore';
import { originFor, operatingCorners, locationGeometry } from './localGeometry';
export function scenarioScene(
  scenario: DeepReadonly<ScenarioState>,
  session: DeepReadonly<SessionState>,
): SceneProjection {
  const origin = originFor(scenario.draft);
  const locationGuides: NonNullable<
    SceneProjection['locationGuides']
  >[number][] = [
    { id: 'current', origin, corners: operatingCorners(scenario.draft) },
  ];
  const edit = scenario.locationEdit;
  if (edit?.longitude.trim() && edit.latitude.trim()) {
    try {
      const geometry = locationGeometry(
        Number(edit.longitude),
        Number(edit.latitude),
      );
      locationGuides.push({
        id: 'proposed',
        origin: geometry.origin,
        corners: operatingCorners(geometry),
      });
    } catch {
      /* Invalid coordinates have a textual error, not an invented outline. */
    }
  }
  return {
    locationGuides,
    destinations: draftScriptDestinations(scenario, session),
    context: 'authoring',
    // Renderer camera bookmark scope only; never an operational mission identity.
    // Saving or revising a definition must not reset any pane's camera.
    missionId: 'authoring:local-scenario',
    stale: false,
    zones: (scenario.draft.boundaries ?? [])
      .filter((b) => b.id !== scenario.boundaryEdit?.originalId)
      .map((b) => ({
        ref: { kind: 'zone' as const, id: b.id },
        label: b.name,
        boundaryType: b.type,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[...b.vertices, b.vertices[0]]],
        },
      })),
    boundaryEdit: scenario.boundaryEdit
      ? {
          vertices: scenario.boundaryEdit.vertices.every((v) =>
            v.every((s) => s.trim() && Number.isFinite(Number(s))),
          )
            ? scenario.boundaryEdit.vertices.map(
                (v) => [Number(v[0]), Number(v[1])] as [number, number],
              )
            : [],
          selectedVertex: scenario.boundaryEdit.selectedVertex,
        }
      : undefined,
    paths: [],
    unlocatedCount: 0,
    objects: scenario.draft.units.map((unit) => ({
      ref: { kind: 'entity', id: unit.id },
      trackId: `draft:${unit.id}`,
      position: {
        ...unit.position,
        altitude: {
          ...unit.position.altitude,
          reference: 'ELLIPSOID',
          datumId: 'WGS84',
        },
      },
      affiliation: unit.category,
      label: unit.label,
      profileId: unit.profileId ?? undefined,
      selected: session.selection.items.some(
        (i) => i.kind === 'scenario-unit' && i.id === unit.id,
      ),
      stale: false,
    })),
    selection: {
      status: session.selection.primary ? 'visible' : 'none',
      id: session.selection.primary?.id,
    },
    referencePoint: {
      ...origin,
      altitude: { metres: 150, reference: 'ELLIPSOID', datumId: 'WGS84' },
    },
    localHome: {
      center: origin,
      groundSpanM: 6000,
      headingTrueDeg: 0,
    },
  };
}
