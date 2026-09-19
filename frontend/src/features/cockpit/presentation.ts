import type { CesiumProvider } from '../../renderers/cesium/config';
import type { CockpitPose, CockpitState } from '../../world/cockpit';

export type CockpitEnvironment = 'standard' | 'photorealistic';
export const cockpitEnvironmentKey = 'sentinel.cockpit.environment.v1';
type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;
export const videoOverlaysKey = 'sentinel.videoFeed.overlays.v1';
export function readVideoOverlays(storage?: PreferenceStorage): boolean {
  try {
    return (
      (storage ?? globalThis.localStorage)?.getItem(videoOverlaysKey) !==
      'false'
    );
  } catch {
    return true;
  }
}
export function saveVideoOverlays(
  enabled: boolean,
  storage?: PreferenceStorage,
) {
  try {
    (storage ?? globalThis.localStorage)?.setItem(
      videoOverlaysKey,
      String(enabled),
    );
  } catch {
    /* The explicit current-session choice still applies. */
  }
}

export const hasGoogleEnvironment = (provider: CesiumProvider) =>
  !!(provider.googleKey || (provider.token && provider.photorealisticAssetId));

/** Read only an explicit cockpit choice; defaults never overwrite user storage. */
export function readCockpitEnvironment(
  provider: CesiumProvider,
  storage?: PreferenceStorage,
): CockpitEnvironment {
  try {
    const value = (storage ?? globalThis.localStorage)?.getItem(
      cockpitEnvironmentKey,
    );
    if (value === 'standard' || value === 'photorealistic') return value;
  } catch {
    // A blocked browser preference does not prevent viewing.
  }
  return hasGoogleEnvironment(provider) ? 'photorealistic' : 'standard';
}

export function saveCockpitEnvironment(
  environment: CockpitEnvironment,
  storage?: PreferenceStorage,
) {
  try {
    (storage ?? globalThis.localStorage)?.setItem(
      cockpitEnvironmentKey,
      environment,
    );
  } catch {
    // The current pane still retains its explicit choice in React state.
  }
}

export function cockpitNotice(state: CockpitState) {
  switch (state.phase) {
    case 'non-op':
      return { title: 'VIEW INACTIVE', detail: 'NON-OP · simulated loss' };
    case 'ended':
      return { title: 'DEMO ENDED', detail: 'Frozen simulated viewpoint' };
    case 'disconnected':
      return {
        title: 'CONNECTION LOST',
        detail: 'Last valid simulated viewpoint',
        age: true,
      };
    case 'stale':
      return {
        title: 'STALE DATA',
        detail: 'Last valid simulated viewpoint',
        age: true,
      };
    case 'unavailable':
      return { title: 'VIEW UNAVAILABLE', detail: state.reason };
    default:
      return undefined;
  }
}

/** Age of the displayed observation, independent of fresh source heartbeats. */
export function cockpitPoseAge(pose: Readonly<CockpitPose>, now = Date.now()) {
  const seconds = Math.max(
    0,
    Math.floor((now - Date.parse(pose.observedAt)) / 1000),
  );
  return `${seconds} s since pose observation`;
}

/** Report age is telemetry, not evidence that the displayed position is fresh. */
export function cockpitReportAge(
  pose: Readonly<CockpitPose>,
  now = Date.now(),
) {
  const seconds = Math.max(
    0,
    Math.floor((now - Date.parse(pose.reportAt ?? pose.observedAt)) / 1000),
  );
  return `${seconds} s since ${pose.reportAt ? 'source report' : 'observation time'}`;
}
