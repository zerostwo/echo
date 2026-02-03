/**
 * Shared Revalidation Utilities
 * 
 * Centralized revalidation helpers to eliminate code duplication
 * across action files.
 */

import { revalidatePath } from 'next/cache';

const INTERNAL_REVALIDATE_TOKEN = process.env.INTERNAL_REVALIDATE_TOKEN;

/**
 * Safely revalidate multiple paths, catching any errors
 */
export function safeRevalidate(paths: string[]): void {
  for (const path of paths) {
    try {
      revalidatePath(path);
    } catch (err) {
      console.warn(`[revalidate] Failed for ${path}:`, err);
    }
  }
}

/**
 * Revalidate paths in the background via API call
 * Use this for non-blocking revalidation after long operations
 */
export async function revalidateInBackground(paths: string[]): Promise<void> {
  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${process.env.PORT || 3000}`);

  try {
    await fetch(`${baseUrl}/api/revalidate-paths`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(INTERNAL_REVALIDATE_TOKEN ? { 'x-revalidate-token': INTERNAL_REVALIDATE_TOKEN } : {}),
      },
      body: JSON.stringify({ paths }),
    });
  } catch (err) {
    console.warn('[revalidate] Background revalidation failed:', err);
  }
}

/**
 * Common revalidation path groups
 */
export const REVALIDATE_PATHS = {
  materials: () => ['/materials', '/dashboard'],
  vocab: () => ['/words', '/dashboard'],
  learning: () => ['/study/words', '/words', '/dashboard'],
  trash: () => ['/trash', '/materials', '/words'],
  dashboard: () => ['/dashboard'],
  dictionaries: () => ['/dictionaries', '/words'],
} as const;

/**
 * Revalidate common material-related paths
 */
export function revalidateMaterialPaths(materialId?: string): void {
  const paths = ['/materials', '/dashboard'];
  if (materialId) {
    paths.push(`/materials/${materialId}`);
  }
  safeRevalidate(paths);
}

/**
 * Revalidate common vocab-related paths
 */
export function revalidateVocabPaths(): void {
  safeRevalidate(['/words', '/dashboard', '/study/words']);
}

/**
 * Revalidate after a material is processed (transcription complete)
 */
export function revalidateAfterMaterialProcessed(materialId: string): void {
  safeRevalidate([
    '/materials',
    `/materials/${materialId}`,
    '/words',
    '/dashboard',
  ]);
}
