import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';

export async function POST(req: NextRequest) {
  const token = process.env.INTERNAL_REVALIDATE_TOKEN;
  if (token && req.headers.get('x-revalidate-token') !== token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch (err) {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const paths = Array.isArray((body as any)?.paths) ? (body as any).paths : null;
  if (!paths) {
    return NextResponse.json({ error: 'Missing paths' }, { status: 400 });
  }

  const results: Array<{ path: string; status: 'ok' | 'error'; message?: string }> = [];

  for (const path of paths) {
    try {
      revalidatePath(path);
      results.push({ path, status: 'ok' });
    } catch (err) {
      console.warn('[api/revalidate-paths] Failed to revalidate', path, err);
      results.push({
        path,
        status: 'error',
        message: err instanceof Error ? err.message : 'Unknown error'
      });
    }
  }

  return NextResponse.json({ revalidated: results });
}
