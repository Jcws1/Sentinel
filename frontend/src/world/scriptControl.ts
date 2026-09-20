import type { RuntimeSnapshot } from '../app/runtime';
import type { DirectMoveMember } from '../contracts/generated';

/** Nonpositional intent: a long pause is not a reason to disable Stop. */
export function captureScriptControl(
  state: RuntimeSnapshot,
): DirectMoveMember[] {
  const run = state.presentation.frame?.interactive,
    current = state.interactive.current;
  if (state.scenario.active || state.presentation.mode !== 'live' || !run)
    throw new Error('Open a connected demo.');
  if (run.state === 'ended')
    throw new Error('Demo ended. Recorded inspection is read-only.');
  if (!current || state.connection !== 'connected')
    throw new Error('Open a connected demo.');
  if (state.interactive.pending || state.interactive.busy)
    throw new Error('Resolve the pending command first.');
  if (!current.ownsControl)
    throw new Error('Acquire or reclaim control first.');
  if (
    run.executorEpoch !== current.run.executorEpoch ||
    run.grantRevision !== current.run.grantRevision ||
    run.runRevision !== current.run.runRevision
  )
    throw new Error('Synchronizing demo control.');
  if (!['running', 'paused'].includes(current.run.state))
    throw new Error('Start the demo before using selected controls.');
  const ids = state.session.selection.items
    .filter((i) => i.kind === 'entity')
    .map((i) => i.id);
  if (!ids.length) throw new Error('Select controlled friendly drones.');
  return ids.map((id) => {
    const bindings = current.run.controls.filter((c) => c.entityId === id),
      c = bindings[0];
    if (bindings.length !== 1)
      throw new Error('Every selected entity needs explicit Sentinel control.');
    return {
      assetId: c.assetId,
      entityId: c.entityId,
      executorId: c.executorId,
      sourceId: c.sourceId,
      controlTrackId: c.controlTrackId,
      grantId: c.grantId,
      bindingRevision: c.bindingRevision,
    };
  });
}
export function scriptControlReason(state: RuntimeSnapshot) {
  try {
    captureScriptControl(state);
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : 'Control unavailable.';
  }
}
