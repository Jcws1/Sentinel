import { useState } from 'react';
import type { UnitPlacement } from '../../contracts/generated';
import type { DeepReadonly } from '../../contracts/types';

export function PlacementForm({
  source,
  category,
  onPlace,
  onInvalid,
}: {
  source?: DeepReadonly<UnitPlacement>;
  category: UnitPlacement['category'];
  onInvalid: (message: string) => void;
  onPlace: (
    longitude: number,
    latitude: number,
    pose: {
      altitude: number;
      heading: number;
      commandRole: UnitPlacement['commandRole'];
    },
  ) => boolean | undefined;
}) {
  const [fields, setFields] = useState({
    longitude: '',
    latitude: '',
    altitude: String(source?.position.altitude.metres ?? 150),
    heading: String(source?.headingTrueDeg ?? 0),
    commandRole:
      source?.commandRole ??
      (category === 'friendly' ? 'sentinel' : 'observation'),
  });
  return (
    <details className="units-numeric">
      <summary>Enter coordinates instead</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const numbers = [
            fields.longitude,
            fields.latitude,
            fields.altitude,
            fields.heading,
          ];
          if (!numbers.every((v) => v.trim() && Number.isFinite(Number(v)))) {
            onInvalid('Enter finite longitude, latitude, height and heading.');
            return;
          }
          onPlace(Number(fields.longitude), Number(fields.latitude), {
            altitude: Number(fields.altitude),
            heading: Number(fields.heading),
            commandRole: fields.commandRole,
          });
        }}
      >
        <div className="units-pose">
          {(['longitude', 'latitude', 'altitude', 'heading'] as const).map(
            (key) => (
              <label key={key}>
                {key === 'altitude'
                  ? 'Height · m ellipsoid'
                  : key === 'heading'
                    ? 'Heading · ° true'
                    : `${key === 'longitude' ? 'Longitude' : 'Latitude'} · °`}
                <input
                  aria-label={`Placement ${key}`}
                  inputMode="decimal"
                  required
                  maxLength={64}
                  value={fields[key]}
                  onChange={(e) =>
                    setFields({ ...fields, [key]: e.target.value })
                  }
                />
              </label>
            ),
          )}
        </div>
        <label>
          Command role
          <select
            aria-label="Placement command role"
            disabled={category !== 'friendly' || !!source}
            value={fields.commandRole}
            onChange={(e) =>
              setFields({
                ...fields,
                commandRole: e.target.value as UnitPlacement['commandRole'],
              })
            }
          >
            <option value="sentinel">Sentinel control</option>
            <option value="observation">Observation only</option>
          </select>
        </label>
        <p className="units-hint">
          Local area ±5 km · WGS84 · height 0–5000 m · heading below 360°.{' '}
          {source
            ? 'The existing role is preserved.'
            : 'Friendly affiliation alone does not grant control.'}
        </p>
        <button type="submit" className="units-primary">
          Place at coordinates
        </button>
      </form>
    </details>
  );
}
