import type { ObservedHistory } from '../contracts/generated';
import type { DeepReadonly, ImmutableFrame } from '../contracts/types';
import type { FilterState } from '../state/sessionStore';
import type { EntityRow } from './entityRows';
import { historyFitsFrame } from './observedHistory';

/** One displayed-track subset drives map geometry and inspector counts. Trimming
 * to the current window keeps older, explicitly dated reads safe while refreshing.
 * Original segment boundaries, source refs and sample objects are retained. */
export function observedSegments(
  frame: ImmutableFrame,
  filters: DeepReadonly<FilterState>,
  row: EntityRow | undefined,
  history: DeepReadonly<ObservedHistory> | undefined,
  windowSeconds = history?.windowSeconds ?? 60,
) {
  if (
    !row?.visible ||
    !row.track ||
    !history ||
    history.entityId !== row.entity.id ||
    !historyFitsFrame(history, frame)
  )
    return [];
  const start =
    Date.parse(frame.effectiveAt) -
    Math.min(history.windowSeconds, windowSeconds) * 1000;
  return history.segments
    .filter(
      (s) =>
        s.trackId === row.track!.id &&
        (!filters.sourceIds.length || filters.sourceIds.includes(s.source.id)),
    )
    .map((s) => ({
      ...s,
      points: s.points.filter((p) => Date.parse(p.sample.timestamp) >= start),
    }))
    .filter((s) => s.points.length > 0);
}
