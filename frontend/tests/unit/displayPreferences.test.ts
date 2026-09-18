import { expect, it, vi } from 'vitest';
import {
  createDisplayPreferences,
  defaultDisplayPreferences,
  displayPreferenceKey,
  validateDisplayPreferences,
} from '../../src/state/displayPreferences';

it('validates a versioned isolated preference store without rewriting unrelated or invalid storage on read', () => {
  const storage = {
    getItem: vi.fn(() =>
      JSON.stringify({
        version: 1,
        preferences: {
          entityStyle: 'silhouette',
          iconSize: 999,
          historySeconds: 15,
          historyOpacity: 0.25,
          historyVisible: true,
          credential: 'ignored',
        },
      }),
    ),
    setItem: vi.fn(),
  };
  const preferences = createDisplayPreferences(storage);
  expect(preferences.get()).toEqual({
    ...defaultDisplayPreferences,
    entityStyle: 'silhouette',
  });
  expect(storage.setItem).not.toHaveBeenCalled();
  preferences.update({ destinationStyle: 'flag' });
  expect(storage.setItem.mock.calls[0][0]).toBe(displayPreferenceKey);
  expect(JSON.parse(storage.setItem.mock.calls[0][1])).toEqual({
    version: 1,
    preferences: preferences.get(),
  });
  preferences.update({}, true);
  expect(preferences.get()).toEqual(defaultDisplayPreferences);
});

it.each([
  '{broken',
  '{"version":999,"preferences":{"iconSize":36}}',
  'null',
  '[]',
])('gracefully defaults obsolete or malformed saved data: %s', (raw) => {
  expect(
    createDisplayPreferences({ getItem: () => raw, setItem: () => {} }).get(),
  ).toEqual(defaultDisplayPreferences);
});
it('keeps current-session controls usable when local storage is unavailable or becomes unwritable', () => {
  for (const storage of [
    null,
    {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    },
  ]) {
    const p = createDisplayPreferences(storage);
    expect(p.persistence()).toBe('session');
    p.update({ plansVisible: false });
    expect(p.get().plansVisible).toBe(false);
    expect(p.persistence()).toBe('session');
  }
  expect(
    validateDisplayPreferences({
      historyOpacity: NaN,
      planOpacity: Infinity,
      historyVisible: 'true',
    }),
  ).toEqual(defaultDisplayPreferences);
});
