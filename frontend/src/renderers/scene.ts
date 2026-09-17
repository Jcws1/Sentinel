import type { DeepReadonly } from '../contracts/types';
import type { SessionState } from '../state/sessionStore';
import type { PresentationFrame } from '../world/presentation';
import type { ObservedState } from '../world/observedHistory';
import { observedSegments } from '../world/observedSegments';
import { activeZones, entityRows, selectionStatus } from '../world/entityRows';
import type { SceneObject, SceneProjection } from './contracts';
import { regionalMissions } from './regions';
import { reviewMovement, terminalExecution } from '../world/movement';
import type { InteractiveState } from '../services/interactiveClient';
import type { SceneDestination } from './contracts';

export function createScene(
  presentation: PresentationFrame,
  session: DeepReadonly<SessionState>,
  observed?: ObservedState,
  interactive?: DeepReadonly<InteractiveState>,
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
    .map((r) => {
      const assets = Object.values(frame.assets).filter(
        (asset) => asset.entityId === r.entity.id,
      );
      const controls =
        frame.interactive?.controls.filter(
          (control) => control.entityId === r.entity.id,
        ) ?? [];
      const controlTrack =
        controls.length === 1 && controls[0].controlTrackId
          ? frame.tracks[controls[0].controlTrackId]
          : undefined;
      const noControlResponse =
        controlTrack &&
        (controlTrack.state !== 'tracking' ||
          Date.parse(frame.effectiveAt) -
            Date.parse(controlTrack.latest.timestamp) >
            1000);
      return Object.freeze({
        ref: Object.freeze({ kind: 'entity' as const, id: r.entity.id }),
        trackId: r.track!.id,
        position: r.track!.latest.position,
        affiliation: r.entity.affiliation,
        label: r.entity.label,
        selected: session.selection.items.some(
          (i) => i.kind === 'entity' && i.id === r.entity.id,
        ),
        stale: r.entity.presence !== 'present' || r.track!.state !== 'tracking',
        managed: assets.length > 0,
        unavailable:
          r.entity.condition === 'non-operational'
            ? 'Down'
            : r.entity.presence !== 'present' ||
                r.track!.state !== 'tracking' ||
                noControlResponse
              ? 'No response'
              : assets.some((asset) => asset.availability !== 'available') ||
                  (assets.length > 0 && r.entity.condition !== 'operational')
                ? 'Unavailable'
                : undefined,
      });
    });
  const selected = rows.find((r) => r.entity.id === selectedId);
  const destinations: SceneDestination[] = (frame.interactive?.executions ?? [])
    .filter(
      (e) =>
        !terminalExecution(e) &&
        session.selection.items.some(
          (i) => i.kind === 'entity' && i.id === e.entityId,
        ),
    )
    .map((e) => ({
      id: e.id,
      entityId: e.entityId,
      position: {
        ...e.destination,
        altitude: {
          ...e.destination.altitude,
          reference: 'ELLIPSOID',
          datumId: 'WGS84',
        },
      },
      stage: 'accepted',
      label: frame.entities[e.entityId]?.label ?? 'Destination',
    }));
  const draft = session.movementDraft;
  if (draft && draft.context.missionId === frame.mission.id) {
    let intent = draft.intent;
    try {
      intent ??= reviewMovement(draft);
    } catch {
      /* Invalid authoring has no projected endpoint. */
    }
    const pending = interactive?.pending?.body;
    const receipt = interactive?.movementReceipt;
    const requested =
      draft.phase === 'submitted' &&
      !(frame.interactive?.executions ?? []).some(
        (e) => e.commandId === draft.requestId,
      ) &&
      ((pending &&
        'move' in pending &&
        pending.commandId === draft.requestId) ||
        (receipt &&
          receipt.requestId === draft.requestId &&
          receipt.accepted &&
          (receipt.sequence ?? 0) > frame.sequence));
    if (intent && (draft.phase !== 'submitted' || requested)) {
      for (const m of intent.members)
        destinations.push({
          id: `draft:${draft.id}:${m.entityId}`,
          entityId: m.entityId,
          position: {
            ...m.destination,
            altitude: {
              ...m.destination.altitude,
              reference: 'ELLIPSOID',
              datumId: 'WGS84',
            },
          },
          stage: requested ? 'requested' : 'draft',
          label: `${requested ? 'REQUESTED' : 'DRAFT'} · ${frame.entities[m.entityId]?.label ?? m.entityId}`,
        });
    }
  }
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
    destinations: Object.freeze(destinations),
    zones: Object.freeze(
      session.overlays.zones
        ? activeZones(frame, session.filters).map((z) =>
            Object.freeze({
              ref: Object.freeze({ kind: 'zone' as const, id: z.id }),
              label: z.label,
              boundaryType: frame.boundaryRules?.zones[z.id],
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
    localHome:
      frame.interactive?.templateId?.startsWith('singapore-local-v') &&
      frame.mission.referencePoint
        ? {
            center: {
              longitudeDeg: frame.mission.referencePoint.longitudeDeg + 0.002,
              latitudeDeg: frame.mission.referencePoint.latitudeDeg + 0.002,
            },
            groundSpanM: 1100,
            headingTrueDeg: 0,
            focusHeightM: 150,
          }
        : undefined,
    region:
      regionalMissions[frame.mission.id] ??
      (frame.interactive?.templateId?.startsWith('singapore-local-v')
        ? regionalMissions['fixture-tactical']
        : undefined),
  });
}
