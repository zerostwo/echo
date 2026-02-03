/**
 * Query Performance Logger
 * 
 * Provides utilities for logging slow queries and tracking performance.
 */

// Threshold in milliseconds for considering a query "slow"
const SLOW_QUERY_THRESHOLD_MS = 300;
const VERY_SLOW_QUERY_THRESHOLD_MS = 1000;

interface QueryLogEntry {
  name: string;
  duration: number;
  timestamp: number;
  params?: Record<string, unknown>;
}

// Keep recent slow queries for debugging
const recentSlowQueries: QueryLogEntry[] = [];
const MAX_SLOW_QUERIES = 50;

// Aggregate stats
const queryStats: Map<string, { count: number; totalMs: number; maxMs: number }> = new Map();

/**
 * Log a query execution
 */
export function logQuery(
  name: string,
  durationMs: number,
  params?: Record<string, unknown>
): void {
  // Update stats
  const existing = queryStats.get(name) || { count: 0, totalMs: 0, maxMs: 0 };
  queryStats.set(name, {
    count: existing.count + 1,
    totalMs: existing.totalMs + durationMs,
    maxMs: Math.max(existing.maxMs, durationMs),
  });

  // Log slow queries
  if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
    const entry: QueryLogEntry = {
      name,
      duration: durationMs,
      timestamp: Date.now(),
      params,
    };
    
    recentSlowQueries.push(entry);
    
    // Keep only recent entries
    if (recentSlowQueries.length > MAX_SLOW_QUERIES) {
      recentSlowQueries.shift();
    }

    // Console output with severity
    if (durationMs >= VERY_SLOW_QUERY_THRESHOLD_MS) {
      console.warn(`[VERY SLOW QUERY] ${name}: ${durationMs}ms`, params ? JSON.stringify(params).substring(0, 100) : '');
    } else {
      console.log(`[SLOW QUERY] ${name}: ${durationMs}ms`);
    }
  }
}

/**
 * Wrap an async function to automatically log its execution time
 */
export async function withQueryLogging<T>(
  name: string,
  fn: () => Promise<T>,
  params?: Record<string, unknown>
): Promise<T> {
  const start = Date.now();
  try {
    return await fn();
  } finally {
    const duration = Date.now() - start;
    logQuery(name, duration, params);
  }
}

/**
 * Create a logged version of an async function
 */
export function createLoggedFn<TArgs extends unknown[], TResult>(
  name: string,
  fn: (...args: TArgs) => Promise<TResult>,
  getParams?: (...args: TArgs) => Record<string, unknown>
): (...args: TArgs) => Promise<TResult> {
  return async (...args: TArgs): Promise<TResult> => {
    const params = getParams?.(...args);
    return withQueryLogging(name, () => fn(...args), params);
  };
}

/**
 * Get recent slow queries
 */
export function getRecentSlowQueries(): QueryLogEntry[] {
  return [...recentSlowQueries];
}

/**
 * Get query statistics
 */
export function getQueryStats(): Array<{
  name: string;
  count: number;
  avgMs: number;
  maxMs: number;
}> {
  return Array.from(queryStats.entries())
    .map(([name, stats]) => ({
      name,
      count: stats.count,
      avgMs: Math.round(stats.totalMs / stats.count),
      maxMs: stats.maxMs,
    }))
    .sort((a, b) => b.avgMs - a.avgMs);
}

/**
 * Reset statistics (for testing)
 */
export function resetQueryStats(): void {
  queryStats.clear();
  recentSlowQueries.length = 0;
}

/**
 * Timer utility for manual timing
 */
export function createTimer() {
  const start = Date.now();
  return {
    elapsed: () => Date.now() - start,
    log: (name: string, params?: Record<string, unknown>) => {
      logQuery(name, Date.now() - start, params);
    },
  };
}
