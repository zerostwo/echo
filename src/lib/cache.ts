import 'server-only';

import { dedupe } from '@/lib/dedupe';
import { getRedisClient } from '@/lib/redis';

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

class LRUCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private defaultTTL: number;

  constructor(maxSize = 500, defaultTTLMs = 2 * 60 * 1000) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTLMs;
  }

  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTTL;
    const expiresAt = Date.now() + ttl;

    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value as string | undefined;
      if (!firstKey) break;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, { value, expiresAt });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  deleteByPattern(pattern: RegExp): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }
    return count;
  }
}

const localCache = new LRUCache<unknown>();

export const CACHE_PREFIXES = {
  VOCAB_PAGINATED: 'vocab:page:',
  VOCAB_STATS: 'vocab:stats:',
  MATERIALS_PAGINATED: 'materials:page:',
  MATERIALS_STATS: 'materials:stats:',
  DASHBOARD_STATS: 'dashboard:stats:',
  DICTIONARIES_PAGINATED: 'dictionaries:page:',
  TRASH_ITEMS: 'trash:items:',
  USER_PROFILE: 'user:profile:',
  DICT_LOOKUP: 'dict:lookup:',
  LEARNING_WORDS: 'learning:words:',
} as const;

export function generateCacheKey(prefix: string, params: Record<string, unknown>): string {
  const hasUserId = params.user_id !== undefined && params.user_id !== null;
  const userIdPart = hasUserId ? [`user_id=${JSON.stringify(params.user_id)}`] : [];
  const sortedParams = Object.keys(params)
    .filter(key => key !== 'user_id')
    .sort()
    .filter(key => params[key] !== undefined && params[key] !== null)
    .map(key => `${key}=${JSON.stringify(params[key])}`);
  return `${prefix}${[...userIdPart, ...sortedParams].join('&')}`;
}

export async function getCache<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (redis) {
    try {
      const data = await redis.get(key);
      if (data === null) return null;
      return JSON.parse(data) as T;
    } catch (error) {
      console.warn('[Cache] Redis get error:', error);
    }
  }

  return localCache.get(key) as T | null;
}

export async function setCache<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
  const ttlMs = ttlSeconds * 1000;
  const redis = getRedisClient();

  if (redis) {
    try {
      await redis.setex(key, ttlSeconds, JSON.stringify(value));
      return;
    } catch (error) {
      console.warn('[Cache] Redis set error:', error);
    }
  }

  localCache.set(key, value, ttlMs);
}

async function deleteByPattern(pattern: string): Promise<number> {
  const redis = getRedisClient();
  if (redis) {
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
      cursor = nextCursor;
      if (keys.length > 0) {
        deleted += await redis.del(...keys);
      }
    } while (cursor !== '0');

    return deleted;
  }

  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  return localCache.deleteByPattern(regex);
}

export async function deleteCache(keyOrPattern: string): Promise<number> {
  const redis = getRedisClient();

  if (keyOrPattern.includes('*')) {
    return deleteByPattern(keyOrPattern);
  }

  if (redis) {
    try {
      return await redis.del(keyOrPattern);
    } catch (error) {
      console.warn('[Cache] Redis delete error:', error);
      return 0;
    }
  }

  localCache.delete(keyOrPattern);
  return 1;
}

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  factory: () => Promise<T>
): Promise<T> {
  return dedupe(`cache:${key}`, async () => {
    const cached = await getCache<T>(key);
    if (cached !== null) return cached;

    const value = await factory();
    await setCache(key, value, ttlSeconds);
    return value;
  });
}

export async function invalidateUserCache(userId: string): Promise<void> {
  await Promise.all([
    deleteCache(`vocab:page:user_id=${JSON.stringify(userId)}*`),
    deleteCache(`vocab:stats:user_id=${JSON.stringify(userId)}*`),
    deleteCache(`materials:page:user_id=${JSON.stringify(userId)}*`),
    deleteCache(`materials:stats:user_id=${JSON.stringify(userId)}*`),
    deleteCache(`dashboard:stats:${userId}`),
    deleteCache(`learning:words:${userId}*`),
    deleteCache(`trash:items:user_id=${JSON.stringify(userId)}*`),
    deleteCache(`dictionaries:page:user_id=${JSON.stringify(userId)}*`),
  ]);
}

export async function invalidateVocabCache(userId: string): Promise<void> {
  await Promise.all([
    deleteCache(`vocab:page:user_id=${JSON.stringify(userId)}*`),
    deleteCache(`vocab:stats:user_id=${JSON.stringify(userId)}*`),
  ]);
}

export async function invalidateMaterialsCache(userId: string): Promise<void> {
  await Promise.all([
    deleteCache(`materials:page:user_id=${JSON.stringify(userId)}*`),
    deleteCache(`materials:stats:user_id=${JSON.stringify(userId)}*`),
  ]);
}

export async function invalidateDashboardCache(userId: string): Promise<void> {
  await deleteCache(`dashboard:stats:${userId}`);
}

export async function invalidateTrashCache(userId: string): Promise<void> {
  await deleteCache(`trash:items:user_id=${JSON.stringify(userId)}*`);
}

export async function invalidateDictionaryCache(userId: string): Promise<void> {
  await deleteCache(`dictionaries:page:user_id=${JSON.stringify(userId)}*`);
}
