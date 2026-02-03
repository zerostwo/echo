import Redis from 'ioredis';

// Redis client singleton
let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  // Enable Redis caching when REDIS_URL is configured
  if (!process.env.REDIS_URL) {
    // Redis not configured - caching disabled
    return null;
  }

  if (!redisClient) {
    try {
      redisClient = new Redis(process.env.REDIS_URL, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: false,
        lazyConnect: true,
      });

      redisClient.on('error', (err) => {
        console.warn('[Redis] Connection error:', err.message);
      });

      redisClient.on('connect', () => {
        console.log('[Redis] Connected successfully');
      });
    } catch (error) {
      console.warn('[Redis] Failed to create client:', error);
      return null;
    }
  }

  return redisClient;
}

// Default TTL: 5 minutes
const DEFAULT_TTL = 300;

// Cache key prefixes
export const CACHE_KEYS = {
  VOCAB_PAGINATED: 'vocab:paginated',
  VOCAB_STATS: 'vocab:stats',
  MATERIALS_PAGINATED: 'materials:paginated',
  MATERIAL_STATS: 'material:stats',
  USER_MATERIALS: 'user:materials',
} as const;

/**
 * Generate a cache key from prefix and parameters
 */
export function generateCacheKey(prefix: string, params: Record<string, any>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .filter(key => params[key] !== undefined && params[key] !== null)
    .map(key => `${key}:${JSON.stringify(params[key])}`)
    .join('|');
  return `${prefix}:${sortedParams}`;
}

/**
 * Get cached data
 */
export async function getCached<T>(key: string): Promise<T | null> {
  const redis = getRedisClient();
  if (!redis) return null;

  try {
    const data = await redis.get(key);
    if (data) {
      return JSON.parse(data) as T;
    }
  } catch (error) {
    console.warn('[Redis] Get error:', error);
  }
  return null;
}

/**
 * Set cached data with optional TTL
 */
export async function setCached<T>(key: string, data: T, ttl: number = DEFAULT_TTL): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.setex(key, ttl, JSON.stringify(data));
  } catch (error) {
    console.warn('[Redis] Set error:', error);
  }
}

/**
 * Delete cached data by key
 */
export async function deleteCached(key: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    await redis.del(key);
  } catch (error) {
    console.warn('[Redis] Delete error:', error);
  }
}

/**
 * Delete all cached data matching a pattern
 * Use with caution - can be slow with large datasets
 */
export async function invalidateCachePattern(pattern: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) return;

  try {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
      console.log(`[Redis] Invalidated ${keys.length} keys matching: ${pattern}`);
    }
  } catch (error) {
    console.warn('[Redis] Pattern delete error:', error);
  }
}

/**
 * Invalidate all cache for a specific user
 */
export async function invalidateUserCache(userId: string): Promise<void> {
  await Promise.all([
    invalidateCachePattern(`${CACHE_KEYS.VOCAB_PAGINATED}:*user_id:"${userId}"*`),
    invalidateCachePattern(`${CACHE_KEYS.VOCAB_STATS}:*user_id:"${userId}"*`),
    invalidateCachePattern(`${CACHE_KEYS.MATERIALS_PAGINATED}:*user_id:"${userId}"*`),
    invalidateCachePattern(`${CACHE_KEYS.USER_MATERIALS}:${userId}*`),
  ]);
}

/**
 * Invalidate vocabulary cache for a user
 */
export async function invalidateVocabCache(userId: string): Promise<void> {
  await Promise.all([
    invalidateCachePattern(`${CACHE_KEYS.VOCAB_PAGINATED}:*user_id:"${userId}"*`),
    invalidateCachePattern(`${CACHE_KEYS.VOCAB_STATS}:*user_id:"${userId}"*`),
  ]);
}

/**
 * Invalidate materials cache for a user
 */
export async function invalidateMaterialsCache(userId: string): Promise<void> {
  await Promise.all([
    invalidateCachePattern(`${CACHE_KEYS.MATERIALS_PAGINATED}:*user_id:"${userId}"*`),
    invalidateCachePattern(`${CACHE_KEYS.MATERIAL_STATS}:*user_id:"${userId}"*`),
    invalidateCachePattern(`${CACHE_KEYS.USER_MATERIALS}:${userId}*`),
  ]);
}

/**
 * Get or set cache with a factory function
 */
export async function getOrSetCache<T>(
  key: string,
  factory: () => Promise<T>,
  ttl: number = DEFAULT_TTL
): Promise<T> {
  // Try to get from cache first
  const cached = await getCached<T>(key);
  if (cached !== null) {
    console.log(`[Redis] Cache hit: ${key}`);
    return cached;
  }

  // Cache miss - fetch fresh data
  console.log(`[Redis] Cache miss: ${key}`);
  const data = await factory();
  
  // Store in cache (don't await to avoid blocking)
  setCached(key, data, ttl).catch(err => {
    console.warn('[Redis] Failed to set cache:', err);
  });

  return data;
}

/**
 * Check if Redis is available
 */
export async function isRedisAvailable(): Promise<boolean> {
  const redis = getRedisClient();
  if (!redis) return false;

  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
