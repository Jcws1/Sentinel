import { expect, it, vi } from 'vitest';
import { createScenarioClient } from '../../src/services/scenarioClient';
import {
  boundaryContains,
  boundaryInsidePath,
  validateBoundary,
} from '../../src/world/boundaryGeometry';
import { layoutLabels } from '../../src/renderers/labelLayout';

it('retains a valid 3D label offset during small camera changes', () => {
  const anchor = {
    id: 'a',
    x: 100,
    y: 15,
    width: 70,
    height: 20,
    offsetX: 18,
    offsetY: 0,
  };
  const first = layoutLabels([anchor], 400, 300)[0];
  const next = layoutLabels(
    [{ ...anchor, y: 19, previous: first }],
    400,
    300,
  )[0];
  expect(first.offsetY).toBe(28);
  expect(next.offsetY).toBe(first.offsetY);
});
import { MapGestures } from '../../src/renderers/gestures';
import type { BoundaryDefinition } from '../../src/contracts/generated';
function setup() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (k: string) => values.get(k) ?? null,
    setItem: (k: string, v: string) => {
      values.set(k, v);
    },
    removeItem: (k: string) => {
      values.delete(k);
    },
  } as Storage;
  const fetcher = vi.fn(
    async () =>
      new Response(JSON.stringify({ schemaVersion: '1.1', scenarios: [] })),
  );
  const options = { base: '/api', storage, fetcher, publish: vi.fn() };
  return { client: createScenarioClient(options), options, values };
}
const vertices: [number, number][] = [
  [103.851, 1.291],
  [103.854, 1.291],
  [103.854, 1.294],
  [103.851, 1.294],
];
it('deduplicates final double click, applies an untyped ring, and protects edits through reload', () => {
  const { client, options } = setup();
  client.enter();
  client.beginBoundary('tactical');
  for (const v of vertices) client.boundaryPoint(...v);
  client.boundaryPoint(...vertices[3]);
  expect(client.get().boundaryEdit?.vertices).toHaveLength(4);
  expect(client.applyBoundary()).toBe(true);
  const b = client.get().draft.boundaries![0];
  expect(b.type).toBe('untyped');
  client.beginBoundary('tactical', b.id);
  client.editBoundary({
    name: 'Unapplied name',
    vertices: [['bad', '1.29'], ...vertices.slice(1).map((v) => v.map(String))],
  });
  expect(client.applyBoundary()).toBe(false);
  client.update({ name: 'Forbidden replacement', units: [] });
  client.newDraft();
  expect(client.get().draft.boundaries![0].name).toBe(b.name);
  const restored = createScenarioClient(options);
  expect(restored.get().boundaryEdit?.name).toBe('Unapplied name');
  expect(restored.get().boundaryEdit?.viewId).toBeUndefined();
  expect(restored.get().boundaryEdit?.vertices[0][0]).toBe('bad');
  restored.cancelBoundary();
  expect(restored.get().draft.boundaries![0].name).toBe(b.name);
});
it('previews concave containment and rejects concave patrols and crossings in geometry', () => {
  const b = {
    id: 'b',
    name: 'Concave',
    type: 'restricted',
    vertices: [
      [103.85, 1.29],
      [103.853, 1.29],
      [103.853, 1.291],
      [103.851, 1.291],
      [103.851, 1.293],
      [103.85, 1.293],
    ],
  } as BoundaryDefinition;
  expect(() => validateBoundary(b)).not.toThrow();
  expect(boundaryContains([103.8505, 1.292], b.vertices)).toBe(true);
  expect(boundaryContains([103.852, 1.292], b.vertices)).toBe(false);
  expect(() => validateBoundary({ ...b, type: 'patrol' })).toThrow('convex');
  expect(() =>
    validateBoundary({
      ...b,
      vertices: [vertices[0], vertices[2], vertices[1], vertices[3]],
    }),
  ).toThrow('intersect');
});
it('keeps the whole straight route inside a concave operating area', () => {
  const ring: [number, number][] = [
    [103.85, 1.29], [103.853, 1.29], [103.853, 1.291],
    [103.851, 1.291], [103.851, 1.293], [103.85, 1.293],
  ];
  expect(boundaryInsidePath([103.8505, 1.2905], [103.8525, 1.2905], ring)).toBe(true);
  expect(boundaryInsidePath([103.8505, 1.292], [103.8525, 1.2905], ring)).toBe(false);
  expect(boundaryInsidePath([103.85, 1.2905], undefined, ring)).toBe(false);
});
it('retains exact pending request on an explicit disabled-backend refusal and explains recovery', async () => {
  const { client, options, values } = setup();
  client.enter();
  options.fetcher.mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          code: 'DEMO_DISABLED',
          message: 'Local scenario authoring is disabled.',
        }),
        { status: 403 },
      ),
  );
  await client.save();
  expect(client.get().error).toContain('SENTINEL_DEMO=1');
  const pending = values.get('sentinel.scenario.pending.v1');
  await client.reconcile(true);
  expect(values.get('sentinel.scenario.pending.v1')).toBe(pending);
});
it('draw drag/right orbit cannot finish or move, while guarded double click and Enter can finish', () => {
  const container = document.createElement('div'),
    canvas = document.createElement('canvas');
  container.append(canvas);
  document.body.append(container);
  const callbacks = {
    mode: () => 'draw' as const,
    pan: vi.fn(),
    click: vi.fn(),
    rectangle: vi.fn(),
    move: vi.fn(),
    clear: vi.fn(),
    cancelDestination: vi.fn(),
    finishBoundary: vi.fn(),
  };
  const gestures = new MapGestures(canvas, container, callbacks);
  function pointer(type: string, x: number, y: number, button = 0) {
    const e = new MouseEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
      button,
    });
    Object.defineProperty(e, 'pointerId', { value: 1 });
    canvas.dispatchEvent(e);
  }
  pointer('pointerdown', 0, 0);
  pointer('pointermove', 20, 0);
  pointer('pointerup', 0, 0);
  canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  expect(callbacks.finishBoundary).not.toHaveBeenCalled();
  expect(callbacks.click).not.toHaveBeenCalled();
  pointer('pointerdown', 0, 0, 2);
  pointer('pointermove', 20, 0, 2);
  pointer('pointerup', 0, 0, 2);
  expect(callbacks.move).not.toHaveBeenCalled();
  pointer('pointerdown', 10, 10);
  pointer('pointerup', 10, 10);
  canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  canvas.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
  expect(callbacks.finishBoundary).toHaveBeenCalledTimes(1);
  canvas.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  expect(callbacks.finishBoundary).toHaveBeenCalledTimes(2);
  canvas.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
  );
  expect(callbacks.cancelDestination).toHaveBeenCalledTimes(1);
  gestures.dispose();
  container.remove();
});

