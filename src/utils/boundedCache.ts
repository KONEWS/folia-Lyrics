// Copyright (c) 2026 chthollyphile
// src/utils/boundedCache.ts: Shared insertion-ordered cache eviction for leaf utilities and visualizers.

/**
 * Stores `value` under `key` in an insertion-ordered Map, first evicting the oldest entry when a new
 * key would push the cache past `limit`. Returns `value` so callers can `return rememberBounded(...)`.
 */
export const rememberBounded = <TKey, TValue>(
    cache: Map<TKey, TValue>,
    key: TKey,
    value: TValue,
    limit: number,
): TValue => {
    if (!cache.has(key) && cache.size >= limit) {
        const oldest = cache.keys().next();
        if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(key, value);
    return value;
};
