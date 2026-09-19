import { Cartesian3, Cartesian4, Matrix4, type Camera } from 'cesium';
import type { VideoOverlayFrame } from '../../world/videoOverlay';
import { affiliationSymbols } from '../symbology';
import {
  layoutVideoLabels,
  overlayWindowPoint,
  type OverlayLabel,
  type OverlayPoint,
} from './videoOverlayLayout';

const ns = 'http://www.w3.org/2000/svg';
/** Renderer-owned annotations. Render callbacks only; no timer, React state or layout reads. */
export class VideoEntityOverlay {
  private readonly root: SVGSVGElement;
  private readonly measure: CanvasRenderingContext2D;
  private readonly observer: ResizeObserver;
  private width = 0;
  private height = 0;
  private frame?: VideoOverlayFrame;
  private labels = new Map<string, OverlayLabel>();
  private readonly nodes = new Map<
    string,
    {
      group: SVGGElement;
      marker: SVGPathElement;
      leader: SVGPathElement;
      box: SVGRectElement;
      name: SVGTextElement;
      detail: SVGTextElement;
      width: number;
      secondaryWidth: number;
      signature: string;
    }
  >();
  private readonly matrix = new Matrix4();
  private readonly world = new Cartesian3();
  private readonly clip = new Cartesian4();
  private dirty = true;
  private active = true;
  private updates = 0;
  private visiblePoints: OverlayPoint[] = [];
  constructor(
    surface: HTMLElement,
    private readonly requestRender: () => void,
  ) {
    const doc = surface.ownerDocument;
    this.root = doc.createElementNS(ns, 'svg');
    this.root.classList.add('video-entity-overlay');
    this.root.setAttribute('aria-hidden', 'true');
    surface.append(this.root);
    this.measure = doc.createElement('canvas').getContext('2d')!;
    this.observer = new ResizeObserver(([entry]) => {
      this.width = entry.contentRect.width;
      this.height = entry.contentRect.height;
      this.dirty = true;
      if (this.active) this.requestRender();
    });
    this.observer.observe(surface);
  }
  setActive(active: boolean) {
    this.active = active;
    this.root.style.display = active ? '' : 'none';
    this.dirty = true;
  }
  setFrame(frame?: VideoOverlayFrame) {
    if (!frame && !this.frame) return;
    if (
      this.frame?.bindingKey !== frame?.bindingKey ||
      this.frame?.frameId !== frame?.frameId
    ) {
      // Clear old coordinates synchronously, before the newly bound scene can paint.
      this.root.style.visibility = 'hidden';
      if (this.frame?.bindingKey !== frame?.bindingKey) this.labels.clear();
    }
    this.frame = frame;
    this.dirty = true;
    if (!frame) {
      this.root.replaceChildren();
      this.nodes.clear();
      this.labels.clear();
      this.visiblePoints = [];
    }
    if (this.active) this.requestRender();
  }
  cameraChanged() {
    this.dirty = true;
  }
  render(camera: Camera) {
    if (
      !this.active ||
      !this.dirty ||
      !this.frame ||
      !this.width ||
      !this.height
    )
      return;
    this.dirty = false;
    this.updates++;
    Matrix4.multiply(
      camera.frustum.projectionMatrix,
      camera.viewMatrix,
      this.matrix,
    );
    const alive = new Set<string>(),
      points: OverlayPoint[] = [];
    for (const o of this.frame.objects) {
      const id = o.ref.id;
      alive.add(id);
      let node = this.nodes.get(id);
      if (!node) {
        const make = <K extends keyof SVGElementTagNameMap>(tag: K) =>
          this.root.ownerDocument.createElementNS(ns, tag);
        const group = make('g'),
          marker = make('path'),
          leader = make('path'),
          box = make('rect'),
          name = make('text'),
          detail = make('text');
        group.dataset.entityId = id;
        marker.setAttribute('d', 'M-4 -8H-8V-4 M4 -8H8V-4 M-8 4V8H-4 M8 4V8H4');
        marker.classList.add('video-marker');
        leader.classList.add('video-leader');
        box.classList.add('video-label-back');
        name.classList.add('video-entity-name');
        detail.classList.add('video-entity-detail');
        group.append(leader, marker, box, name, detail);
        this.root.append(group);
        node = {
          group,
          marker,
          leader,
          box,
          name,
          detail,
          width: 0,
          secondaryWidth: 0,
          signature: '',
        };
        this.nodes.set(id, node);
      }
      const signature = [
        o.label,
        o.affiliation,
        o.unavailable,
        o.selected,
      ].join('|');
      if (node.signature !== signature) {
        node.signature = signature;
        const label =
          o.label.length > 26 ? `${o.label.slice(0, 25)}…` : o.label;
        node.name.textContent = label;
        node.detail.textContent = [
          affiliationSymbols[o.affiliation].shortLabel,
          o.unavailable,
        ]
          .filter(Boolean)
          .join(' · ');
        node.group.style.color = affiliationSymbols[o.affiliation].color;
        node.group.dataset.condition = o.unavailable ?? 'current';
        node.group.classList.toggle('is-selected', o.selected);
        this.measure.font = '500 11px Arial';
        node.width = this.measure.measureText(label).width;
        this.measure.font = '9px Arial';
        node.secondaryWidth =
          this.measure.measureText(node.detail.textContent).width +
          Math.max(0, node.detail.textContent.length - 1) * 0.27;
      }
      Cartesian3.fromDegrees(
        o.position.longitudeDeg,
        o.position.latitudeDeg,
        o.position.altitude.metres,
        undefined,
        this.world,
      );
      this.clip.x = this.world.x;
      this.clip.y = this.world.y;
      this.clip.z = this.world.z;
      this.clip.w = 1;
      Matrix4.multiplyByVector(this.matrix, this.clip, this.clip);
      const point = overlayWindowPoint(this.clip, this.width, this.height);
      node.group.style.display = point ? '' : 'none';
      if (point) {
        node.marker.setAttribute(
          'transform',
          `translate(${point.x} ${point.y})`,
        );
        points.push({
          id,
          ...point,
          width: node.width,
          secondaryWidth: node.secondaryWidth,
          selected: o.selected,
        });
      }
    }
    for (const [id, n] of this.nodes)
      if (!alive.has(id)) {
        n.group.remove();
        this.nodes.delete(id);
      }
    this.labels = layoutVideoLabels(
      points,
      this.width,
      this.height,
      this.labels,
    );
    for (const p of points) {
      const n = this.nodes.get(p.id)!,
        b = this.labels.get(p.id);
      for (const el of [n.box, n.name, n.detail, n.leader])
        el.style.display = b ? '' : 'none';
      if (!b) continue;
      n.box.setAttribute('x', String(b.x));
      n.box.setAttribute('y', String(b.y));
      n.box.setAttribute('width', String(b.width));
      n.box.setAttribute('height', String(b.height));
      n.name.setAttribute('x', String(b.x + 6));
      n.name.setAttribute('y', String(b.y + 13));
      n.detail.setAttribute('x', String(b.x + 6));
      n.detail.setAttribute('y', String(b.y + 26));
      n.detail.style.display = b.secondary ? '' : 'none';
      const endX = b.x > p.x ? b.x : b.x + b.width,
        endY = Math.max(b.y + 4, Math.min(b.y + b.height - 4, p.y));
      n.leader.setAttribute(
        'd',
        `M${p.x + (endX > p.x ? 9 : -9)} ${p.y} L${endX} ${endY}`,
      );
    }
    this.visiblePoints = points;
    this.root.style.visibility = 'visible';
  }
  inspect() {
    return {
      enabled: !!this.frame,
      active: this.active,
      updates: this.updates,
      bindingKey: this.frame?.bindingKey,
      frameId: this.frame?.frameId,
      viewport: [this.width, this.height],
      candidates: this.frame?.objects.map((o) => ({
        id: o.ref.id,
        trackId: o.trackId,
        position: o.position,
      })),
      points: this.visiblePoints,
      labels: [...this.labels].map(([id, box]) => ({ id, ...box })),
      nodes: this.nodes.size,
    };
  }
  dispose() {
    this.observer.disconnect();
    this.root.remove();
    this.nodes.clear();
    this.labels.clear();
    this.frame = undefined;
  }
}
