/** Shared CSS-pixel gesture arbitration. Renderers retain camera and surface ownership. */
export interface ScreenPoint {
  x: number;
  y: number;
}
export type CursorMode = 'select' | 'pan' | 'destination' | 'draw' | 'vertex';
export const DRAG_THRESHOLD = 5;
export function isDrag(start: ScreenPoint, end: ScreenPoint) {
  return Math.hypot(end.x - start.x, end.y - start.y) > DRAG_THRESHOLD;
}
export function insideRectangle(
  point: ScreenPoint,
  a: ScreenPoint,
  b: ScreenPoint,
) {
  return (
    point.x >= Math.min(a.x, b.x) &&
    point.x <= Math.max(a.x, b.x) &&
    point.y >= Math.min(a.y, b.y) &&
    point.y <= Math.max(a.y, b.y)
  );
}
interface GestureCallbacks {
  mode(): CursorMode;
  pan(temporary: boolean): void;
  click(point: ScreenPoint, additive: boolean): boolean | void;
  rectangle(start: ScreenPoint, end: ScreenPoint, additive: boolean): void;
  move(point: ScreenPoint): void;
  clear(): void;
  cancelDestination(): void;
  finishBoundary?(): void;
  deleteBoundaryVertex?(): void;
  doubleClick?(point: ScreenPoint, reverse: boolean): void;
  vertexDrag?(start: ScreenPoint, end: ScreenPoint): void;
}
interface Gesture {
  pointerId: number;
  button: number;
  start: ScreenPoint;
  end: ScreenPoint;
  drag: boolean;
  rectangle: boolean;
  temporaryPan: boolean;
  additive: boolean;
}
export class MapGestures {
  private gesture?: Gesture;
  private space = false;
  private lastReleaseClick = false;
  private lastDrawPick = false;
  private pendingDrawClick?: { point: ScreenPoint; additive: boolean };
  private readonly box: HTMLDivElement;
  private readonly removers: (() => void)[] = [];
  constructor(
    private readonly canvas: HTMLCanvasElement,
    container: HTMLElement,
    private readonly callbacks: GestureCallbacks,
  ) {
    this.box = document.createElement('div');
    this.box.setAttribute('aria-hidden', 'true');
    this.box.dataset.selectionRectangle = 'true';
    Object.assign(this.box.style, {
      position: 'absolute',
      display: 'none',
      pointerEvents: 'none',
      zIndex: '3',
      border: '1px solid #edf2f6',
      background: 'rgba(228,238,246,.08)',
      boxShadow: '0 0 0 1px rgba(8,14,20,.5)',
    });
    container.append(this.box);
    const listen = <K extends keyof HTMLElementEventMap>(
      name: K,
      callback: (event: HTMLElementEventMap[K]) => void,
    ) => {
      canvas.addEventListener(name, callback, true);
      this.removers.push(() =>
        canvas.removeEventListener(name, callback, true),
      );
    };
    listen('pointerdown', (event) => {
      if (event.button !== 0 && event.button !== 2) return;
      if (this.gesture) {
        this.cancel(false);
        return;
      }
      const point = this.point(event);
      this.gesture = {
        pointerId: event.pointerId,
        button: event.button,
        start: point,
        end: point,
        drag: false,
        temporaryPan: this.space,
        additive: event.shiftKey || event.ctrlKey || event.metaKey,
        rectangle:
          event.button === 0 && callbacks.mode() === 'select' && !this.space,
      };
      canvas.focus({ preventScroll: true });
      // Capture without swallowing native camera input. Select disables native left-drag.
      canvas.setPointerCapture?.(event.pointerId);
    });
    listen('pointermove', (event) => {
      const gesture = this.gesture;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gesture.end = this.point(event);
      gesture.drag ||= isDrag(gesture.start, gesture.end);
      if (gesture.rectangle && gesture.drag) {
        Object.assign(this.box.style, {
          display: 'block',
          left: `${Math.min(gesture.start.x, gesture.end.x)}px`,
          top: `${Math.min(gesture.start.y, gesture.end.y)}px`,
          width: `${Math.abs(gesture.start.x - gesture.end.x)}px`,
          height: `${Math.abs(gesture.start.y - gesture.end.y)}px`,
        });
      }
    });
    listen('pointerup', (event) => {
      const gesture = this.gesture;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gesture.end = this.point(event);
      gesture.drag ||= isDrag(gesture.start, gesture.end);
      this.cancel(false);
      this.pendingDrawClick = undefined;
      const cameraOwned = gesture.temporaryPan || this.space;
      this.lastReleaseClick = !gesture.drag && !cameraOwned;
      if (gesture.drag || cameraOwned) {
        this.lastDrawPick = false;
        if (
          callbacks.mode() === 'vertex' &&
          gesture.button === 0 &&
          !cameraOwned
        )
          callbacks.vertexDrag?.(gesture.start, gesture.end);
        if (gesture.rectangle && !cameraOwned)
          callbacks.rectangle(gesture.start, gesture.end, gesture.additive);
      } else if (gesture.button === 2) callbacks.move(gesture.end);
      else if (callbacks.mode() === 'draw')
        this.pendingDrawClick = {
          point: gesture.end,
          additive: gesture.additive,
        };
      else callbacks.click(gesture.end, gesture.additive);
    });
    // Native click detail owns the double-click transaction. Its second click
    // must never insert another vertex, even when the pointer drifts by metres
    // on the map. A refused final surface pick must also veto completion.
    listen('click', (event) => {
      if (callbacks.mode() !== 'draw') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const pending = this.pendingDrawClick;
      this.pendingDrawClick = undefined;
      if (pending && event.detail < 2)
        this.lastDrawPick =
          callbacks.click(pending.point, pending.additive) !== false;
    });
    listen('pointercancel', () => this.cancel());
    listen('lostpointercapture', () => {
      // Normal release is followed by click/dblclick. Only unexpected capture
      // loss cancels a still-active gesture and its pending completion.
      if (this.gesture) this.cancel();
    });
    listen('dblclick', (event) => {
      if (callbacks.mode() === 'draw') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (this.lastReleaseClick && this.lastDrawPick)
          callbacks.finishBoundary?.();
        this.lastDrawPick = false;
      } else if (this.lastReleaseClick && callbacks.doubleClick) {
        event.preventDefault();
        event.stopImmediatePropagation();
        callbacks.doubleClick(this.point(event), event.shiftKey);
      }
    });
    listen('contextmenu', (event) => event.preventDefault());
    // MapLibre also recognizes Ctrl-left-drag as rotation. Select owns every
    // left drag, so do not let its compatibility mouse event start a camera drag.
    listen('mousedown', (event) => {
      if (event.button === 0 && callbacks.mode() !== 'pan' && !this.space)
        event.stopImmediatePropagation();
    });
    listen('keydown', (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        this.space = true;
        if (this.gesture) {
          this.gesture.temporaryPan = true;
          this.gesture.rectangle = false;
          this.box.style.display = 'none';
        }
        callbacks.pan(true);
      } else if (event.key === 'Delete' && callbacks.mode() === 'vertex') {
        event.preventDefault();
        event.stopImmediatePropagation();
        callbacks.deleteBoundaryVertex?.();
      } else if (event.key === 'Enter' && callbacks.mode() === 'draw') {
        event.preventDefault();
        event.stopImmediatePropagation();
        callbacks.finishBoundary?.();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (this.gesture) this.cancel();
        else if (['destination', 'draw', 'vertex'].includes(callbacks.mode()))
          callbacks.cancelDestination();
        else callbacks.clear();
      }
    });
    listen('keyup', (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        this.releaseSpace();
      }
    });
    listen('blur', () => {
      this.cancel();
      this.releaseSpace();
    });
  }
  private point(event: MouseEvent): ScreenPoint {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  private releaseSpace() {
    if (!this.space) return;
    this.space = false;
    this.callbacks.pan(false);
  }
  cancel(cancelNative = true) {
    if (cancelNative) {
      this.pendingDrawClick = undefined;
      this.lastReleaseClick = false;
      this.lastDrawPick = false;
    }
    const gesture = this.gesture;
    this.gesture = undefined;
    this.box.style.display = 'none';
    if (gesture && this.canvas.hasPointerCapture?.(gesture.pointerId))
      this.canvas.releasePointerCapture(gesture.pointerId);
    if (gesture && cancelNative) {
      // Releasing capture alone leaves native engine button state down if the
      // eventual release happens outside the canvas. Terminate that input too.
      const rect = this.canvas.getBoundingClientRect();
      const init = {
        button: gesture.button,
        buttons: 0,
        bubbles: true,
        clientX: rect.left + gesture.end.x,
        clientY: rect.top + gesture.end.y,
      };
      if (typeof PointerEvent !== 'undefined')
        this.canvas.dispatchEvent(
          new PointerEvent('pointercancel', {
            ...init,
            pointerId: gesture.pointerId,
            pointerType: 'mouse',
          }),
        );
      this.canvas.dispatchEvent(new MouseEvent('mouseup', init));
    }
  }
  reset() {
    this.cancel();
    this.releaseSpace();
  }
  dispose() {
    this.reset();
    for (const remove of this.removers) remove();
    this.box.remove();
  }
}
