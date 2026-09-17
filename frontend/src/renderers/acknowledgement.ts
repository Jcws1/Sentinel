import type { SceneProjection } from './contracts';
import type { ScreenPoint } from './gestures';

/** A short-lived input acknowledgement, never a reported position or execution. */
export class DestinationAcknowledgement {
  private readonly element = document.createElement('div');
  private timer?: ReturnType<typeof setTimeout>;
  private value?: SceneProjection['acknowledgement'];
  private expiredId?: string;
  constructor(container: HTMLElement) {
    this.element.setAttribute('aria-hidden', 'true');
    this.element.dataset.destinationAcknowledgement = 'true';
    Object.assign(this.element.style, {
      position: 'absolute',
      display: 'none',
      pointerEvents: 'none',
      zIndex: '3',
      width: '22px',
      height: '22px',
      border: '2px solid #f0f3f6',
      borderRadius: '50%',
      transform: 'translate(-50%, -50%)',
      boxShadow: '0 0 0 2px rgba(8,14,20,.7)',
    });
    container.append(this.element);
  }
  update(value: SceneProjection['acknowledgement']) {
    if (!value) {
      this.hide();
      this.value = undefined;
      return;
    }
    if (this.value?.id !== value.id) {
      clearTimeout(this.timer);
      this.expiredId = undefined;
      const remaining =
        value.expiresAtMs === undefined ? 900 : value.expiresAtMs - Date.now();
      if (remaining <= 0) {
        this.expiredId = value.id;
        this.hide();
      } else
        this.timer = setTimeout(() => {
          this.expiredId = value.id;
          this.hide();
        }, remaining);
    }
    this.value = value;
    this.element.dataset.state = value.state;
    this.element.style.borderStyle =
      value.state === 'pending' ? 'dashed' : 'solid';
    this.element.style.borderColor =
      value.state === 'rejected' ? '#f4bb99' : '#f0f3f6';
    this.element.textContent = value.state === 'rejected' ? '×' : '';
    Object.assign(this.element.style, {
      color: '#f4bb99',
      textAlign: 'center',
      lineHeight: '17px',
    });
  }
  position(
    project: (longitude: number, latitude: number) => ScreenPoint | undefined,
  ) {
    if (!this.value || this.expiredId === this.value.id) return;
    const point = project(this.value.longitudeDeg, this.value.latitudeDeg);
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      this.hide();
      return;
    }
    Object.assign(this.element.style, {
      display: 'block',
      left: `${point.x}px`,
      top: `${point.y}px`,
    });
  }
  private hide() {
    this.element.style.display = 'none';
  }
  dispose() {
    clearTimeout(this.timer);
    this.element.remove();
  }
}
