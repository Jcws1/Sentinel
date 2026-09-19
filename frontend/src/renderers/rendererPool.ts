import type {
  MapMode,
  MapRenderer,
  ProviderStatus,
  SpatialStatus,
} from './contracts';

export interface RendererLease {
  readonly role: 'map' | 'cockpit';
  subject?: string;
  readonly key: string;
  readonly viewId: string;
  readonly mode: MapMode;
  readonly host: HTMLElement;
  renderer?: MapRenderer;
  active: boolean;
  hiddenAt: number;
  status: ProviderStatus;
  spatial?: SpatialStatus;
  changed?: () => void;
}

export const retentionPolicy = Object.freeze({
  maxAlive: 4,
  maxHidden: 2,
  hiddenTtlMs: 120_000,
  hiddenBytes: 512 * 1024 * 1024,
});

/** Session-local resource ownership only. Never serialized with layout or world state.
 * Reservations include imports still in flight, bounding simultaneous construction.
 */
export class RendererPool {
  private readonly leases = new Map<string, RendererLease>();
  private timer?: ReturnType<typeof setTimeout>;
  private disposed = false;

  acquire(
    viewId: string,
    mode: MapMode,
    owner: Document,
    role: 'map' | 'cockpit' = 'map',
    subject?: string,
  ) {
    if (this.disposed) return;
    this.enforce();
    const key = JSON.stringify([viewId, mode, role]);
    let lease = this.leases.get(key);
    if (lease) {
      lease.subject = subject;
      lease.active = true;
      lease.host.hidden = false;
      this.schedule();
      return lease;
    }
    while (this.leases.size >= retentionPolicy.maxAlive) {
      const oldest = this.hidden()[0];
      if (!oldest) return;
      this.evict(oldest);
    }
    const host = owner.createElement('div');
    host.className = 'map-renderer-host';
    host.dataset.rendererProjection = mode;
    lease = {
      role,
      subject,
      key,
      viewId,
      mode,
      host,
      active: true,
      hiddenAt: 0,
      status: { kind: 'loading' },
    };
    this.leases.set(key, lease);
    return lease;
  }

  owns(lease: RendererLease) {
    return !this.disposed && this.leases.get(lease.key) === lease;
  }

  install(lease: RendererLease, renderer: MapRenderer) {
    if (!this.owns(lease) || !lease.active) {
      renderer.dispose();
      return false;
    }
    lease.renderer = renderer;
    return true;
  }

  status(lease: RendererLease, status: ProviderStatus) {
    if (!this.owns(lease)) return;
    lease.status = status;
    lease.changed?.();
    if (!lease.active && !lease.renderer?.canRetain())
      queueMicrotask(() => {
        if (this.owns(lease) && !lease.active) this.evict(lease);
      });
  }

  release(lease: RendererLease) {
    if (!this.owns(lease) || !lease.active) return;
    lease.changed = undefined;
    // Capture/save while host dimensions are still valid. Suspend before hiding.
    lease.renderer?.setActive(false);
    lease.active = false;
    lease.hiddenAt = Date.now();
    lease.host.hidden = true;
    // Keep the resource subtree in the lease, outside the active pane's DOM.
    // This also keeps dormant canvases out of focus navigation and hit testing.
    lease.host.remove();
    if (!lease.renderer?.canRetain()) this.evict(lease);
    this.enforce();
  }

  evict(lease: RendererLease) {
    if (this.leases.get(lease.key) !== lease) return;
    if (lease.active) lease.renderer?.setActive(false);
    lease.active = false;
    this.leases.delete(lease.key);
    lease.changed = undefined;
    lease.renderer?.dispose();
    lease.host.remove();
    this.schedule();
  }

  closeView(viewId: string) {
    for (const lease of [...this.leases.values()])
      if (lease.viewId === viewId) this.evict(lease);
  }

  private hidden() {
    return [...this.leases.values()]
      .filter((lease) => !lease.active)
      .sort((a, b) => a.hiddenAt - b.hiddenAt);
  }

  private enforce() {
    const now = Date.now();
    for (const lease of this.hidden())
      if (
        now - lease.hiddenAt >= retentionPolicy.hiddenTtlMs ||
        !lease.renderer?.canRetain()
      )
        this.evict(lease);
    for (const mode of ['tactical', 'three-d'] as const) {
      const sameMode = this.hidden().filter((lease) => lease.mode === mode);
      for (const lease of sameMode.slice(0, -1)) this.evict(lease);
    }
    let hidden = this.hidden();
    while (
      hidden.length > retentionPolicy.maxHidden ||
      hidden.reduce(
        (sum, lease) => sum + (lease.renderer?.retainedBytes() ?? 0),
        0,
      ) > retentionPolicy.hiddenBytes
    ) {
      this.evict(hidden[0]);
      hidden = this.hidden();
    }
    this.schedule();
  }

  private schedule() {
    clearTimeout(this.timer);
    this.timer = undefined;
    const oldest = this.hidden()[0];
    if (this.disposed || !oldest) return;
    // Recheck accounted bytes and late resource failures without running a viewer.
    this.timer = setTimeout(
      () => this.enforce(),
      Math.max(
        1,
        Math.min(
          5000,
          oldest.hiddenAt + retentionPolicy.hiddenTtlMs - Date.now(),
        ),
      ),
    );
  }

  inspect() {
    return {
      alive: this.leases.size,
      active: [...this.leases.values()].filter((lease) => lease.active).length,
      hidden: this.hidden().length,
      accountedHiddenBytes: this.hidden().reduce(
        (sum, lease) => sum + (lease.renderer?.retainedBytes() ?? 0),
        0,
      ),
      leases: [...this.leases.values()].map((lease) => ({
        role: lease.role,
        subject: lease.subject,
        viewId: lease.viewId,
        mode: lease.mode,
        active: lease.active,
        pending: !lease.renderer,
        hiddenAt: lease.hiddenAt,
      })),
    };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    clearTimeout(this.timer);
    for (const lease of [...this.leases.values()]) this.evict(lease);
  }
}
