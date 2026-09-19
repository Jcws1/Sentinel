import type { ScenarioContent, ScheduledAction } from '../contracts/generated';
import type { DeepReadonly } from '../contracts/types';
import type { ActionEdit } from '../services/scenarioClient';
import {
  actionTime,
  positionBefore,
  scriptPlan,
  translatePoint,
} from './scriptPlan';
import { metricVertex } from './boundaryGeometry';

export function buildActionEdits(
  content: DeepReadonly<ScenarioContent>,
  edit: DeepReadonly<ActionEdit>,
): ScheduledAction[] {
  const members = edit.batch ?? [
    { id: edit.id, unitId: edit.unitId, originalId: edit.originalId },
  ];
  const mode = edit.timingMode ?? 'absolute',
    seconds = Number(
      mode === 'after' ? (edit.delaySeconds ?? '0') : edit.seconds,
    );
  if (
    ![edit.longitude, edit.latitude].every(
      (v) => v.trim() && Number.isFinite(Number(v)),
    ) ||
    !Number.isFinite(seconds) ||
    seconds < 0 ||
    seconds > 600
  )
    throw new Error(
      'Enter finite coordinates and a time/delay from 0 to 600 seconds.',
    );
  const excluded = new Set(members.map((m) => m.originalId).filter(Boolean));
  const plan = scriptPlan(content);
  const actions = members.map((m, index) => {
    const unit = content.units.find((u) => u.id === m.unitId);
    if (!unit || unit.category === 'unknown')
      throw new Error('Choose friendly or hostile scenario actors.');
    const original = content.actions?.find((a) => a.id === m.originalId);
    const previous = !edit.batch
      ? edit.predecessorId
      : (original?.afterActionId ??
        [...plan]
          .filter(
            (l) => l.action.unitId === m.unitId && !excluded.has(l.action.id),
          )
          .sort(
            (a, b) =>
              (a.startTick ?? Infinity) - (b.startTick ?? Infinity) ||
              a.action.ordinal - b.action.ordinal,
          )
          .at(-1)?.action.id);
    const timing =
      mode === 'keep' && original
        ? original.afterActionId
          ? { afterActionId: original.afterActionId, delayMs: original.delayMs }
          : { offsetMs: original.offsetMs }
        : mode === 'after'
          ? { afterActionId: previous, delayMs: Math.round(seconds * 5) * 200 }
          : { offsetMs: Math.round(seconds * 5) * 200 };
    if (mode === 'after' && !previous)
      throw new Error(
        `${unit.label}: add or select a previous movement first.`,
      );
    const prior = plan.find((l) => l.action.id === timing.afterActionId);
    const tick =
      timing.offsetMs != null
        ? timing.offsetMs / 200
        : prior?.state === 'Completed'
          ? prior.endTick! + Math.max(1, (timing.delayMs ?? 0) / 200)
          : undefined;
    if (tick == null)
      throw new Error(
        `${unit.label}: previous movement does not complete in the nominal plan.`,
      );
    const base = original
      ? { ...original.destination, altitude: unit.position.altitude }
      : positionBefore(content, unit.id, tick);
    return {
      base,
      action: {
        id: m.id,
        unitId: m.unitId,
        kind: 'move' as const,
        ...timing,
        ordinal: original?.ordinal ?? Math.min(127, edit.ordinal + index),
        destination: {
          longitudeDeg: Number(edit.longitude),
          latitudeDeg: Number(edit.latitude),
        },
      },
    };
  });
  if (actions.length > 1) {
    const points = actions.map((a) =>
        metricVertex([a.base.longitudeDeg, a.base.latitudeDeg], content),
      ),
      cx = points.reduce((n, p) => n + p[0], 0) / points.length,
      cy = points.reduce((n, p) => n + p[1], 0) / points.length;
    const anchor = metricVertex(
      [Number(edit.longitude), Number(edit.latitude)],
      content,
    );
    for (const entry of actions) {
      const point = translatePoint(
        entry.base,
        anchor[0] - cx,
        anchor[1] - cy,
        content,
      );
      entry.action.destination = {
        longitudeDeg: point.longitudeDeg,
        latitudeDeg: point.latitudeDeg,
      };
    }
  }
  return actions.map((a) => a.action as ScheduledAction);
}
export function draftWithActions(
  content: DeepReadonly<ScenarioContent>,
  edit: DeepReadonly<ActionEdit>,
): ScenarioContent {
  const actions = buildActionEdits(content, edit),
    replaced = new Set(
      (edit.batch ?? [{ originalId: edit.originalId }]).map(
        (m) => m.originalId,
      ),
    );
  return {
    ...content,
    units: content.units as ScenarioContent['units'],
    boundaries: content.boundaries as ScenarioContent['boundaries'],
    actions: [
      ...(content.actions ?? []).filter((a) => !replaced.has(a.id)),
      ...actions,
    ] as ScheduledAction[],
    scheduleRuleVersion:
      content.scheduleRuleVersion === 'local-schedule-v2' ||
      actions.some((a) => a.afterActionId)
        ? 'local-schedule-v2'
        : 'local-schedule-v1',
  };
}
export function batchAnchor(
  content: DeepReadonly<ScenarioContent>,
  unitIds: readonly string[],
  actionIds: readonly string[] = [],
) {
  const points = unitIds.map((id) => {
    const a = content.actions?.find(
      (a) => a.unitId === id && actionIds.includes(a.id),
    );
    return a?.destination ?? content.units.find((u) => u.id === id)!.position;
  });
  return {
    longitude: String(
      Number(
        (
          points.reduce((n, p) => n + p.longitudeDeg, 0) / points.length
        ).toFixed(9),
      ),
    ),
    latitude: String(
      Number(
        (points.reduce((n, p) => n + p.latitudeDeg, 0) / points.length).toFixed(
          9,
        ),
      ),
    ),
  };
}
export function actionPreviewRows(
  content: DeepReadonly<ScenarioContent>,
  edit: DeepReadonly<ActionEdit>,
) {
  try {
    const updated = draftWithActions(content, edit),
      plan = scriptPlan(updated);
    return buildActionEdits(content, edit).map((a) => ({
      id: a.id,
      label: content.units.find((u) => u.id === a.unitId)?.label ?? 'Actor',
      timing: `${actionTime(a)} · estimated start ${plan.find((l) => l.action.id === a.id)?.startTick == null ? 'unavailable' : `${(plan.find((l) => l.action.id === a.id)!.startTick! * 0.2).toFixed(1)}s`}${a.afterActionId ? ` · after leg ${plan.find((l) => l.action.id === a.afterActionId)?.number ?? '?'}` : ''}`,
      destination: a.destination,
    }));
  } catch {
    return [];
  }
}
