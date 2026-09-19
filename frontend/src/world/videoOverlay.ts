import type { CockpitState } from './cockpit';
import { cockpitKey } from './cockpit';
import type { PresentationFrame } from './presentation';
import type { DeepReadonly } from '../contracts/types';
import type { SessionState } from '../state/sessionStore';
import type { SceneObject } from '../renderers/contracts';
import { entityRows } from './entityRows';
import { visualHeight } from '../renderers/cesium/altitude';

export interface VideoOverlayFrame {
  bindingKey: string;
  frameId: string;
  objects: readonly SceneObject[];
}

/** Same-frame display data only. No fallback Track, history query or visibility inference. */
export function videoOverlayFrame(
  state: Readonly<CockpitState>,
  presentation: PresentationFrame,
  session: DeepReadonly<SessionState>,
): VideoOverlayFrame | undefined {
  const b = state.binding,
    p = state.pose,
    f = presentation.frame;
  if (
    !b ||
    !p ||
    !f ||
    presentation.status !== 'current' ||
    !['ready', 'running', 'paused', 'recorded'].includes(state.phase) ||
    f.mission.id !== b.missionId ||
    session.missionId !== b.missionId ||
    f.recordingId !== b.recordingId ||
    f.interactive?.runId !== b.runId ||
    f.frameId !== p.frameId
  )
    return;
  const objects: SceneObject[] = [];
  for (const row of entityRows(f, session.filters)) {
    const { entity: e, track: t } = row;
    if (
      !row.visible ||
      !t ||
      e.id === b.entityId ||
      e.affiliation === 'neutral' ||
      !(
        t.source.mode === 'simulated' ||
        (t.source.mode === 'replay' && t.source.kind === 'simulation')
      )
    )
      continue;
    const position = t.latest.position;
    if (
      !position ||
      !Number.isFinite(position.longitudeDeg) ||
      Math.abs(position.longitudeDeg) > 180 ||
      !Number.isFinite(position.latitudeDeg) ||
      Math.abs(position.latitudeDeg) > 90 ||
      !Number.isFinite(position.altitude.metres) ||
      visualHeight(position.altitude)?.quality !== 'ellipsoid'
    )
      continue;
    const stale =
      row.observation !== 'tracking' ||
      Date.parse(f.effectiveAt) - Date.parse(t.latest.timestamp) > 2000;
    objects.push({
      ref: { kind: 'entity', id: e.id },
      trackId: t.id,
      position,
      label: e.label,
      affiliation: e.affiliation,
      condition: e.condition,
      stale,
      selected: session.selection.items.some(
        (s) => s.kind === 'entity' && s.id === e.id,
      ),
      unavailable:
        e.condition === 'non-operational'
          ? 'NON-OP'
          : stale
            ? t.state === 'ended'
              ? 'Ended'
              : 'Stale'
            : undefined,
    });
  }
  return { bindingKey: cockpitKey(b), frameId: f.frameId, objects };
}
