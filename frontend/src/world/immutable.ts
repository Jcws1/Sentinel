import type { DeepReadonly } from '../contracts/types';

/** Copy every mutable value and use own-key dictionaries, including opaque IDs. */
export function immutableCopy<T>(value: T): DeepReadonly<T> {
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((item: unknown) => immutableCopy(item)),
    ) as DeepReadonly<T>;
  }
  if (value !== null && typeof value === 'object') {
    const copy: Record<string, unknown> = Object.create(null);
    for (const [key, item] of Object.entries(value)) {
      copy[key] = immutableCopy(item);
    }
    return Object.freeze(copy) as DeepReadonly<T>;
  }
  return value as DeepReadonly<T>;
}
