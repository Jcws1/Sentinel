import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MapGestures,
  isDrag,
  insideRectangle,
  type CursorMode,
} from '../../src/renderers/gestures';
import {
  boundsCamera,
  groundSpan,
  localHomeCamera,
  wheelSpanFactor,
  zoomForCamera,
} from '../../src/renderers/camera';
import { constrainCamera, regionalMissions } from '../../src/renderers/regions';
import type { SceneProjection } from '../../src/renderers/contracts';
import { DestinationAcknowledgement } from '../../src/renderers/acknowledgement';

function setup(mode: CursorMode = 'select') {
  const container = document.createElement('div');
  const canvas = document.createElement('canvas');
  canvas.tabIndex = 0;
  container.append(canvas);
  document.body.append(container);
  const callbacks = {
    mode: () => mode,
    pan: vi.fn(),
    click: vi.fn(),
    rectangle: vi.fn(),
    move: vi.fn(),
    clear: vi.fn(),
    cancelDestination: vi.fn(),
  };
  const gestures = new MapGestures(canvas, container, callbacks);
  const pointer = (
    type: string,
    x: number,
    y: number,
    button = 0,
    shiftKey = false,
  ) => {
    const event = new MouseEvent(type, {
      bubbles: true,
      clientX: x,
      clientY: y,
      button,
      shiftKey,
    });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    canvas.dispatchEvent(event);
  };
  const key = (key: string, code = key, type = 'keydown') =>
    canvas.dispatchEvent(new KeyboardEvent(type, { key, code, bubbles: true }));
  return { container, canvas, callbacks, gestures, pointer, key };
}
afterEach(() => {
  document.body.replaceChildren();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe('RTS map gesture arbitration', () => {
  it.each(['pan', 'select'] as const)(
    'selects a click in %s and suppresses right-drag movement even after returning to origin',
    (mode) => {
      const { callbacks, pointer, gestures } = setup(mode);
      pointer('pointerdown', 10, 10);
      pointer('pointerup', 12, 12);
      expect(callbacks.click).toHaveBeenCalledWith({ x: 12, y: 12 }, false);
      pointer('pointerdown', 40, 40, 2);
      pointer('pointermove', 52, 40, 2);
      pointer('pointerup', 40, 40, 2);
      expect(callbacks.move).not.toHaveBeenCalled();
      pointer('pointerdown', 40, 40, 2);
      pointer('pointerup', 41, 40, 2);
      expect(callbacks.move).toHaveBeenCalledTimes(1);
      gestures.dispose();
    },
  );
  it('commits a shifted selection rectangle once; dragging never also clicks', () => {
    const { container, callbacks, pointer, gestures } = setup();
    pointer('pointerdown', 80, 90, 0, true);
    pointer('pointermove', 10, 20, 0, true);
    expect(
      container.querySelector<HTMLElement>('[data-selection-rectangle]')?.style
        .display,
    ).toBe('block');
    expect(callbacks.rectangle).not.toHaveBeenCalled();
    pointer('pointerup', 10, 20, 0, true);
    expect(callbacks.rectangle).toHaveBeenCalledWith(
      { x: 80, y: 90 },
      { x: 10, y: 20 },
      true,
    );
    expect(callbacks.click).not.toHaveBeenCalled();
    gestures.dispose();
  });
  it('Space temporarily pans, Escape cancels first, blur/lost capture/closure never dispatch', () => {
    const { canvas, callbacks, pointer, key, gestures } = setup();
    const nativeRelease = vi.fn();
    canvas.addEventListener('mouseup', nativeRelease);
    key(' ', 'Space');
    pointer('pointerdown', 1, 1);
    pointer('pointermove', 20, 20);
    pointer('pointerup', 20, 20);
    expect(callbacks.rectangle).not.toHaveBeenCalled();
    key(' ', 'Space', 'keyup');
    expect(callbacks.pan.mock.calls).toEqual([[true], [false]]);
    pointer('pointerdown', 1, 1);
    pointer('pointermove', 20, 20);
    key('Escape');
    pointer('pointerup', 20, 20);
    expect(callbacks.rectangle).not.toHaveBeenCalled();
    expect(callbacks.clear).not.toHaveBeenCalled();
    key('Escape');
    expect(callbacks.clear).toHaveBeenCalledOnce();
    pointer('pointerdown', 1, 1, 2);
    canvas.dispatchEvent(new Event('lostpointercapture'));
    pointer('pointerup', 1, 1, 2);
    pointer('pointerdown', 1, 1, 2);
    canvas.dispatchEvent(new Event('blur'));
    pointer('pointerup', 1, 1, 2);
    pointer('pointerdown', 1, 1, 2);
    gestures.dispose();
    pointer('pointerup', 1, 1, 2);
    expect(callbacks.move).not.toHaveBeenCalled();
    expect(nativeRelease).toHaveBeenCalledTimes(4);
  });
  it('Escape cancels temporary destination authoring before clearing selection', () => {
    const { callbacks, key, gestures } = setup('destination');
    key('Escape');
    expect(callbacks.cancelDestination).toHaveBeenCalledOnce();
    expect(callbacks.clear).not.toHaveBeenCalled();
    gestures.dispose();
  });
  it('uses CSS-pixel threshold and rectangle centres independent of direction', () => {
    expect(isDrag({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(false);
    expect(isDrag({ x: 0, y: 0 }, { x: 3, y: 5 })).toBe(true);
    expect(
      insideRectangle({ x: 20, y: 25 }, { x: 30, y: 40 }, { x: 10, y: 20 }),
    ).toBe(true);
    expect(
      insideRectangle({ x: 9, y: 25 }, { x: 30, y: 40 }, { x: 10, y: 20 }),
    ).toBe(false);
  });
});
describe('local camera and fine input policy', () => {
  it('does not replay an expired destination acknowledgement when a pane opens', () => {
    vi.useFakeTimers();
    vi.spyOn(Date, 'now').mockReturnValue(100);
    const container = document.createElement('div');
    const marker = new DestinationAcknowledgement(container);
    marker.update({
      id: 'old',
      longitudeDeg: 103.85,
      latitudeDeg: 1.29,
      state: 'accepted',
      expiresAtMs: 99,
    });
    marker.position(() => ({ x: 20, y: 30 }));
    expect(container.firstElementChild).toHaveProperty('style.display', 'none');
    marker.update({
      id: 'new',
      longitudeDeg: 103.85,
      latitudeDeg: 1.29,
      state: 'pending',
      expiresAtMs: 1000,
    });
    marker.position(() => ({ x: 20, y: 30 }));
    expect((container.firstElementChild as HTMLElement).style.display).toBe(
      'block',
    );
    vi.advanceTimersByTime(900);
    marker.update({
      id: 'new',
      longitudeDeg: 103.85,
      latitudeDeg: 1.29,
      state: 'accepted',
      expiresAtMs: 1000,
    });
    marker.position(() => ({ x: 20, y: 30 }));
    expect((container.firstElementChild as HTMLElement).style.display).toBe(
      'none',
    );
    marker.dispose();
  });
  it('round-trips close spans at narrow and wide viewports without zoom-20 truncation', () => {
    for (const width of [260, 1440, 3000])
      for (const span of [50, 75, 150, 1100]) {
        const camera = {
          center: { longitudeDeg: 103.852, latitudeDeg: 1.292 },
          groundSpanM: span,
          headingTrueDeg: 0,
        };
        expect(
          groundSpan(
            zoomForCamera(camera, width),
            camera.center.latitudeDeg,
            width,
          ),
        ).toBeCloseTo(span, 8);
        expect(
          constrainCamera(camera, regionalMissions['fixture-tactical'])
            .groundSpanM,
        ).toBe(span);
      }
  });
  it('normalizes line/pixel inputs and composes tiny trackpad deltas without overshoot', () => {
    expect(wheelSpanFactor(100, 0, 150)).toBeCloseTo(1.12);
    expect(wheelSpanFactor(6.25, 1, 150)).toBeCloseTo(1.12);
    expect(wheelSpanFactor(-100, 0, 150)).toBeCloseTo(1 / 1.12);
    expect(wheelSpanFactor(1, 0, 150) ** 100).toBeCloseTo(1.12);
    expect(wheelSpanFactor(100, 0, 20_000)).toBeCloseTo(1.25);
  });
  it('fits neighbourhood height in short panes and ignores outliers for local home', () => {
    const scene = {
      localHome: {
        center: { longitudeDeg: 103.852, latitudeDeg: 1.292 },
        groundSpanM: 1100,
        headingTrueDeg: 0,
      },
      objects: [],
      zones: [],
    } as unknown as SceneProjection;
    expect(localHomeCamera(scene, 1000, 800)?.groundSpanM).toBe(1100);
    expect(localHomeCamera(scene, 1200, 400)?.groundSpanM).toBe(1800);
    expect(
      boundsCamera(
        [
          [103.85, 1.29],
          [103.85, 1.3],
        ],
        1000,
        300,
      ).groundSpanM,
    ).toBeGreaterThan(5000);
  });
});