it('uses one native double-click vertex despite drift and retains temporary-pan and failed-pick ownership', () => {
  const container = document.createElement('div'),
    canvas = document.createElement('canvas');
  container.append(canvas);
  document.body.append(container);
  const callbacks = {
    mode: () => 'draw' as const,
    pan: vi.fn(),
    click: vi.fn(() => true),
    rectangle: vi.fn(),
    move: vi.fn(),
    clear: vi.fn(),
    cancelDestination: vi.fn(),
    finishBoundary: vi.fn(),
  };
  const gestures = new MapGestures(canvas, container, callbacks);
  const pointer = (type: string, x: number) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: 50,
    });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    canvas.dispatchEvent(event);
  };
  const click = (x: number, detail: number) => {
    pointer('pointerdown', x);
    pointer('pointerup', x);
    canvas.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        detail,
        clientX: x,
        clientY: 50,
      }),
    );
  };
  click(100, 1);
  click(101, 2);
  canvas.dispatchEvent(
    new MouseEvent('dblclick', { bubbles: true, detail: 2 }),
  );
  expect(callbacks.click).toHaveBeenCalledTimes(1);
  expect(callbacks.finishBoundary).toHaveBeenCalledTimes(1);
  callbacks.click.mockClear();
  callbacks.finishBoundary.mockClear();
  gestures.reset();
  canvas.dispatchEvent(
    new KeyboardEvent('keydown', { code: 'Space', bubbles: true }),
  );
  pointer('pointerdown', 100);
  pointer('pointermove', 103);
  canvas.dispatchEvent(
    new KeyboardEvent('keyup', { code: 'Space', bubbles: true }),
  );
  pointer('pointerup', 103);
  canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
  expect(callbacks.click).not.toHaveBeenCalled();
  callbacks.click.mockReturnValue(false);
  click(100, 1);
  click(101, 2);
  canvas.dispatchEvent(
    new MouseEvent('dblclick', { bubbles: true, detail: 2 }),
  );
  expect(callbacks.finishBoundary).not.toHaveBeenCalled();
  canvas.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  expect(callbacks.finishBoundary).toHaveBeenCalledTimes(1);
  gestures.dispose();
  container.remove();
});

