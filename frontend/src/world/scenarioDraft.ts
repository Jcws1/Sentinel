import { draftScriptDestinations } from './scriptScene';
import type { DeepReadonly } from '../contracts/types';
import type { ScenarioState } from '../services/scenarioClient';
import type { SceneProjection } from '../renderers/contracts';
import type { SessionState } from '../state/sessionStore';
export function scenarioScene(
  scenario: DeepReadonly<ScenarioState>,
  session: DeepReadonly<SessionState>,
): SceneProjection {
  return {
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
      longitudeDeg: 103.85,
      latitudeDeg: 1.29,
      altitude: { metres: 150, reference: 'ELLIPSOID', datumId: 'WGS84' },
    },
    localHome: {
      center: { longitudeDeg: 103.85, latitudeDeg: 1.29 },
      groundSpanM: 6000,
      headingTrueDeg: 0,
    },
  };
}
