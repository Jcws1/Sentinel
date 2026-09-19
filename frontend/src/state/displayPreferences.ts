/** Browser presentation only. No authority, observations or command data. */
export interface DisplayPreferences {
  destinationStyle: 'ring' | 'crosshair' | 'flag';
  entityStyle: 'minimal' | 'silhouette';
  iconSize: 24 | 28 | 36;
  labels: 'all' | 'selected' | 'minimal';
  plansVisible: boolean;
  planScope: 'selected' | 'friendly';
  planOpacity: number;
}
export const displayPreferenceKey = 'sentinel.display.v1';
export const defaultDisplayPreferences: Readonly<DisplayPreferences> =
  Object.freeze({
    destinationStyle: 'ring',
    entityStyle: 'silhouette',
    iconSize: 28,
    labels: 'all',
    plansVisible: true,
    planScope: 'selected',
    planOpacity: 0.7,
  });
type LocalStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function validateDisplayPreferences(value: unknown): DisplayPreferences {
  const result = { ...defaultDisplayPreferences };
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return result;
  const v = value as Record<string, unknown>;
  const choices = {
    destinationStyle: ['ring', 'crosshair', 'flag'],
    entityStyle: ['minimal', 'silhouette'],
    iconSize: [24, 28, 36],
    labels: ['all', 'selected', 'minimal'],
    planScope: ['selected', 'friendly'],
  };
  for (const [key, options] of Object.entries(choices))
    if ((options as readonly unknown[]).includes(v[key]))
      Object.assign(result, { [key]: v[key] });
  if (typeof v.plansVisible === 'boolean') result.plansVisible = v.plansVisible;
  if (
    typeof v.planOpacity === 'number' &&
    Number.isFinite(v.planOpacity) &&
    v.planOpacity >= 0.2 &&
    v.planOpacity <= 1
  )
    result.planOpacity = Math.round(v.planOpacity * 100) / 100;
  return result;
}
export function createDisplayPreferences(storage?: LocalStorage | null) {
  let local: LocalStorage | undefined,
    persistence: 'local' | 'session' = 'local';
  let preferences = { ...defaultDisplayPreferences };
  let raw: string | null | undefined;
  try {
    local = storage === null ? undefined : (storage ?? globalThis.localStorage);
    if (!local) persistence = 'session';
    raw = local?.getItem(displayPreferenceKey);
  } catch {
    persistence = 'session';
  }
  try {
    if (raw) {
      const decoded: unknown = JSON.parse(raw);
      if (
        decoded &&
        typeof decoded === 'object' &&
        'version' in decoded &&
        decoded.version === 1 &&
        'preferences' in decoded
      )
        preferences = validateDisplayPreferences(decoded.preferences);
    }
  } catch {
    /* Malformed preferences fall back without changing other local data. */
  }
  return {
    get: () => Object.freeze({ ...preferences }),
    persistence: () => persistence,
    update(update: Partial<DisplayPreferences>, reset = false) {
      preferences = validateDisplayPreferences(
        reset ? defaultDisplayPreferences : { ...preferences, ...update },
      );
      try {
        if (!local) throw Error('Storage unavailable');
        local.setItem(
          displayPreferenceKey,
          JSON.stringify({ version: 1, preferences }),
        );
        persistence = 'local';
      } catch {
        persistence = 'session';
      }
    },
  };
}
