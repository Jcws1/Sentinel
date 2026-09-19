import { useEffect, useRef, useState } from 'react';
import {
  useOperationalRuntime,
  useOperationalSnapshot,
} from '../../app/OperationalContext';
import { boundaryLabels } from '../../world/boundaryGeometry';
import type { BoundaryDefinition } from '../../contracts/generated';
import { boundaryEditorContext } from '../../world/boundaryContext';
export function BoundaryMapMenu({
  viewId,
  width,
  height,
}: {
  viewId: string;
  width: number;
  height: number;
}) {
  const runtime = useOperationalRuntime()!,
    state = useOperationalSnapshot(runtime);
  const scenario = boundaryEditorContext(state);
  const menu = scenario.boundaryMenu,
    ref = useRef<HTMLDivElement>(null);
  const [chosen, setChosen] = useState<string>();
  useEffect(() => {
    setChosen(undefined);
    requestAnimationFrame(() => ref.current?.querySelector('button')?.focus());
  }, [menu]);
  useEffect(() => {
    if (!menu || menu.viewId !== viewId) return;
    const dismissOutside = (event: Event) => {
      if (ref.current && !ref.current.contains(event.target as Node))
        runtime.closeBoundaryMenu();
    };
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('focusin', dismissOutside, true);
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('focusin', dismissOutside, true);
    };
  }, [menu, runtime, viewId]);
  if (!menu || menu.viewId !== viewId) return null;
  const close = () => {
    runtime.closeBoundaryMenu();
    document
      .querySelector<HTMLElement>(`[data-view-id="${viewId}"] canvas`)
      ?.focus();
  };
  const id = chosen ?? (menu.ids.length === 1 ? menu.ids[0] : undefined),
    boundary = scenario.draft.boundaries?.find((b) => b.id === id);
  const edit = scenario.boundaryEdit;
  return (
    <div
      className="boundary-menu"
      ref={ref}
      role="dialog"
      aria-label="Boundary actions"
      style={{
        left: Math.max(4, Math.min(menu.x, width - 285)),
        top: Math.max(4, Math.min(menu.y, height - 330)),
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          e.preventDefault();
          close();
        }
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const items = [...ref.current!.querySelectorAll('button')],
            index = items.indexOf(document.activeElement as HTMLButtonElement);
          items[
            (index + (e.key === 'ArrowDown' ? 1 : items.length - 1)) %
              items.length
          ]?.focus();
        }
      }}
    >
      {edit ? (
        <>
          <small>Boundary edit · {edit.vertices.length} vertices</small>
          <button onClick={() => runtime.applyBoundary()}>
            {edit.originalId ? 'Apply boundary' : 'Finish boundary'}
          </button>
          <button onClick={() => runtime.cancelBoundary()}>
            Cancel boundary
          </button>
        </>
      ) : boundary ? (
        <>
          <small>{boundary.name}</small>
          {(
            [
              'friendly',
              'patrol',
              'restricted',
              'annotation',
            ] as BoundaryDefinition['type'][]
          ).map((type) => (
            <button
              key={type}
              onClick={() => {
                runtime.setBoundaryType(boundary.id, type);
                close();
              }}
            >
              {boundaryLabels[type]}
            </button>
          ))}
          <button onClick={() => runtime.beginBoundary(viewId, boundary.id)}>
            Rename / edit vertices
          </button>
          <button
            onClick={() => {
              runtime.deleteBoundary(boundary.id);
              close();
            }}
          >
            Delete boundary
          </button>
        </>
      ) : menu.ids.length ? (
        <>
          <small>Choose overlapping boundary</small>
          {menu.ids.map((id) => (
            <button key={id} onClick={() => setChosen(id)}>
              {scenario.draft.boundaries?.find((b) => b.id === id)?.name}
            </button>
          ))}
        </>
      ) : (
        <small>No boundary here. Choose Draw to begin.</small>
      )}
      <button onClick={close}>Close</button>
    </div>
  );
}
