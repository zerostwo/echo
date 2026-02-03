/**
 * In-memory LRU Cache with TTL
 * 
 * This provides a simple, fast caching layer that doesn't require Redis.
 * - Uses Map for O(1) lookup
 * - LRU eviction when max size exceeded
 * - TTL-based expiration
 * - Type-safe with generics
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  createdAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  evictions: number;
}

// Default configuration
const DEFAULT_MAX_SIZE = 1000;
const DEFAULT_TTL_MS = 60 * 1000; // 1 minute

class LRUCache<T = unknown> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private maxSize: number;
  private defaultTTL: number;
  private stats: CacheStats = { hits: 0, misses: 0, size: 0, evictions: 0 };

  constructor(maxSize = DEFAULT_MAX_SIZE, defaultTTLMs = DEFAULT_TTL_MS) {
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTLMs;
  }

  /**
   * Get a value from the cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    
    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.size--;
      this.stats.misses++;
      return null;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in the cache
   */
  set(key: string, value: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTTL;
    const now = Date.now();

    // Delete existing entry if present
    if (this.cache.has(key)) {
      this.cache.delete(key);
      this.stats.size--;
    }

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        this.stats.evictions++;
        this.stats.size--;
      }
    }

    this.cache.set(key, {
      value,
      expiresAt: now + ttl,
      createdAt: now,
    });
    this.stats.size++;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) this.stats.size--;
    return deleted;
  }

  /**
   * Delete all keys matching a pattern (prefix match)
   */
  deleteByPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
        this.stats.size--;
      }
    }
    return count;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.stats.size = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats, size: this.cache.size };
  }

  /**
   * Clean up expired entries (can be called periodically)
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
        this.stats.size--;
      }
    }
    
    return pruned;
  }
}

// Global cache instances for different data types
const dataCache = new LRUCache<unknown>(500, 2 * 60 * 1000); // 2 min TTL
const statsCache = new LRUCache<unknown>(100, 30 * 1000); // 30 sec TTL

// Cache key prefixes
export const CACHE_PREFIXES = {
  VOCAB_PAGINATED: 'vocab:page:',
  VOCAB_STATS: 'vocab:stats:',
  MATERIALS_PAGINATED: 'materials:page:',
  MATERIALS_STATS: 'materials:stats:',
  DASHBOARD_STATS: 'dashboard:stats:',
  LEARNING_WORDS: 'learning:words:',
  TRASH_ITEMS: 'trash:items:',
  USER_SETTINGS: 'user:settings:',
} as const;

/**
 * Generate a cache key from prefix and parameters
 */
export function generateCacheKey(prefix: string, params: Record<string, unknown>): string {
  const sortedParams = Object.keys(params)
    .sort()
    .filter(key => params[key] !== undefined && params[key] !== null)
    .map(key => `${key}=${JSON.stringify(params[key])}`)
    .join('&');
  return `${prefix}${sortedParams}`;
}

/**
 * Get data from cache
 */
export function getCached<T>(key: string): T | null {
  const value = dataCache.get(key);
  if (value !== null) {
    console.log(`[Cache] HIT: ${key.substring(0, 50)}...`);
  }
  return value as T | null;
}

/**
 * Set data in cache
 */
export function setCached<T>(key: string, value: T, ttlMs?: number): void {
  dataCache.set(key, value, ttlMs);
}

/**
 * Get or set cache with async factory
 */
export async function getOrSetCached<T>(
  key: string,
  factory: () => Promise<T>,
  ttlMs?: number
): Promise<T> {
  const cached = getCached<T>(key);
  if (cached !== null) {
    return cached;
  }

  console.log(`[Cache] MISS: ${key.substring(0, 50)}...`);
  const value = await factory();
  setCached(key, value, ttlMs);
  return value;
}

/**
 * Get stats from stats-specific cache (shorter TTL)
 */
export function getStatsCached<T>(key: string): T | null {
  const value = statsCache.get(key);
  if (value !== null) {
    console.log(`[StatsCache] HIT: ${key.substring(0, 50)}...`);
  }
  return value as T | null;
}

/**
 * Set stats in stats-specific cache
 */
export function setStatsCached<T>(key: string, value: T, ttlMs?: number): void {
  statsCache.set(key, value, ttlMs);
}

/**
 * Invalidate cache entries by prefix (for a specific user)
 */
export function invalidateCacheByPrefix(prefix: string): number {
  const dataDeleted = dataCache.deleteByPrefix(prefix);
  const statsDeleted = statsCache.deleteByPrefix(prefix);
  const total = dataDeleted + statsDeleted;
  if (total > 0) {
    console.log(`[Cache] Invalidated ${total} entries with prefix: ${prefix}`);
  }
  return total;
}

/**
 * Invalidate all cache for a user
 */
export function invalidateUserCache(userId: string): void {
  invalidateCacheByPrefix(`vocab:page:user_id="${userId}"`);
  invalidateCacheByPrefix(`vocab:stats:user_id="${userId}"`);
  invalidateCacheByPrefix(`materials:page:user_id="${userId}"`);
  invalidateCacheByPrefix(`materials:stats:user_id="${userId}"`);
  invalidateCacheByPrefix(`dashboard:stats:${userId}`);
  invalidateCacheByPrefix(`learning:words:${userId}`);
  invalidateCacheByPrefix(`trash:items:${userId}`);
}

/**
 * Invalidate vocabulary cache for a user
 */
export function invalidateVocabCache(userId: string): void {
  invalidateCacheByPrefix(`vocab:page:user_id="${userId}"`);
  invalidateCacheByPrefix(`vocab:stats:user_id="${userId}"`);
}

/**
 * Invalidate materials cache for a user
 */
export function invalidateMaterialsCache(userId: string): void {
  invalidateCacheByPrefix(`materials:page:user_id="${userId}"`);
  invalidateCacheByPrefix(`materials:stats:user_id="${userId}"`);
}

/**
 * Invalidate dashboard stats cache for a user
 */
export function invalidateDashboardCache(userId: string): void {
  invalidateCacheByPrefix(`dashboard:stats:${userId}`);
}

/**
 * Get cache statistics (for debugging/monitoring)
 */
export function getCacheStats() {
  return {
    dataCache: dataCache.getStats(),
    statsCache: statsCache.getStats(),
  };
}

/**
 * Prune expired entries from all caches
 * Call this periodically (e.g., every 5 minutes)
 */
export function pruneExpiredEntries(): { data: number; stats: number } {
  return {
    data: dataCache.prune(),
    stats: statsCache.prune(),
  };
}

// Auto-prune every 5 minutes to prevent memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const pruned = pruneExpiredEntries();
    if (pruned.data > 0 || pruned.stats > 0) {
      console.log(`[Cache] Pruned ${pruned.data + pruned.stats} expired entries`);
    }
  }, 5 * 60 * 1000);
}

export { LRUCache };
