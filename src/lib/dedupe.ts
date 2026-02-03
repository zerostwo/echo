/**
 * Request Deduplication Helper
 * 
 * Ensures that concurrent calls to the same async function with the same key
 * share a single in-flight Promise instead of triggering multiple DB queries.
 * 
 * Example:
 *   // Without dedupe: 3 concurrent calls = 3 DB queries
 *   // With dedupe: 3 concurrent calls = 1 DB query, shared result
 * 
 *   const data = await dedupe('user:123', () => fetchUserFromDB(123));
 */

interface InFlightRequest<T> {
  promise: Promise<T>;
  startedAt: number;
}

// Map of in-flight requests: key -> promise
const inFlight = new Map<string, InFlightRequest<unknown>>();

// Stats for monitoring
let stats = {
  deduped: 0,
  executed: 0,
  errors: 0,
};

/**
 * Deduplicate async function calls
 * 
 * @param key - Unique identifier for this request (e.g., "vocab:page:1")
 * @param fn - Async function to execute
 * @param timeoutMs - Maximum time to wait for in-flight request (default: 30s)
 * @returns Promise resolving to the function result
 */
export async function dedupe<T>(
  key: string,
  fn: () => Promise<T>,
  timeoutMs: number = 30000
): Promise<T> {
  // Check if this request is already in-flight
  const existing = inFlight.get(key) as InFlightRequest<T> | undefined;
  
  if (existing) {
    // Check if the in-flight request has been running too long (potential hang)
    const elapsed = Date.now() - existing.startedAt;
    if (elapsed < timeoutMs) {
      stats.deduped++;
      console.log(`[Dedupe] Reusing in-flight request: ${key} (${elapsed}ms elapsed)`);
      return existing.promise;
    } else {
      // Request timed out, remove it and start fresh
      console.warn(`[Dedupe] Request timeout exceeded (${elapsed}ms), starting new request: ${key}`);
      inFlight.delete(key);
    }
  }

  // Start new request
  stats.executed++;
  const startedAt = Date.now();
  
  const promise = fn()
    .then((result) => {
      // Remove from in-flight map on success
      inFlight.delete(key);
      const duration = Date.now() - startedAt;
      if (duration > 300) {
        console.log(`[Dedupe] Slow query (${duration}ms): ${key}`);
      }
      return result;
    })
    .catch((error) => {
      // Remove from in-flight map on error to allow retries
      inFlight.delete(key);
      stats.errors++;
      throw error;
    });

  // Store the promise
  inFlight.set(key, { promise, startedAt });

  return promise;
}

/**
 * Create a deduped version of an async function
 * 
 * @param keyFn - Function to generate cache key from arguments
 * @param fn - The async function to wrap
 * @returns Wrapped function that deduplicates concurrent calls
 */
export function createDedupedFn<TArgs extends unknown[], TResult>(
  keyFn: (...args: TArgs) => string,
  fn: (...args: TArgs) => Promise<TResult>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const key = keyFn(...args);
    return dedupe(key, () => fn(...args));
  };
}

/**
 * Get dedupe statistics
 */
export function getDedupeStats() {
  return {
    ...stats,
    inFlightCount: inFlight.size,
    dedupeRatio: stats.executed > 0 
      ? (stats.deduped / (stats.deduped + stats.executed) * 100).toFixed(1) + '%'
      : '0%',
  };
}

/**
 * Clear all in-flight requests (for testing/reset)
 */
export function clearInFlight(): void {
  inFlight.clear();
}

/**
 * Reset stats (for testing)
 */
export function resetDedupeStats(): void {
  stats = { deduped: 0, executed: 0, errors: 0 };
}

/**
 * Generate a dedupe key from function name and parameters
 */
export function generateDedupeKey(
  fnName: string,
  params: Record<string, unknown>
): string {
  const sortedParams = Object.keys(params)
    .sort()
    .filter(key => params[key] !== undefined && params[key] !== null)
    .map(key => `${key}=${JSON.stringify(params[key])}`)
    .join('&');
  return `${fnName}:${sortedParams}`;
}
