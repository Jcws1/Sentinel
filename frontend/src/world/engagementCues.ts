import type { DemoOutcome } from '../contracts/generated';
import type { DeepReadonly } from '../contracts/types';
import type { PresentationFrame } from './presentation';

/** Shared transient presentation only. A snapshot/reconnect never replays old outcomes. */
export function createEngagementCues() {
  let previous: { run: string; epoch: string; sequence: number } | undefined;
  let cues: readonly DeepReadonly<DemoOutcome>[] = [];
  return (
    presentation: PresentationFrame,
    connected: boolean,
    authoring: boolean,
  ) => {
    const frame = presentation.frame,
      run = frame?.interactive;
    if (
      !frame ||
      !run ||
      presentation.mode !== 'live' ||
      !connected ||
      authoring ||
      presentation.status !== 'current'
    ) {
      previous = undefined;
      cues = [];
      return cues;
    }
    const same =
      previous?.run === run.runId && previous.epoch === run.executorEpoch;
    if (
      !same ||
      (previous &&
        frame.sequence !== previous.sequence &&
        frame.sequence !== previous.sequence + 1)
    )
      cues = [];
    else if (previous && frame.sequence === previous.sequence + 1) {
      cues = [
        ...cues,
        ...(frame.fleetBehavior?.outcomes ?? []).filter(
          (o) =>
            o.committedSequence === frame.sequence &&
            !cues.some((c) => c.id === o.id),
        ),
      ];
    }
    cues = cues.filter((o) => run.state !== 'ended' && run.tick - o.tick < 3);
    previous = {
      run: run.runId,
      epoch: run.executorEpoch,
      sequence: frame.sequence,
    };
    return cues;
  };
}
