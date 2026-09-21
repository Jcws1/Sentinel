import type { DeepReadonly } from '../contracts/types';
import type { Position3D } from '../contracts/generated';
import type { PresentationFrame } from './presentation';
import type { SceneProjection } from '../renderers/contracts';

type Position = DeepReadonly<Position3D>;
interface Segment {
  from: Position;
  to: Position;
  start: number;
  duration: number;
  intent: string;
}
const same = (a: Position, b: Position) =>
  a.longitudeDeg === b.longitudeDeg &&
  a.latitudeDeg === b.latitudeDeg &&
  a.altitude.metres === b.altitude.metres;

/** One presentation clock per shared session. No observation or world mutation. */
export function createMotionPresentation(clock = () => performance.now()) {
  const segments = new Map<string, Segment>();
  const listeners = new Set<(now: number) => void>();
  let previous: PresentationFrame['frame'];
  let arrival = 0,
    cadence = 200,
    animation: number | undefined;
  const intervals: number[] = [];
  let lastPaint = 0;
  function position(s: Segment, now: number): Position {
    const t = Math.max(0, Math.min(1, (now - s.start) / s.duration));
    if (t >= 1) return s.to;
    return {
      longitudeDeg:
        s.from.longitudeDeg + (s.to.longitudeDeg - s.from.longitudeDeg) * t,
      latitudeDeg:
        s.from.latitudeDeg + (s.to.latitudeDeg - s.from.latitudeDeg) * t,
      altitude: s.to.altitude,
    };
  }
  function schedule() {
    if (
      animation != null ||
      !listeners.size ||
      typeof requestAnimationFrame === 'undefined'
    )
      return;
    const now = clock();
    if (![...segments.values()].some((s) => now < s.start + s.duration)) return;
    animation = requestAnimationFrame(() => {
      animation = undefined;
      const at = clock();
      if (lastPaint && at - lastPaint < 1000) {
        intervals.push(at - lastPaint);
        if (intervals.length > 600) intervals.shift();
      }
      lastPaint = at;
      for (const listener of listeners) listener(at);
      schedule();
    });
  }
  function clear() {
    if (animation != null) cancelAnimationFrame(animation);
    animation = undefined;
    segments.clear();
    lastPaint = 0;
  }
  return {
    /** Exact Track sampler shared by maps and the simulated cockpit. */
    sampleTrack(
      frameId: string,
      trackId: string,
      committed: Position,
      now = clock(),
    ): Position {
      const segment =
        frameId === previous?.frameId ? segments.get(trackId) : undefined;
      return segment ? position(segment, now) : committed;
    },
    update(
      presentation: PresentationFrame,
      connected: boolean,
      authoring: boolean,
    ) {
      const frame = presentation.frame,
        now = clock();
      const reduced = globalThis.matchMedia?.(
        '(prefers-reduced-motion: reduce)',
      ).matches;
      const running =
        connected &&
        !authoring &&
        !reduced &&
        presentation.mode === 'live' &&
        presentation.status === 'current' &&
        frame?.interactive?.state === 'running';
      if (
        !running ||
        !frame ||
        previous?.mission.id !== frame.mission.id ||
        previous?.interactive?.executorEpoch !==
          frame.interactive?.executorEpoch ||
        frame.sequence < (previous?.sequence ?? 0)
      ) {
        clear();
        previous = frame;
        arrival = now;
        cadence = 200;
        return;
      }
      if (previous?.frameId === frame.frameId) return;
      const advanced =
        frame.interactive!.tick > (previous?.interactive?.tick ?? -1);
      if (advanced) {
        const elapsed = now - arrival;
        if (elapsed >= 1500) {
          clear();
          previous = frame;
          arrival = now;
          cadence = 200;
          return;
        }
        if (elapsed > 0 && elapsed < 1500)
          cadence = Math.min(500, Math.max(100, cadence * 0.5 + elapsed * 0.5));
        arrival = now;
      }
      for (const [tid, t] of Object.entries(frame.tracks)) {
        const entity = frame.entities[t.entityId],
          old = previous?.tracks[tid],
          s = segments.get(tid);
        const member = frame.fleetBehavior?.members?.find(
          (m) => m.entityId === t.entityId,
        );
        const move = frame.interactive?.executions?.find(
          (e) =>
            e.entityId === t.entityId &&
            ['Accepted', 'Running', 'Suspended'].includes(e.state),
        );
        const source = frame.scenarioSchedule?.actions.find(
          (a) =>
            a.entityId === t.entityId &&
            ['Accepted', 'Running'].includes(a.state),
        );
        const intent =
          member?.assignmentId ??
          move?.id ??
          source?.action.id ??
          member?.id ??
          '';
        const eligible =
          entity?.condition === 'operational' &&
          entity.presence === 'present' &&
          t.state === 'tracking' &&
          !t.latest.discontinuity &&
          Date.parse(frame.effectiveAt) - Date.parse(t.latest.timestamp) <=
            1000 &&
          t.latest.position.altitude.reference === 'ELLIPSOID' &&
          !!t.latest.velocity?.speedMps;
        if (
          !eligible ||
          !old ||
          (s && s.intent !== intent) ||
          old.historySeriesId !== t.historySeriesId
        ) {
          segments.delete(tid);
          continue;
        }
        if (same(old.latest.position, t.latest.position)) continue;
        const from = s ? position(s, now) : old.latest.position;
        segments.set(tid, {
          from,
          to: t.latest.position,
          start: now,
          duration: cadence,
          intent,
        });
      }
      for (const tid of segments.keys())
        if (!frame.tracks[tid]) segments.delete(tid);
      previous = frame;
      schedule();
    },
    project(scene: SceneProjection, now = clock()): SceneProjection {
      if (
        scene.context === 'authoring' ||
        scene.stale ||
        scene.frameId !== previous?.frameId
      )
        return scene;
      return {
        ...scene,
        objects: scene.objects.map((o) => {
          const s = o.trackId && segments.get(o.trackId);
          return s && o.condition === 'operational' && !o.stale
            ? { ...o, position: position(s, now) }
            : o;
        }),
      };
    },
    subscribe(listener: (now: number) => void) {
      listeners.add(listener);
      schedule();
      return () => {
        listeners.delete(listener);
        if (!listeners.size && animation != null) {
          cancelAnimationFrame(animation);
          animation = undefined;
          lastPaint = 0;
        }
      };
    },
    diagnostics: () => ({
      subscribers: listeners.size,
      cadenceMs: cadence,
      frameIntervalsMs: [...intervals],
      activeSegments: segments.size,
    }),
    dispose() {
      clear();
      listeners.clear();
      previous = undefined;
    },
  };
}
