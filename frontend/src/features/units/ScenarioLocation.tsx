import { useEffect, useRef } from 'react';
import {
  useOperationalRuntime,
  useOperationalSnapshot,
} from '../../app/OperationalContext';
import { originFor } from '../../world/localGeometry';
import { locationPreview } from '../../services/scenarioClient';
import type { ScenarioContent } from '../../contracts/generated';

export function ScenarioLocation({ viewId }: { viewId?: string }) {
  const runtime = useOperationalRuntime()!;
  const { scenario: s } = useOperationalSnapshot(runtime);
  const origin = originFor(s.draft),
    edit = s.locationEdit;
  const trigger = useRef<HTMLButtonElement>(null),
    input = useRef<HTMLInputElement>(null);
  const wasEditing = useRef(false),
    wasPicking = useRef(false);
  const locked = !!(
    s.pending ||
    s.busy ||
    s.blocked ||
    s.edit ||
    s.boundaryEdit ||
    s.actionEdit ||
    s.reviewing
  );
  useEffect(() => {
    if (edit && !edit.viewId && (!wasEditing.current || wasPicking.current))
      input.current?.focus();
    if (!edit && wasEditing.current) trigger.current?.focus();
    wasEditing.current = !!edit;
    wasPicking.current = !!edit?.viewId;
  }, [edit]);
  let error: string | undefined,
    conflicts: string[] = [];
  if (edit) {
    try {
      conflicts = locationPreview(s.draft as ScenarioContent, edit).conflicts;
    } catch (e) {
      error = (e as Error).message;
    }
  }
  return (
    <section className="scenario-location" aria-label="Scenario location">
      <h2>Scenario location</h2>
      <p className="location-coordinates">
        {origin.longitudeDeg.toFixed(6)}° longitude ·{' '}
        {origin.latitudeDeg.toFixed(6)}° latitude
      </p>
      <p className="units-hint">
        Operating square: ±5 km east/west and north/south. WGS84 coordinates;
        heights remain unchanged.
      </p>
      <div className="units-actions">
        <button
          disabled={locked || !viewId}
          onClick={() => runtime.beginScenarioLocation(viewId)}
        >
          Choose on map
        </button>
        <button
          ref={trigger}
          disabled={locked}
          onClick={() => runtime.beginScenarioLocation()}
        >
          Enter coordinates
        </button>
        <button
          disabled={!viewId || !!error}
          onClick={() => viewId && runtime.showScenarioArea(viewId)}
        >
          Show operating area
        </button>
      </div>
      {edit && (
        <form
          aria-label="Edit scenario location"
          onSubmit={(e) => {
            e.preventDefault();
            runtime.applyScenarioLocation();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              runtime.cancelScenarioLocation();
            }
          }}
        >
          {edit.viewId && (
            <p role="status">
              Click the authoring map to preview an origin. Apply confirms it;
              Esc cancels.
            </p>
          )}
          <div className="units-pose">
            <label>
              Longitude · °
              <input
                ref={input}
                aria-label="Origin longitude"
                inputMode="decimal"
                maxLength={64}
                value={edit.longitude}
                disabled={locked}
                onChange={(e) =>
                  runtime.editScenarioLocation({ longitude: e.target.value })
                }
              />
            </label>
            <label>
              Latitude · °
              <input
                aria-label="Origin latitude"
                inputMode="decimal"
                maxLength={64}
                value={edit.latitude}
                disabled={locked}
                onChange={(e) =>
                  runtime.editScenarioLocation({ latitude: e.target.value })
                }
              />
            </label>
          </div>
          <p className="units-hint">
            Preview only. Supported origins: 80°S–80°N; the square must not
            cross the date line. Existing units, routes and boundaries stay in
            place.
          </p>
          {error && (
            <p role="alert" className="units-notice">
              {error}
            </p>
          )}
          {!!conflicts.length && (
            <div className="units-notice" role="alert">
              <p>Cannot apply: these items fall outside the proposed square.</p>
              <ul className="location-conflicts">
                {conflicts.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="units-actions">
            <button
              type="submit"
              className="units-primary"
              disabled={locked || !!error || !!conflicts.length}
            >
              Apply origin
            </button>
            <button
              type="button"
              disabled={!!s.pending || s.busy}
              onClick={() => runtime.cancelScenarioLocation()}
            >
              Cancel origin change
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
