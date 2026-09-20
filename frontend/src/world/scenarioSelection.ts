import type { ScenarioContent } from '../contracts/generated';
import type { DeepReadonly } from '../contracts/types';

/** Deletion is a draft-only operation. Existing script dependencies must be
 * resolved explicitly in Conductor; never cascade or partially delete a batch.
 */
export function scenarioDeletionImpact(
  content: DeepReadonly<ScenarioContent>,
  ids: readonly string[],
) {
  const unique = [...new Set(ids)];
  const units = content.units.filter((unit) => unique.includes(unit.id));
  const actions = (content.actions ?? []).filter((action) =>
    unique.includes(action.unitId),
  );
  return {
    units,
    actions,
    missing: unique.filter((id) => !units.some((u) => u.id === id)),
    canDelete:
      units.length > 0 &&
      units.length === unique.length &&
      actions.length === 0,
  };
}
