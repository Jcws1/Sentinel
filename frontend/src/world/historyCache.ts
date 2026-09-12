import type { ImmutableFrame, WorldFrame } from '../contracts/types';
import { immutableCopy } from './immutable';

/** Bounded historical cache; never aliases or overwrites the live replica. */
export function createHistoryCache(capacity = 32) {
  if (!Number.isSafeInteger(capacity) || capacity < 1) {
    throw new Error('Historical cache capacity must be a positive integer');
  }
  const frames = new Map<string, ImmutableFrame>();
  const key = (missionId: string, recordingId: string, frameId: string) =>
    JSON.stringify([missionId, recordingId, frameId]);
  return {
    put(frame: WorldFrame | ImmutableFrame) {
      const id = key(frame.mission.id, frame.recordingId, frame.frameId);
      frames.delete(id);
      frames.set(id, immutableCopy(frame));
      while (frames.size > capacity) frames.delete(frames.keys().next().value!);
    },
    get(missionId: string, recordingId: string, frameId: string) {
      return frames.get(key(missionId, recordingId, frameId));
    },
    clear() {
      frames.clear();
    },
    get size() {
      return frames.size;
    },
  };
}
export type HistoryCache = ReturnType<typeof createHistoryCache>;
