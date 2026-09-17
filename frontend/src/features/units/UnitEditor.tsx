import { Copy, Crosshair, LocateFixed, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import type { UnitPlacement } from '../../contracts/generated';
import type { DeepReadonly } from '../../contracts/types';
import {
  unitEditFields,
  type ScenarioUnitEdit,
} from '../../services/scenarioClient';

export function UnitEditor({
  unit,
  edit,
  disabled,
  error,
  onEdit,
  onApply,
  onDiscard,
  onReposition,
  onDelete,
  onLocate,
  onDuplicate,
  canLocate,
  canDuplicate,
}: {
  unit: DeepReadonly<UnitPlacement>;
  edit?: DeepReadonly<ScenarioUnitEdit>;
  disabled: boolean;
  error?: string;
  onEdit: (edit: ScenarioUnitEdit) => void;
  onApply: () => void;
  onDiscard: () => void;
  onReposition: () => void;
  onDelete: () => void;
  onLocate: () => void;
  onDuplicate: () => void;
  canLocate: boolean;
  canDuplicate: boolean;
}) {
  const fields = edit ?? unitEditFields(unit);
  const errorRef = useRef<HTMLParagraphElement>(null);
  return (
    <form
      className="units-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onApply();
        requestAnimationFrame(() => errorRef.current?.focus());
      }}
    >
      <div className="units-section-title">
        <h2>Edit selected unit</h2>
        {edit && <span className="units-edit-state">UNAPPLIED</span>}
      </div>
      <fieldset disabled={disabled}>
        <label>
          Unit label
          <input
            required
            maxLength={64}
            value={fields.label}
            onChange={(e) => onEdit({ ...fields, label: e.target.value })}
          />
        </label>
        <label>
          Command role
          <select
            aria-label="Command role"
            value={fields.commandRole}
            onChange={(e) =>
              onEdit({
                ...fields,
                commandRole: e.target.value as UnitPlacement['commandRole'],
              })
            }
            disabled={unit.category !== 'friendly'}
          >
            <option value="sentinel">Sentinel control</option>
            <option value="observation">Observation only</option>
          </select>
        </label>
        <div className="units-pose">
          {(['longitude', 'latitude', 'altitude', 'heading'] as const).map(
            (key) => (
              <label key={key}>
                {key === 'altitude'
                  ? 'Height · m ellipsoid'
                  : key === 'heading'
                    ? 'Heading · ° true'
                    : `${key.charAt(0).toUpperCase()}${key.slice(1)} · °`}
                <input
                  aria-label={`Unit ${key}`}
                  maxLength={64}
                  inputMode="decimal"
                  value={fields[key]}
                  onChange={(e) => onEdit({ ...fields, [key]: e.target.value })}
                />
              </label>
            ),
          )}
        </div>
        <div className="units-actions">
          <button
            type="button"
            disabled={!!edit || !canLocate}
            onClick={onLocate}
          >
            <Crosshair size={13} />
            Locate
          </button>
          <button
            type="button"
            disabled={!!edit || !canDuplicate}
            onClick={onDuplicate}
          >
            <Copy size={13} />
            Duplicate unit
          </button>
          <button type="submit" disabled={!edit}>
            Apply changes
          </button>
          {edit && (
            <button type="button" onClick={onDiscard}>
              Discard edits
            </button>
          )}
          <button type="button" disabled={!!edit} onClick={onReposition}>
            <LocateFixed size={13} />
            Reposition
          </button>
          <button
            type="button"
            disabled={!!edit}
            aria-label="Delete selected unit"
            onClick={onDelete}
          >
            <Trash2 size={13} />
          </button>
        </div>
      </fieldset>
      {edit && (
        <p className="units-edit-state">
          Apply these edits to the arrangement before saving or running.
        </p>
      )}
      {edit && error && (
        <p className="units-notice" role="alert" tabIndex={-1} ref={errorRef}>
          {error}
        </p>
      )}
    </form>
  );
}
