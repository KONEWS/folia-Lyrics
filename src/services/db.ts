import type { MigrationResult } from '../utils/lyrics/renderHints';
import { putCacheEntry, readCacheEntry, readCacheEntriesByPrefix, removeCacheEntry } from './repositories/cacheRepository';

// Local cache access for lyric segmentation, artwork, fonts and audio analysis; online playback persistence is not used.

export const saveToCache = async (key: string, data: unknown): Promise<void> => {
  try {
    await putCacheEntry(key, data);
  } catch (error) {
    console.error('Cache save failed', error);
  }
};

export const getFromCache = async <T>(key: string): Promise<T | null> => {
  try {
    return await readCacheEntry<T>(key);
  } catch {
    return null;
  }
};

export const getCacheEntriesByPrefix = async <T>(prefix: string): Promise<Array<{ key: string; data: T; timestamp: number }>> => {
  try {
    return await readCacheEntriesByPrefix<T>(prefix);
  } catch (error) {
    console.error('Cache prefix scan failed', error);
    return [];
  }
};

export const getFromCacheWithMigration = async <T>(
  key: string,
  migrate: (data: T) => MigrationResult<T>,
): Promise<T | null> => {
  const cached = await getFromCache<T>(key);
  if (!cached) return null;
  const migration = migrate(cached);
  if (migration.changed) {
    void saveToCache(key, migration.value).catch(error => {
      console.warn(`[DB] Failed to write back migrated cache entry: ${key}`, error);
    });
  }
  return migration.value;
};

export const removeFromCache = async (key: string): Promise<void> => {
  try {
    await removeCacheEntry(key);
  } catch (error) {
    console.error('Cache remove failed', error);
  }
};
