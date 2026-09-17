import type { ImmutableFrame, DeepReadonly } from '../contracts/types';
import type { SessionState } from '../state/sessionStore';
import type { WorldCache } from '../state/worldStore';
import type { HistoryCache } from './historyCache';

export interface PresentationFrame {
  status: 'empty' | 'current' | 'stale' | 'seeking';
  mode: 'live' | 'replay';
  frame?: ImmutableFrame;
  sourceDelayed?: boolean;
}

/** Select one whole frame. Never combine live dictionaries with historical time. */
export function derivePresentation(
  world: WorldCache,
  session: DeepReadonly<SessionState>,
  history: HistoryCache,
  backendNow?: string,
): PresentationFrame {
  if (session.time.mode === 'replay') {
    const frame =
      session.missionId && session.time.resolvedFrameId
        ? history.get(
            session.missionId,
            session.time.recordingId,
            session.time.resolvedFrameId,
          )
        : undefined;
    return { status: frame ? 'current' : 'seeking', mode: 'replay', frame };
  }
  const frame =
    world.live?.mission.id === session.missionId ? world.live : undefined;
  const sourceDelayed =
    frame?.interactive?.state === 'running' &&
    !!backendNow &&
    (!frame.interactive.lastReportAt ||
      Date.parse(backendNow) - Date.parse(frame.interactive.lastReportAt) >
        2000);
  return {
    status: !frame
      ? 'empty'
      : world.connection === 'connected' && !sourceDelayed
        ? 'current'
        : 'stale',
    mode: 'live',
    frame,
    ...(sourceDelayed ? { sourceDelayed: true } : {}),
  };
}
