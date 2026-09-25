/** Domain of missions mapped from external simulation v1 batches. */
export const EXTERNAL_SIMULATION_DOMAIN = 'external-simulation-v1';

/**
 * An external simulation mission becomes "completed" only when its run is
 * ABORTED and its recording is finalized: its tracks are the last recorded
 * samples, not a live picture.
 */
export function finalizedExternalMission(
  mission?: { readonly domain?: string; readonly lifecycle?: string } | null,
) {
  return (
    mission?.domain === EXTERNAL_SIMULATION_DOMAIN &&
    mission.lifecycle === 'completed'
  );
}
