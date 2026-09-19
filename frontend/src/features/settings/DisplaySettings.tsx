import {
  useOperationalRuntime,
  useOperationalSnapshot,
} from '../../app/OperationalContext';
import {
  defaultDisplayPreferences,
  type DisplayPreferences,
} from '../../state/displayPreferences';
import type { WorkspaceBridge } from '../workspace/workspaceBridge';
import './settings.css';

export function DisplaySettings({ bridge }: { bridge: WorkspaceBridge }) {
  const runtime = useOperationalRuntime()!;
  const state = useOperationalSnapshot(runtime);
  const p = state.display ?? defaultDisplayPreferences;
  const update = (patch: Partial<DisplayPreferences>) =>
    runtime.setDisplayPreferences(patch);
  const select = <K extends keyof DisplayPreferences>(
    key: K,
    label: string,
    options: readonly (readonly [DisplayPreferences[K], string])[],
  ) => (
    <label className="display-setting">
      <span>{label}</span>
      <select
        aria-label={label}
        value={String(p[key])}
        onChange={(e) =>
          update({
            [key]:
              typeof p[key] === 'number'
                ? Number(e.target.value)
                : e.target.value,
          })
        }
      >
        {options.map(([value, text]) => (
          <option key={String(value)} value={String(value)}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
  const opacity = (key: 'planOpacity', label: string, disabled: boolean) => (
    <label className="display-setting display-range">
      <span>{label}</span>
      <span>
        <input
          aria-label={label}
          type="range"
          min="20"
          max="100"
          step="5"
          disabled={disabled}
          value={Math.round(p[key] * 100)}
          onChange={(e) => update({ [key]: Number(e.target.value) / 100 })}
        />
        <output>{Math.round(p[key] * 100)}%</output>
      </span>
    </label>
  );
  return (
    <div className="display-settings">
      <header>
        <span className="quiet-label">WORKSPACE PREFERENCES</span>
        <h1>Map display</h1>
        <p>Shared by Tactical and 3D. Changes apply immediately.</p>
      </header>
      <fieldset>
        <legend>Entities</legend>
        {select('entityStyle', 'Entity icons', [
          ['minimal', 'Minimal symbols'],
          ['silhouette', 'Unit silhouettes'],
        ])}
        {select('iconSize', 'Icon size', [
          [24, 'Compact'],
          [28, 'Standard'],
          [36, 'Large'],
        ])}
        {select('labels', 'Entity labels', [
          ['all', 'All entities'],
          ['selected', 'Selected entities'],
          ['minimal', 'Minimal'],
        ])}
        <p className="setting-note">
          Blue friendly · red hostile · yellow unknown. Selection and NON-OP
          remain identifiable in every style.
        </p>
      </fieldset>
      <fieldset>
        <legend>Movement destinations</legend>
        {select('destinationStyle', 'Destination marker', [
          ['ring', 'Ring'],
          ['crosshair', 'Crosshair'],
          ['flag', 'Flag'],
        ])}
        <p className="setting-note">
          Marker style does not change command status or the requested
          destination.
        </p>
      </fieldset>
      <fieldset>
        <legend>Active movement plans</legend>
        <label className="display-setting">
          <span>Show active plans</span>
          <input
            aria-label="Show active plans"
            type="checkbox"
            checked={p.plansVisible}
            onChange={(e) => update({ plansVisible: e.target.checked })}
          />
        </label>
        {select('planScope', 'Plan visibility', [
          ['selected', 'Selected friendlies'],
          ['friendly', 'All eligible friendlies'],
        ])}
        {opacity('planOpacity', 'Plan opacity', !p.plansVisible)}
        <p className="setting-note">
          Dashed lines show accepted movement, Patrol or current pursuit.
          Suspended destinations are labelled. Conductor previews remain
          authoring-only.
        </p>
      </fieldset>
      <footer>
        <span role="status">
          {state.displayPersistence === 'session'
            ? 'Preferences available for this session; local storage is unavailable.'
            : 'Saved locally in this browser.'}
        </span>
        <div>
          <button onClick={() => runtime.resetDisplayPreferences()}>
            Restore defaults
          </button>
          <button
            className="text-control"
            onClick={() => bridge.open('credits')}
          >
            Map credits
          </button>
        </div>
      </footer>
    </div>
  );
}
