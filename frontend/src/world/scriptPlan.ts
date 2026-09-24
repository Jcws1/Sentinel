/** Nominal authoring projection only. Backend admission and committed outcomes win. */
import type {
  ScheduledAction,
  ScenarioContent,
  ScenarioPosition,
} from '../contracts/generated';
import type { DeepReadonly } from '../contracts/types';
import { boundaryCrosses, boundaryInsidePath, metricVertex } from './boundaryGeometry';
import { eastScale, type GeometryOwner } from './localGeometry';

export type ScriptPoint = DeepReadonly<ScenarioPosition>;
export interface PlannedLeg {
  action: DeepReadonly<ScheduledAction>;
  number: number;
  state:
    'Pending' | 'Running' | 'Completed' | 'Cancelled' | 'Failed' | 'Skipped';
  startTick?: number;
  endTick?: number;
  origin?: ScriptPoint;
  reached?: ScriptPoint;
  destination: ScriptPoint;
  reason?: string;
  travelled: number;
}
const scale = (6378137 * Math.PI) / 180;
import { placementSpeed } from './unitProfiles';
export function scriptDistance(
  a: ScriptPoint,
  b: ScriptPoint,
  geometry?: GeometryOwner,
) {
  const [x, y] = metricVertex([a.longitudeDeg, a.latitudeDeg], geometry),
    [tx, ty] = metricVertex([b.longitudeDeg, b.latitudeDeg], geometry);
  return Math.hypot(tx - x, ty - y);
}
export function translatePoint(
  point: ScriptPoint,
  x: number,
  y: number,
  geometry?: GeometryOwner,
): ScenarioPosition {
  return {
    ...point,
    altitude: { ...point.altitude },
    longitudeDeg: Number(
      (point.longitudeDeg + x / eastScale(geometry)).toFixed(9),
    ),
    latitudeDeg: Number((point.latitudeDeg + y / scale).toFixed(9)),
  };
}
export function atDistance(
  origin: ScriptPoint,
  target: ScriptPoint,
  travelled: number,
  geometry?: GeometryOwner,
): ScriptPoint {
  const distance = scriptDistance(origin, target, geometry);
  if (travelled >= distance) return target;
  return translatePoint(
    origin,
    ((target.longitudeDeg - origin.longitudeDeg) *
      eastScale(geometry) *
      travelled) /
      distance,
    ((target.latitudeDeg - origin.latitudeDeg) * scale * travelled) / distance,
    geometry,
  );
}
export function actionTime(action: DeepReadonly<ScheduledAction>) {
  return action.afterActionId
    ? `After previous + ${((action.delayMs ?? 0) / 1000).toFixed(1)}s`
    : `${((action.offsetMs ?? 0) / 1000).toFixed(1)}s after Start`;
}
export function compareScriptIds(a: string, b: string) {
  const x = [...a],
    y = [...b];
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    const d = x[i].codePointAt(0)! - y[i].codePointAt(0)!;
    if (d) return d;
  }
  return x.length - y.length;
}
/** Stable per-actor identifiers; timing, not numbering, determines execution order. */
export function actionLegNumbers(
  actions: readonly DeepReadonly<ScheduledAction>[],
) {
  const counts = new Map<string, number>();
  return new Map(
    [...actions]
      .sort((a, b) => a.ordinal - b.ordinal || compareScriptIds(a.id, b.id))
      .map((action) => {
        const number = (counts.get(action.unitId) ?? 0) + 1;
        counts.set(action.unitId, number);
        return [action.id, number] as const;
      }),
  );
}
export function validateActionGraph(content: DeepReadonly<ScenarioContent>) {
  const actions = content.actions ?? [],
    ids = new Map(actions.map((a) => [a.id, a])),
    ticks = new Set<string>(),
    successors = new Set<string>();
  for (const a of actions) {
    const absolute = a.offsetMs != null,
      dependent = !!a.afterActionId && a.delayMs != null;
    if (
      absolute === dependent ||
      (absolute && (a.afterActionId != null || a.delayMs != null))
    )
      throw new Error(
        'Choose an absolute start or previous movement plus delay.',
      );
    if (absolute) {
      const key = `${a.unitId}:${a.offsetMs}`;
      if (ticks.has(key))
        throw new Error('Only one movement start per actor at each tick.');
      ticks.add(key);
    }
    if (!a.afterActionId) continue;
    if (content.scheduleRuleVersion !== 'local-schedule-v2')
      throw new Error(
        'Completion dependencies need the versioned schedule rules.',
      );
    const p = ids.get(a.afterActionId);
    if (!p || p.unitId !== a.unitId)
      throw new Error('Previous movement must belong to this actor.');
    if (successors.has(p.id))
      throw new Error(
        'A movement may have only one completion-dependent successor.',
      );
    successors.add(p.id);
    const seen = new Set([a.id]);
    let current: DeepReadonly<ScheduledAction> | undefined = p;
    while (current) {
      if (seen.has(current.id))
        throw new Error('Movement dependencies cannot contain a cycle.');
      seen.add(current.id);
      current = current.afterActionId
        ? ids.get(current.afterActionId)
        : undefined;
    }
  }
}
const cache = new WeakMap<object, readonly PlannedLeg[]>();
export function scriptPlan(
  content: DeepReadonly<ScenarioContent>,
  lastStartTick = 3000,
): readonly PlannedLeg[] {
  const previous = lastStartTick === 3000 ? cache.get(content) : undefined;
  if (previous) return previous;
  const units = new Map(content.units.map((u) => [u.id, u])),
    positions = new Map(content.units.map((u) => [u.id, u.position])),
    numbers = actionLegNumbers(content.actions ?? []);
  const legs: PlannedLeg[] = (content.actions ?? []).map((a) => ({
    action: a,
    number: numbers.get(a.id)!,
    state: 'Pending',
    travelled: 0,
    destination: {
      ...a.destination,
      altitude: units.get(a.unitId)?.position.altitude ?? {
        metres: 150,
        reference: 'ELLIPSOID',
        datumId: 'WGS84',
      },
    },
  }));
  const byId = new Map(legs.map((l) => [l.action.id, l]));
  const due = (l: PlannedLeg) =>
    l.action.offsetMs != null
      ? l.action.offsetMs / 200
      : byId.get(l.action.afterActionId ?? '')?.state === 'Completed'
        ? byId.get(l.action.afterActionId!)!.endTick! +
          Math.max(1, (l.action.delayMs ?? 0) / 200)
        : undefined;
  function resolveBroken(tick: number) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const l of legs) {
        const p = byId.get(l.action.afterActionId ?? '');
        if (
          l.state === 'Pending' &&
          p &&
          ['Failed', 'Cancelled', 'Skipped'].includes(p.state)
        ) {
          l.state = 'Skipped';
          l.endTick = tick;
          l.reason = `Previous movement is ${p.state.toLowerCase()}.`;
          changed = true;
        }
      }
    }
  }
  for (let tick = 0; tick <= lastStartTick + 3200; tick++) {
    resolveBroken(tick);
    const ready = legs.filter(
      (l) => l.state === 'Pending' && due(l) != null && due(l)! <= tick,
    );
    const absolute = new Set(
      ready
        .filter((l) => l.action.offsetMs != null)
        .map((l) => l.action.unitId),
    );
    ready.sort(
      (a, b) =>
        due(a)! - due(b)! ||
        a.action.ordinal - b.action.ordinal ||
        compareScriptIds(a.action.id, b.action.id),
    );
    for (const l of legs)
      if (l.state === 'Pending' && tick > lastStartTick) {
        l.state = 'Skipped';
        l.endTick = tick;
        l.reason = 'Start exceeds the 600 second window.';
      }
    for (const l of ready) {
      if (l.state !== 'Pending') continue;
      if (l.action.afterActionId && absolute.has(l.action.unitId)) {
        l.state = 'Skipped';
        l.reason = 'Start conflict: explicit time takes precedence.';
        l.endTick = tick;
        continue;
      }
      const origin = positions.get(l.action.unitId);
      if (!origin) {
        l.state = 'Failed';
        l.reason = 'Actor is unavailable.';
        l.endTick = tick;
        continue;
      }
      l.startTick = tick;
      l.origin = origin;
      l.reached = origin;
      const restricted = content.boundaries?.find(
        (b) =>
          b.type === 'restricted' &&
          boundaryCrosses(
            [origin.longitudeDeg, origin.latitudeDeg],
            [l.destination.longitudeDeg, l.destination.latitudeDeg],
            b.vertices.map((v) => [v[0], v[1]]),
            content,
          ),
      );
      if (restricted) {
        l.state = 'Failed';
        l.reason = `Restricted boundary “${restricted.name}”: segment enters, touches or crosses it.`;
        l.endTick = tick;
        continue;
      }
      const keepIn = content.boundaries?.find(
        (boundary) =>
          content.units.find((unit) => unit.id === l.action.unitId)?.commandRole === 'sentinel' &&
          boundary.type === 'keep_in' &&
          !boundaryInsidePath(
            [origin.longitudeDeg, origin.latitudeDeg],
            [l.destination.longitudeDeg, l.destination.latitudeDeg],
            boundary.vertices.map((vertex) => [vertex[0], vertex[1]]),
            content,
          ),
      );
      if (keepIn) {
        l.state = 'Failed';
        l.reason = `Keep In boundary “${keepIn.name}”: straight path leaves or touches the operating area.`;
        l.endTick = tick;
        continue;
      }
      for (const p of legs)
        if (
          p !== l &&
          p.action.unitId === l.action.unitId &&
          p.state === 'Running'
        ) {
          p.state = 'Cancelled';
          p.endTick = tick;
          p.reason = 'Replaced before reaching the intended destination.';
        }
      l.state = 'Running';
    }
    resolveBroken(tick);
    if (tick > 0)
      for (const l of legs) {
        if (l.state !== 'Running' || !l.origin) continue;
        l.travelled = Math.min(
          scriptDistance(l.origin, l.destination, content),
          l.travelled + placementSpeed(units.get(l.action.unitId)!) * 0.2,
        );
        l.reached = atDistance(l.origin, l.destination, l.travelled, content);
        positions.set(l.action.unitId, l.reached);
        if (l.travelled >= scriptDistance(l.origin, l.destination, content)) {
          l.state = 'Completed';
          l.endTick = tick;
        }
      }
    resolveBroken(tick);
    if (legs.every((l) => !['Pending', 'Running'].includes(l.state))) break;
  }
  if (lastStartTick === 3000) cache.set(content, legs);
  return legs;
}
export function positionBefore(
  content: DeepReadonly<ScenarioContent>,
  unitId: string,
  tick: number,
): ScriptPoint {
  const unit = content.units.find((u) => u.id === unitId);
  if (!unit) throw new Error('Actor is unavailable.');
  let result: ScriptPoint = unit.position;
  for (const l of [...scriptPlan(content)]
    .filter(
      (l) => l.action.unitId === unitId && l.origin && l.startTick! < tick,
    )
    .sort((a, b) => a.startTick! - b.startTick!)) {
    if (l.state === 'Failed' || l.state === 'Skipped') continue;
    const steps = Math.max(0, tick - Math.max(1, l.startTick!));
    result = atDistance(
      l.origin!,
      l.destination,
      Math.min(
        l.travelled,
        steps *
          placementSpeed(content.units.find((u) => u.id === l.action.unitId)!) *
          0.2,
      ),
      content,
    );
  }
  return result;
}