it('keeps nearby boundary labels readable without moving geometry or drawing outside the pane', () => {
  const anchors = [100, 155, 210, 225].map((x, i) => ({
    id: String(i),
    x,
    y: 200,
    width: 175,
    height: 34,
    offsetX: 6,
    offsetY: -14,
  }));
  const placed = layoutLabels(anchors, 500, 400);
  expect(placed.every((p) => p.show)).toBe(true);
  const boxes = placed.map((p, i) => ({
    left: anchors[i].x + p.offsetX,
    right: anchors[i].x + p.offsetX + 175,
    top: 200 + p.offsetY - 17,
    bottom: 200 + p.offsetY + 17,
  }));
  for (const [i, a] of boxes.entries()) {
    expect(a.left >= 0 && a.right <= 500 && a.top >= 0 && a.bottom <= 400).toBe(
      true,
    );
    for (const b of boxes.slice(i + 1))
      expect(
        a.left < b.right &&
          a.right > b.left &&
          a.top < b.bottom &&
          a.bottom > b.top,
      ).toBe(false);
  }
  expect(layoutLabels(anchors, 80, 40).every((p) => !p.show)).toBe(true);
});

it('does not finish a capacity-limited ring after its final new map vertex is refused', () => {
  const { client } = setup();
  client.enter();
  client.beginBoundary('tactical');
  for (let i = 0; i < 32; i++)
    client.boundaryPoint(
      103.85 + 0.002 * Math.cos((i * Math.PI) / 16),
      1.29 + 0.002 * Math.sin((i * Math.PI) / 16),
    );
  const canvas = document.createElement('canvas'),
    container = document.createElement('div');
  container.append(canvas);
  document.body.append(container);
  const gestures = new MapGestures(canvas, container, {
    mode: () => 'draw',
    pan: vi.fn(),
    click: () => client.boundaryPoint(103.854, 1.294),
    rectangle: vi.fn(),
    move: vi.fn(),
    clear: vi.fn(),
    cancelDestination: vi.fn(),
    finishBoundary: () => client.applyBoundary(),
  });
  for (const detail of [1, 2]) {
    for (const type of ['pointerdown', 'pointerup']) {
      const event = new MouseEvent(type, {
        bubbles: true,
        clientX: 100,
        clientY: 100,
      });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      canvas.dispatchEvent(event);
    }
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, detail }));
  }
  canvas.dispatchEvent(
    new MouseEvent('dblclick', { bubbles: true, detail: 2 }),
  );
  expect(client.get().boundaryEdit?.vertices).toHaveLength(32);
  expect(client.get().draft.boundaries ?? []).toHaveLength(0);
  expect(client.get().error).toContain('32');
  // Only explicit Finish may accept the existing ring after the refused point.
  expect(client.applyBoundary()).toBe(true);
  gestures.dispose();
  container.remove();
});
