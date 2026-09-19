import type { DeepReadonly, ImmutableFrame } from '../contracts/types';
import type { Position3D } from '../contracts/generated';
import type { SessionState } from '../state/sessionStore';
import type { ConnectionStatus } from '../state/worldStore';
import type { PresentationFrame } from './presentation';
import { entityRows } from './entityRows';
import { visualHeight } from '../renderers/cesium/altitude';

export interface CockpitInput {
  presentation: PresentationFrame;
  session: DeepReadonly<SessionState>;
  connection: ConnectionStatus;
  authoring: boolean;
}
export interface CockpitBinding {
  missionId: string;
  recordingId: string;
  runId?: string;
  entityId: string;
  trackId?: string;
  sourceId: string;
  controlled: boolean;
  label: string;
}
export interface CockpitPose {
  position: DeepReadonly<Position3D>;
  headingTrueDeg: number;
  headingBasis: 'supplied' | 'last valid' | 'north default';
  speedMps?: number;
  frameId: string;
  sequence: number;
  effectiveAt: string;
  observedAt: string;
  reportAt?: string;
}
export type CockpitPhase =
  | 'unavailable'
  | 'non-op'
  | 'ended'
  | 'recorded'
  | 'disconnected'
  | 'stale'
  | 'paused'
  | 'ready'
  | 'running';
const phaseStatus: Record<CockpitPhase, string> = {
  unavailable: 'View unavailable',
  'non-op': 'NON-OP · frozen simulated viewpoint',
  ended: 'Ended · frozen simulated viewpoint',
  recorded: 'Recorded · frozen simulated viewpoint',
  disconnected: 'Disconnected · frozen viewpoint',
  stale: 'Stale · frozen viewpoint',
  paused: 'Paused · frozen viewpoint',
  ready: 'Ready · initial viewpoint',
  running: 'Running · simulated viewpoint',
};
export interface CockpitState {
  binding?: Readonly<CockpitBinding>;
  followSelection: boolean;
  cannotFollow?: string;
  yaw: number;
  pitch: number;
  status: string;
  phase: CockpitPhase;
  reason?: string;
  pose?: Readonly<CockpitPose>;
  interpolating: boolean;
}
export const cockpitKey = (b: Readonly<CockpitBinding>) =>
  JSON.stringify([
    b.missionId,
    b.recordingId,
    b.runId,
    b.entityId,
    b.trackId,
    b.sourceId,
  ]);

function drone(frame: ImmutableFrame, id: string) {
  const entity = frame.entities[id];
  return (
    !!entity &&
    (entity.classification?.code === 'drone' ||
      entity.kind === 'drone' ||
      !!frame.interactive?.templateId?.startsWith('singapore-local-v'))
  );
}

/** Viewing chooses a pose, never a grant or an alternative command source. */
export function cockpitCandidate(
  input: CockpitInput,
  entityId?: string,
):
  | { binding: CockpitBinding; reason?: never }
  | { reason: string; binding?: never } {
  const frame = input.presentation.frame;
  if (input.authoring)
    return { reason: 'Open a live or recorded run to view a simulated drone.' };
  if (!frame || !entityId)
    return {
      reason: 'Select one friendly simulated drone as the primary selection.',
    };
  const entity = frame.entities[entityId];
  if (!entity)
    return { reason: 'The selected entity is missing from this frame.' };
  if (entity.affiliation !== 'friendly' || !drone(frame, entityId))
    return { reason: 'Only friendly simulated drones support a Video Feed.' };
  const controls =
    frame.interactive?.controls.filter((c) => c.entityId === entityId) ?? [];
  if (controls.length > 1)
    return { reason: 'The drone has ambiguous control Track bindings.' };
  const control = controls[0];
  const track = control
    ? control.controlTrackId
      ? frame.tracks[control.controlTrackId]
      : undefined
    : entityRows(frame, input.session.filters).find(
        (r) => r.entity.id === entityId,
      )?.track;
  const source = track?.source ?? entity.provenance.source;
  if (
    source.mode !== 'simulated' &&
    !(source.mode === 'replay' && source.kind === 'simulation')
  )
    return {
      reason: 'The selected pose is not from a supported simulated source.',
    };
  return {
    binding: {
      missionId: frame.mission.id,
      recordingId: frame.recordingId,
      runId: frame.interactive?.runId,
      entityId,
      trackId: control?.controlTrackId ?? track?.id,
      sourceId: control?.sourceId ?? source.id,
      controlled: !!control,
      label: entity.label,
    },
  };
}

