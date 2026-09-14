import type { DeepReadonly } from '../contracts/types';
import type { SessionState } from '../state/sessionStore';
import type { PresentationFrame } from '../world/presentation';
import type { ObservedState } from '../world/observedHistory';
import { observedSegments } from '../world/observedSegments';
import { activeZones, entityRows, selectionStatus } from '../world/entityRows';
import type { SceneObject, SceneProjection } from './contracts';
import { regionalMissions } from './regions';

export function createScene(
  presentation: PresentationFrame,
  session: DeepReadonly<SessionState>,
  observed?: ObservedState,
): SceneProjection {
  const frame =
    presentation.frame?.mission.id === session.missionId
      ? presentation.frame
      : undefined;
  const selectedId =
    session.selection.missionId === session.missionId &&
    session.selection.primary?.kind === 'entity'
      ? session.selection.primary.id
      : undefined;
  if (!frame)
    return Object.freeze({
      missionId: session.missionId,
      stale:
        presentation.status === 'stale' || presentation.status === 'seeking',
      objects: Object.freeze([]),
      zones: Object.freeze([]),
      paths: Object.freeze([]),
      selection: Object.freeze({
        id: selectedId,
        status: selectedId ? 'missing' : 'none',
      }),
      unlocatedCount: 0,
    });
  const rows = entityRows(frame, session.filters);
  const objects: SceneObject[] = rows
    .filter((r) => r.visible && r.track)
    .map((r) =>
      Object.freeze({
        ref: Object.freeze({ kind: 'entity' as const, id: r.entity.id }),
        trackId: r.track!.id,
        position: r.track!.latest.position,
        affiliation: r.entity.affiliation,
        label: r.entity.label,
        selected: r.entity.id === selectedId,
        stale: r.entity.presence !== 'present' || r.track!.state !== 'tracking',
      }),
    );
  const selected = rows.find((r) => r.entity.id === selectedId);
  const history = observed?.status === 'ready' ? observed.data : undefined;
  const selectedObject = objects.find((o) => o.ref.id === selectedId);
  const paths =
    session.overlays.history &&
    selectedObject &&
    history?.missionId === frame.mission.id &&
    history.entityId === selectedId &&
    history
      ? observedSegments(frame, session.filters, selected, history).map(
          (s, index) =>
            Object.freeze({
              id: JSON.stringify([
                history.recordingId,
                s.trackId,
                index,
                s.points[0].sample.timestamp,
              ]),
              entityId: history.entityId,
              trackId: s.trackId,
              source: s.source,
              breakReason: s.breakReason,
              points: s.points,
              affiliation: selectedObject.affiliation,
            }),
        )
      : [];
  return Object.freeze({
    missionId: frame.mission.id,
    frameId: frame.frameId,
    sequence: frame.sequence,
    effectiveAt: frame.effectiveAt,
    stale: presentation.status !== 'current',
    objects: Object.freeze(objects),
    paths: Object.freeze(paths),
    zones: Object.freeze(
      session.overlays.zones
        ? activeZones(frame, session.filters).map((z) =>
            Object.freeze({
              ref: Object.freeze({ kind: 'zone' as const, id: z.id }),
              label: z.label,
              geometry: z.geometry,
              altitudeBand: z.altitudeBand,
            }),
          )
        : [],
    ),
    selection: Object.freeze({
      id: selectedId,
      label: selected?.entity.label,
      status: selectedId ? selectionStatus(selected) : 'none',
    }),
    unlocatedCount: rows.filter((r) => !r.tracks.length).length,
    referencePoint: frame.mission.referencePoint ?? undefined,
    region:
      regionalMissions[frame.mission.id] ??
      (frame.interactive?.templateId === 'singapore-local-v1'
        ? regionalMissions['fixture-tactical']
        : undefined),
  });
}
