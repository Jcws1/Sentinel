import type { RequestErrorEvent, Resource } from 'cesium';

export type RequestFailureCategory =
  'auth' | 'rate-limit' | 'network' | 'service' | 'other';
export interface RequestDiagnostic {
  readonly at: number;
  readonly stage: 'root' | 'tile';
  readonly status?: number;
  readonly category: RequestFailureCategory;
  readonly attempt: number;
  readonly action: 'retrying' | 'blocked' | 'cancelled';
}
export interface RequestRecoveryOptions {
  onDiagnostic?(diagnostic: RequestDiagnostic): void;
  mayRetry?(): boolean;
}

const retryLimit = 2;
const windowLimit = 8;
const windowMs = 60_000;
const diagnosticLimit = 16;

function classification(error?: RequestErrorEvent): {
  status?: number;
  category: RequestFailureCategory;
  transient: boolean;
} {
  const value: unknown = error?.statusCode;
  const status =
    typeof value === 'number' &&
    Number.isInteger(value) &&
    (value === 0 || (value >= 100 && value <= 599))
      ? value
      : undefined;
  if (value === undefined || status === 0)
    return { status, category: 'network', transient: true };
  if (status === 401 || status === 403)
    return { status, category: 'auth', transient: false };
  if (status === 429)
    return { status, category: 'rate-limit', transient: true };
  if (status === 408) return { status, category: 'network', transient: true };
  if (status !== undefined && status >= 500)
    return { status, category: 'service', transient: true };
  return { status, category: 'other', transient: false };
}

function stage(resource?: Resource): RequestDiagnostic['stage'] {
  try {
    return new URL(resource?.url ?? '').pathname.endsWith('/root.json')
      ? 'root'
      : 'tile';
  } catch {
    return 'tile';
  }
}

/** Only consume Retry-After as a delay. Never retain headers or response data. */
function retryAfter(error?: RequestErrorEvent): number {
  const headers: unknown = error?.responseHeaders;
  if (!headers || typeof headers !== 'object') return 0;
  const entry = Object.entries(headers).find(
    ([name]) => name.toLowerCase() === 'retry-after',
  );
  const value: unknown = entry?.[1];
  if (typeof value !== 'string' && typeof value !== 'number') return 0;
  const text = String(value).trim();
  const delay = /^\d+(?:\.\d+)?$/.test(text)
    ? Number(text) * 1000
    : Date.parse(text) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : 0;
}

/** Per-viewer transient request recovery. Configure Resource.retryAttempts = 2.
 * Public Resource cloning preserves this callback; WeakMap attempt counters do
 * not retain child Resources or their credentials. No provider data is cached.
 * The SDK bypasses this hook for navigation-cancelled requests.
 */
export class RequestRecovery {
  private active = true;
  private disposed = false;
  private failures = 0;
  private scheduledRetries = 0;
  private completedRetries = 0;
  private attempts = new WeakMap<Resource, number>();
  private scheduledAt: number[] = [];
  private recent: Readonly<RequestDiagnostic>[] = [];
  private pending = new Set<() => void>();

  constructor(private readonly options: RequestRecoveryOptions = {}) {}

  private canRetry() {
    return this.active && !this.disposed && (this.options.mayRetry?.() ?? true);
  }
  private pruneBudget() {
    const oldest = Date.now() - windowMs;
    this.scheduledAt = this.scheduledAt.filter((at) => at > oldest);
  }
  private record(diagnostic: RequestDiagnostic) {
    const value = Object.freeze({ ...diagnostic });
    this.recent.push(value);
    if (this.recent.length > diagnosticLimit) this.recent.shift();
    if (!this.disposed) this.options.onDiagnostic?.(value);
  }

  readonly retry: Resource.RetryCallback = (resource, error) => {
    if (this.disposed) return Promise.resolve(false);
    this.failures++;
    this.pruneBudget();
    const { status, category, transient } = classification(error);
    const attempt = resource ? (this.attempts.get(resource) ?? 0) + 1 : 1;
    const diagnostic = {
      at: Date.now(),
      stage: stage(resource),
      status,
      category,
      attempt,
    };
    // Do not retry before a server's requested delay. Longer cooldowns require
    // explicit provider recovery instead of leaving an automatic retry queued.
    const requestedDelay = retryAfter(error);
    if (
      !resource ||
      !this.canRetry() ||
      !transient ||
      attempt > retryLimit ||
      this.scheduledAt.length >= windowLimit ||
      requestedDelay > 30_000
    ) {
      this.record({ ...diagnostic, action: 'blocked' });
      return Promise.resolve(false);
    }
    this.attempts.set(resource, attempt);
    this.scheduledAt.push(Date.now());
    this.scheduledRetries++;
    const delay = Math.max(attempt === 1 ? 250 : 1000, requestedDelay);
    return new Promise<boolean>((resolve) => {
      let finished = false;
      const finish = (allowed: boolean) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        this.pending.delete(cancel);
        if (allowed) this.completedRetries++;
        else
          this.record({
            ...diagnostic,
            at: Date.now(),
            action: 'cancelled',
          });
        resolve(allowed);
      };
      const cancel = () => finish(false);
      const timer = setTimeout(() => finish(this.canRetry()), delay);
      this.pending.add(cancel);
      // A callback may synchronously deactivate/dispose the owner. Register the
      // cancellation before publishing so that such transitions cannot leak a retry.
      this.record({ ...diagnostic, action: 'retrying' });
    });
  };

  setActive(active: boolean) {
    if (this.disposed) return;
    this.active = active;
    if (!active) [...this.pending].forEach((cancel) => cancel());
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.active = false;
    [...this.pending].forEach((cancel) => cancel());
    this.attempts = new WeakMap();
  }

  snapshot() {
    this.pruneBudget();
    return Object.freeze({
      active: this.active,
      disposed: this.disposed,
      // Callback failures, not a claim to observe every browser network error.
      failures: this.failures,
      scheduledRetries: this.scheduledRetries,
      completedRetries: this.completedRetries,
      pending: this.pending.size,
      budgetRemaining: Math.max(0, windowLimit - this.scheduledAt.length),
      recent: Object.freeze([...this.recent]),
    });
  }
}
