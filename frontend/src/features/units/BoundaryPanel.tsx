import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Pentagon, Pencil, Trash2 } from 'lucide-react';
import { useOperationalRuntime } from '../../app/OperationalContext';
import { boundaryLabels, boundaryContains } from '../../world/boundaryGeometry';
import type { BoundaryDefinition } from '../../contracts/generated';

export function BoundaryPanel({ viewId }: { viewId?: string }) {
  const runtime = useOperationalRuntime()!;
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    scenario = state.scenario;
  const edit = scenario.boundaryEdit,
    error = useRef<HTMLDivElement>(null),
    pane = useRef<HTMLElement>(null),
    previous = useRef(edit);
  const locked =
    !!scenario.pending ||
    scenario.busy ||
    !!scenario.blocked ||
    !!scenario.edit ||
    !!scenario.placement ||
    scenario.reviewing;
  useEffect(() => {
    if (edit && !previous.current)
      requestAnimationFrame(() =>
        pane.current
          ?.querySelector<HTMLInputElement>('[aria-label="Boundary name"]')
          ?.focus(),
      );
    if (!edit && previous.current)
      requestAnimationFrame(() =>
        pane.current
          ?.querySelector<HTMLButtonElement>('[aria-label="Draw boundary"]')
          ?.focus(),
      );
    previous.current = edit;
  }, [edit]);
  useEffect(() => {
    if (edit && scenario.error)
      requestAnimationFrame(() => error.current?.focus());
  }, [edit, scenario.error]);
  const boundaries = scenario.draft.boundaries ?? [];
  function apply() {
    runtime.applyBoundary();
    requestAnimationFrame(() => error.current?.focus());
  }
  return (
    <section
      className="boundary-panel"
      aria-label="Scenario boundaries"
      ref={pane}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && edit) {
          e.preventDefault();
          runtime.cancelBoundary();
        }
      }}
    >
      <div className="units-section-title">
        <h2>Boundaries</h2>
        <span>{boundaries.length}/16</span>
      </div>
      <p className="units-hint">
        Horizontal footprints at all demo heights. Restricted areas block entry
        and crossing.
      </p>
      {!edit && (
        <button
          aria-label="Draw boundary"
          disabled={locked || !viewId || boundaries.length >= 16}
          onClick={() => runtime.beginBoundary(viewId!)}
        >
          <Pentagon size={14} />
          Draw boundary
        </button>
      )}
      {!edit && !boundaries.length && (
        <p className="units-hint">
          Draw on the map or enter vertices with the keyboard.
        </p>
      )}
      {!edit &&
        boundaries.map((b) => (
          <div className={`boundary-row boundary-${b.type}`} key={b.id}>
            <button
              className="boundary-name"
              onClick={() => runtime.selectBoundary(b.id)}
              aria-pressed={
                state.session.selection.primary?.kind === 'scenario-boundary' &&
                state.session.selection.primary.id === b.id
              }
            >
              <strong>{b.name}</strong>
              <small>{boundaryLabels[b.type]}</small>
            </button>
            <select
              aria-label={`Type of ${b.name}`}
              value={b.type}
              disabled={locked}
              onChange={(e) =>
                runtime.setBoundaryType(
                  b.id,
                  e.target.value as BoundaryDefinition['type'],
                )
              }
            >
              <option value="untyped">Untyped boundary</option>
              <option value="annotation">Annotation only</option>
              <option value="friendly">Friendly</option>
              <option value="patrol">Patrol · not active</option>
              <option value="restricted">Restricted</option>
            </select>
            <div className="units-actions">
              <button
                disabled={locked || !viewId}
                onClick={() => runtime.beginBoundary(viewId!, b.id)}
                aria-label={`Edit ${b.name}`}
              >
                <Pencil size={12} />
                Edit vertices / name
              </button>
              <button
                disabled={locked}
                onClick={() => runtime.deleteBoundary(b.id)}
                aria-label={`Delete ${b.name}`}
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      {edit && (
        <div className="boundary-editor" aria-label="Boundary editor">
          <label>
            Name
            <input
              aria-label="Boundary name"
              maxLength={64}
              value={edit.name}
              onChange={(e) => runtime.editBoundary({ name: e.target.value })}
            />
          </label>
          <p className="units-hint">
            {edit.originalId
              ? 'Drag a handle or revise its coordinates. Select a vertex and press Delete to remove it. Apply keeps the edit; Cancel restores the boundary.'
              : 'Click vertices, then double-click the final vertex or choose Finish. A new boundary starts untyped.'}
          </p>
          <p className="units-hint">
            {edit.viewId
              ? 'Map input armed · Space to pan · right-drag to orbit'
              : 'Map input paused. Resume to continue on the chosen map.'}
          </p>
          {!edit.viewId && (
            <button
              disabled={!viewId}
              onClick={() => runtime.editBoundary({ viewId })}
            >
              Resume on authoring map
            </button>
          )}
          <ol className="boundary-vertices">
            {edit.vertices.map((v, i) => (
              <li
                key={i}
                className={edit.selectedVertex === i ? 'selected' : ''}
              >
                <button
                  aria-label={`Select vertex ${i + 1}`}
                  onClick={() => runtime.editBoundary({ selectedVertex: i })}
                  onKeyDown={(e) => {
                    if (e.key !== 'Delete') return;
                    e.preventDefault();
                    e.stopPropagation();
                    if (!runtime.removeBoundaryVertex(i)) return;
                    requestAnimationFrame(() =>
                      pane.current
                        ?.querySelector<HTMLButtonElement>(
                          `[aria-label="Select vertex ${Math.max(1, Math.min(i + 1, edit.vertices.length - 1))}"]`,
                        )
                        ?.focus(),
                    );
                  }}
                >
                  {i + 1}
                </button>
                <label>
                  Longitude
                  <input
                    aria-label={`Vertex ${i + 1} longitude`}
                    inputMode="decimal"
                    value={v[0]}
                    onChange={(e) =>
                      runtime.editBoundary({
                        vertices: edit.vertices.map((p, j) =>
                          j === i ? [e.target.value, p[1]] : [...p],
                        ),
                      })
                    }
                  />
                </label>
                <label>
                  Latitude
                  <input
                    aria-label={`Vertex ${i + 1} latitude`}
                    inputMode="decimal"
                    value={v[1]}
                    onChange={(e) =>
                      runtime.editBoundary({
                        vertices: edit.vertices.map((p, j) =>
                          j === i ? [p[0], e.target.value] : [...p],
                        ),
                      })
                    }
                  />
                </label>
                <button
                  aria-label={`Remove vertex ${i + 1}`}
                  disabled={!!edit.originalId && edit.vertices.length <= 3}
                  onClick={() => runtime.removeBoundaryVertex(i)}
                >
                  ×
                </button>
              </li>
            ))}
          </ol>
          {!edit.originalId && (
            <button
              disabled={edit.vertices.length >= 32}
              onClick={() => {
                runtime.editBoundary({
                  vertices: [...edit.vertices, ['', '']],
                });
                requestAnimationFrame(() =>
                  pane.current
                    ?.querySelector<HTMLInputElement>(
                      `[aria-label="Vertex ${edit.vertices.length + 1} longitude"]`,
                    )
                    ?.focus(),
                );
              }}
            >
              Add numeric vertex
            </button>
          )}
          {scenario.error && (
            <div
              className="units-notice"
              role="alert"
              tabIndex={-1}
              ref={error}
            >
              {scenario.error}
            </div>
          )}
          <div className="units-actions">
            <button className="units-primary" onClick={apply}>
              {edit.originalId ? 'Apply boundary' : 'Finish boundary'}
            </button>
            <button onClick={() => runtime.cancelBoundary()}>
              Cancel boundary
            </button>
          </div>
        </div>
      )}
      <p className="units-hint">
        Friendly: no-engagement intent. Patrol: footprint only; automatic patrol
        is unavailable.
      </p>
    </section>
  );
}

export function LiveBoundaryList() {
  const runtime = useOperationalRuntime()!;
  const state = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot),
    frame = state.presentation.frame;
  if (!frame?.boundaryRules) return null;
  return (
    <section className="boundary-panel" aria-label="Run boundaries">
      <h2>Run boundaries · frozen</h2>
      <p>
        Horizontal rules at all demo heights. Hidden overlays still enforce
        restrictions.
      </p>
      {Object.entries(frame.boundaryRules.zones).map(([id, kind]) => (
        <div className={`boundary-row boundary-${kind}`} key={id}>
          <strong>{frame.zones[id]?.label}</strong>
          <small>{boundaryLabels[kind]}</small>
        </div>
      ))}
      {Object.entries(frame.boundaryRules.zones)
        .filter(([, kind]) => kind === 'restricted')
        .flatMap(([id]) =>
          Object.values(frame.tracks)
            .filter(
              (t) =>
                Object.values(frame.scenario?.entityIds ?? {}).includes(
                  t.entityId,
                ) &&
                t.source.id === frame.interactive?.sourceId &&
                boundaryContains(
                  [
                    t.latest.position.longitudeDeg,
                    t.latest.position.latitudeDeg,
                  ],
                  frame.zones[id].geometry.coordinates[0]
                    .slice(0, -1)
                    .map((v) => [v[0], v[1]] as const),
                ),
            )
            .map((t) => (
              <p className="units-notice" key={`${id}:${t.id}`} role="status">
                Blocked: {frame.entities[t.entityId].label} is inside/on{' '}
                {frame.zones[id].label}. Its recorded position is retained;
                correct the next scenario revision.
              </p>
            )),
        )}
      <p>
        Friendly records protection intent; automatic patrol and engagement are
        unavailable.
      </p>
    </section>
  );
}
