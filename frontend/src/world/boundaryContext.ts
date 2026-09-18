import type { RuntimeSnapshot } from '../app/runtime';
import type { ScenarioState } from '../services/scenarioClient';
import type { DeepReadonly } from '../contracts/types';
import type { SceneProjection } from '../renderers/contracts';
export function boundaryEditorContext(
  state: RuntimeSnapshot,
): DeepReadonly<ScenarioState> {
  if (state.scenario.active) return state.scenario;
  return {
    ...state.scenario,
    active: false,
    draft: {
      name: 'Live demo boundaries',
      units: [],
      boundaries: state.liveBoundaryView
        ?.boundaries as ScenarioState['draft']['boundaries'],
    },
    edit: undefined,
    actionEdit: undefined,
    placement: undefined,
    pending: undefined,
    reviewing: false,
    blocked: undefined,
    busy:
      state.interactive.busy ||
      !!state.interactive.pending ||
      !!state.liveBoundary?.requestId,
    boundaryEdit: state.liveBoundary?.edit,
    boundaryMenu: state.liveBoundary?.menu,
    error: state.liveBoundary?.error,
    message: state.liveBoundary?.message,
  };
}
export function liveBoundaryScene(
  scene: SceneProjection,
  state: RuntimeSnapshot,
  viewId: string,
): SceneProjection {
  if (
    !state.liveBoundary ||
    state.liveBoundary.runId !== state.presentation.frame?.interactive?.runId ||
    state.presentation.mode !== 'live'
  )
    return scene;
  const b = state.liveBoundary;
  return {
    ...scene,
    boundaryInteraction: b.visibleView === viewId,
    zones: [
      ...scene.zones,
      ...b.provisional.map((p) => ({
        ref: { kind: 'zone' as const, id: `provisional:${p.id}` },
        label: `${p.name} · PROVISIONAL`,
        boundaryType: 'untyped' as const,
        geometry: {
          type: 'Polygon' as const,
          coordinates: [[...p.vertices, p.vertices[0]]],
        },
      })),
    ],
    boundaryEdit: b.edit
      ? {
          vertices: b.edit.vertices.every((v) =>
            v.every((x) => x.trim() && Number.isFinite(Number(x))),
          )
            ? b.edit.vertices.map((v) => [Number(v[0]), Number(v[1])] as const)
            : [],
          selectedVertex: b.edit.selectedVertex,
        }
      : undefined,
  };
}
