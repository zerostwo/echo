/**
 * Pagination Utilities
 * 
 * Provides consistent pagination patterns for Appwrite queries.
 * Supports both offset-based and cursor-based pagination.
 */

import { Query } from 'node-appwrite';

// Default pagination settings
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;
export const APPWRITE_MAX_LIMIT = 100; // Appwrite's actual max per query

/**
 * Offset pagination parameters
 */
export interface OffsetPaginationParams {
  page: number;
  pageSize: number;
}

/**
 * Cursor pagination parameters
 */
export interface CursorPaginationParams {
  cursor?: string;
  limit: number;
  direction?: 'after' | 'before';
}

/**
 * Generic paginated result
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page?: number;
  pageSize: number;
  totalPages?: number;
  hasMore: boolean;
  nextCursor?: string;
  prevCursor?: string;
}

/**
 * Build offset pagination queries for Appwrite
 */
export function buildOffsetQueries(
  params: OffsetPaginationParams,
  additionalQueries: string[] = []
): string[] {
  const { page, pageSize } = params;
  const safePageSize = Math.min(Math.max(1, pageSize), MAX_PAGE_SIZE);
  const offset = (Math.max(1, page) - 1) * safePageSize;

  return [
    ...additionalQueries,
    Query.limit(safePageSize),
    Query.offset(offset),
  ];
}

/**
 * Build cursor pagination queries for Appwrite
 */
export function buildCursorQueries(
  params: CursorPaginationParams,
  additionalQueries: string[] = []
): string[] {
  const { cursor, limit, direction = 'after' } = params;
  const safeLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE);

  const queries = [...additionalQueries, Query.limit(safeLimit)];

  if (cursor) {
    if (direction === 'after') {
      queries.push(Query.cursorAfter(cursor));
    } else {
      queries.push(Query.cursorBefore(cursor));
    }
  }

  return queries;
}

/**
 * Fetch all documents using cursor pagination (for large collections)
 * Use with caution - only for batch operations, not user-facing queries
 */
export async function fetchAllWithCursor<T>(
  fetchFn: (cursor?: string) => Promise<{ documents: T[]; total: number }>,
  maxItems: number = 5000
): Promise<T[]> {
  const allItems: T[] = [];
  let cursor: string | undefined;
  let iterations = 0;
  const maxIterations = Math.ceil(maxItems / APPWRITE_MAX_LIMIT);

  while (iterations < maxIterations) {
    const result = await fetchFn(cursor);
    
    if (!result.documents || result.documents.length === 0) {
      break;
    }

    allItems.push(...result.documents);

    // Check if we've fetched all items or hit the limit
    if (allItems.length >= result.total || allItems.length >= maxItems) {
      break;
    }

    // Get cursor for next page (Appwrite document ID)
    cursor = (result.documents[result.documents.length - 1] as { $id: string }).$id;
    iterations++;
  }

  return allItems.slice(0, maxItems);
}

/**
 * Batch process items in chunks
 * Useful for bulk operations that need to respect rate limits
 */
export async function processBatched<T, R>(
  items: T[],
  processFn: (batch: T[]) => Promise<R[]>,
  batchSize: number = 50
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await processFn(batch);
    results.push(...batchResults);
  }

  return results;
}

/**
 * Process batches in parallel with concurrency limit
 */
export async function processBatchedParallel<T, R>(
  items: T[],
  processFn: (batch: T[]) => Promise<R[]>,
  batchSize: number = 50,
  concurrency: number = 3
): Promise<R[]> {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    batches.push(items.slice(i, i + batchSize));
  }

  const results: R[] = [];
  
  for (let i = 0; i < batches.length; i += concurrency) {
    const concurrentBatches = batches.slice(i, i + concurrency);
    const batchResults = await Promise.all(concurrentBatches.map(processFn));
    results.push(...batchResults.flat());
  }

  return results;
}

/**
 * Create a paginated result from data and metadata
 */
export function createPaginatedResult<T>(
  data: T[],
  total: number,
  page: number,
  pageSize: number
): PaginatedResult<T> {
  const totalPages = Math.ceil(total / pageSize);
  
  return {
    data,
    total,
    page,
    pageSize,
    totalPages,
    hasMore: page < totalPages,
    nextCursor: data.length > 0 ? (data[data.length - 1] as { $id?: string })?.$id : undefined,
  };
}

/**
 * Validate and normalize pagination params
 */
export function normalizePaginationParams(
  page?: number,
  pageSize?: number
): OffsetPaginationParams {
  return {
    page: Math.max(1, page ?? 1),
    pageSize: Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize ?? DEFAULT_PAGE_SIZE)),
  };
}

/**
 * Calculate efficient batch sizes for different operations
 */
export function getOptimalBatchSize(itemCount: number, operation: 'read' | 'write' | 'delete'): number {
  // Appwrite has different performance characteristics for different operations
  switch (operation) {
    case 'read':
      // Reads are fast, use larger batches
      return Math.min(100, itemCount);
    case 'write':
      // Writes need smaller batches to avoid timeouts
      return Math.min(50, itemCount);
    case 'delete':
      // Deletes should be even smaller due to cascade implications
      return Math.min(25, itemCount);
    default:
      return 50;
  }
}

/**
 * Build Appwrite queries for efficient batch fetch by IDs
 */
export function buildBatchIdQuery(ids: string[], batchIndex: number, batchSize: number = 50): string[] {
  const startIdx = batchIndex * batchSize;
  const batchIds = ids.slice(startIdx, startIdx + batchSize);
  
  if (batchIds.length === 0) return [];
  
  return [Query.equal('$id', batchIds)];
}

/**
 * Helper to chunk array for batch processing
 */
export function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize));
  }
  return chunks;
}