/** A bounded frontend read model. No transport, timer, commands or recorded samples. */
export function createCockpitPresentation() {
  let state: CockpitState = {
    followSelection: false,
    yaw: 0,
    pitch: 0,
    status: 'View unavailable',
    phase: 'unavailable',
    interpolating: false,
    reason: 'Select a friendly simulated drone and open Video Feed in Details.',
  };
  let lastHeading: number | undefined;
  let lastPose: CockpitPose | undefined;
  let selectionRevision = -1;
  const bind = (binding: CockpitBinding) => {
    if (!state.binding || cockpitKey(state.binding) !== cockpitKey(binding)) {
      lastHeading = undefined;
      lastPose = undefined;
      state = { ...state, yaw: 0, pitch: 0, pose: undefined };
    }
    state = { ...state, binding };
  };
  return {
    get: () => state,
    open(input: CockpitInput, entityId: string) {
      const candidate = cockpitCandidate(input, entityId);
      if (!candidate.binding) return false;
      bind(candidate.binding);
      state = { ...state, followSelection: false, cannotFollow: undefined };
      return true;
    },
    follow(value: boolean) {
      selectionRevision = -1;
      state = { ...state, followSelection: value, cannotFollow: undefined };
    },
    look(yaw: number, pitch: number) {
      if (!Number.isFinite(yaw) || !Number.isFinite(pitch)) return;
      state = {
        ...state,
        yaw: Math.max(-90, Math.min(90, yaw)),
        pitch: Math.max(-45, Math.min(45, pitch)),
      };
    },
    sync(input: CockpitInput) {
      const frame = input.presentation.frame;
      const old = state.binding;
      if (
        old &&
        (input.authoring ||
          input.session.missionId !== old.missionId ||
          (frame &&
            (frame.recordingId !== old.recordingId ||
              frame.interactive?.runId !== old.runId)))
      ) {
        state = {
          followSelection: false,
          yaw: 0,
          pitch: 0,
          status: 'View unavailable',
          phase: 'unavailable',
          interpolating: false,
          reason:
            'Context changed. Open a subject from the current run in Details.',
        };
        lastPose = undefined;
        lastHeading = undefined;
      }
      if (
        state.followSelection &&
        input.session.selection.revision !== selectionRevision
      ) {
        selectionRevision = input.session.selection.revision;
        const primary = input.session.selection.primary;
        const candidate = cockpitCandidate(
          input,
          primary?.kind === 'entity' ? primary.id : undefined,
        );
        if (candidate.binding) {
          bind(candidate.binding);
          state = { ...state, cannotFollow: undefined };
        } else state = { ...state, cannotFollow: candidate.reason };
      }
      const b = state.binding;
      if (!b) return state;
      const unavailable = (reason: string) => {
        state = {
          ...state,
          status: 'View unavailable',
          phase: 'unavailable',
          reason,
          pose: undefined,
          interpolating: false,
        };
        return state;
      };
      if (!frame)
        return unavailable('No complete presentation frame is available.');
      const entity = frame.entities[b.entityId];
      const track = b.trackId ? frame.tracks[b.trackId] : undefined;
      if (!entity)
        return unavailable('The bound entity is missing from this frame.');
      if (entity.affiliation !== 'friendly' || !drone(frame, b.entityId))
        return unavailable(
          'The bound entity is no longer an eligible friendly drone.',
        );
      if (!track)
        return unavailable(
          'The bound pose Track is missing. Open Details to bind a supported pose.',
        );
      if (
        track.missionId !== b.missionId ||
        track.entityId !== b.entityId ||
        track.source.id !== b.sourceId ||
        (track.source.mode !== 'simulated' &&
          !(
            track.source.mode === 'replay' && track.source.kind === 'simulation'
          ))
      )
        return unavailable(
          'The bound Track/source no longer matches this simulated subject.',
        );
      if (
        b.controlled &&
        !frame.interactive?.controls.some(
          (c) =>
            c.entityId === b.entityId &&
            c.controlTrackId === b.trackId &&
            c.sourceId === b.sourceId,
        )
      )
        return unavailable(
          'The declared control Track changed. Reopen Video Feed explicitly.',
        );
      const sample = track.latest;
      const p = sample.position;
      if (
        !p ||
        !Number.isFinite(p.longitudeDeg) ||
        !Number.isFinite(p.latitudeDeg) ||
        !Number.isFinite(p.altitude.metres)
      )
        return unavailable('A complete finite position is unavailable.');
      const height = visualHeight(p.altitude);
      if (!height || height.quality !== 'ellipsoid')
        return unavailable(
          `Unsupported Video Feed altitude: ${p.altitude.reference}${p.altitude.datumId ? ` / ${p.altitude.datumId}` : ''}. A supported WGS84 ellipsoid height is required.`,
        );
      const nonOp = entity.condition === 'non-operational';
      const ended =
        frame.interactive?.state === 'ended' ||
        frame.mission.lifecycle === 'completed' ||
        track.state === 'ended';
      const recorded = input.presentation.mode === 'replay';
      const disconnected = !recorded && input.connection !== 'connected';
      const stale =
        input.presentation.status === 'stale' ||
        track.state === 'stale' ||
        entity.presence !== 'present' ||
        Date.parse(frame.effectiveAt) - Date.parse(sample.timestamp) > 2000;
      const frozen = disconnected || stale;
      if (!frozen || !lastPose || nonOp || ended || recorded) {
        const supplied = sample.velocity?.headingTrueDeg;
        const headingBasis =
          supplied !== undefined
            ? 'supplied'
            : lastHeading !== undefined
              ? 'last valid'
              : 'north default';
        if (supplied !== undefined) lastHeading = supplied;
        lastPose = {
          position: p,
          headingTrueDeg: lastHeading ?? 0,
          headingBasis,
          speedMps: sample.velocity?.speedMps,
          frameId: frame.frameId,
          sequence: frame.sequence,
          effectiveAt: frame.effectiveAt,
          observedAt: sample.timestamp,
          reportAt:
            b.sourceId === frame.interactive?.sourceId
              ? (frame.interactive?.lastReportAt ?? undefined)
              : undefined,
        };
      }
      const lifecycle = frame.interactive?.state;
      const phase: CockpitPhase = nonOp
        ? 'non-op'
        : ended
          ? 'ended'
          : recorded
            ? 'recorded'
            : disconnected
              ? 'disconnected'
              : stale
                ? 'stale'
                : lifecycle === 'paused'
                  ? 'paused'
                  : lifecycle === 'ready'
                    ? 'ready'
                    : 'running';
      state = {
        ...state,
        binding: { ...b, label: entity.label },
        pose: lastPose,
        reason: undefined,
        phase,
        status: phaseStatus[phase],
        interpolating:
          !nonOp && !ended && !recorded && !frozen && lifecycle === 'running',
      };
      return state;
    },
  };
}
