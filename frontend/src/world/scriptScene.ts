import type { Position3D, ScenarioPosition } from '../contracts/generated';
import type { DeepReadonly } from '../contracts/types';
import type { SceneDestination } from '../renderers/contracts';
import type { ScenarioState } from '../services/scenarioClient';
import type { SessionState } from '../state/sessionStore';
import { scriptPlan, actionTime } from './scriptPlan';
import { draftWithActions } from './scriptAuthoring';
const pose = (p: {
  longitudeDeg: number;
  latitudeDeg: number;
  altitude: { metres: number };
}): Position3D & ScenarioPosition => ({
  ...p,
  altitude: {
    metres: p.altitude.metres,
    reference: 'ELLIPSOID',
    datumId: 'WGS84',
  },
});

export function draftScriptDestinations(
  s: DeepReadonly<ScenarioState>,
  session: DeepReadonly<SessionState>,
): SceneDestination[] {
  let content = s.draft;
  try {
    if (s.actionEdit) content = draftWithActions(content, s.actionEdit);
  } catch {
    /* Keep the valid saved draft while numeric entry is incomplete. */
  }
  const selectedIds = new Set(
    [
      ...(s.selectedActionIds ?? []),
      ...(s.actionEdit?.batch?.map((m) => m.id) ?? [s.actionEdit?.id]),
      s.selectedActionId,
    ].filter(
      (id): id is string => !!id && !!content.actions?.some((a) => a.id === id),
    ),
  );
  return scriptPlan(content).flatMap((l) => {
    const unit = content.units.find((u) => u.id === l.action.unitId);
    if (!unit) return [];
    const selected =
      selectedIds.has(l.action.id) ||
      session.selection.items.some(
        (i) => i.kind === 'scenario-unit' && i.id === unit.id,
      );
    if (s.planFilter === 'selected' && !selected) return [];
    const interrupted = l.state === 'Cancelled',
      blocked = ['Failed', 'Skipped', 'Pending'].includes(l.state);
    const status = interrupted
      ? 'INTERRUPTED · destination unreached'
      : blocked
        ? `${l.state.toUpperCase()} · intent only`
        : 'ESTIMATED';
    const label =
      s.planLabels === 'selected' &&
      !(selectedIds.size ? selectedIds.has(l.action.id) : selected)
        ? `→ ${unit.label} · L${l.number}`
        : `${unit.label} · leg ${l.number}\n→ ${actionTime(l.action)}\n${status}`;
    return [
      {
        id: l.action.id,
        entityId: unit.id,
        stage: 'draft',
        selected,
        outcome: l.state,
        label,
        position: pose(l.destination),
        intentOrigin: l.origin && !blocked ? pose(l.origin) : undefined,
        intentEnd: interrupted && l.reached ? pose(l.reached) : undefined,
      },
    ];
  });
}
