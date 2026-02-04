import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAdminClient, APPWRITE_DATABASE_ID } from '@/lib/appwrite';
import { BUCKETS } from '@/lib/schema';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const materialId = searchParams.get('materialId');
  if (!materialId) {
    return NextResponse.json({ error: 'Missing materialId' }, { status: 400 });
  }

  try {
    const admin = getAdminClient();
    const material = await admin.databases.getDocument(
      APPWRITE_DATABASE_ID,
      'materials',
      materialId
    );

    if (!material || material.user_id !== session.user.id || material.deleted_at) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const filePath = material.file_path as string | null;
    if (!filePath) {
      return NextResponse.json({ error: 'Missing file' }, { status: 404 });
    }

    const range = request.headers.get('range') || undefined;
    const mimeType = material.mime_type || 'application/octet-stream';

    if (/^https?:\/\//i.test(filePath)) {
      const upstream = await fetch(filePath, {
        headers: range ? { range } : undefined,
      });

      const headers: Record<string, string> = {
        'Content-Type': upstream.headers.get('content-type') || mimeType,
        'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
        'Cache-Control': 'private, max-age=0, must-revalidate',
      };

      const contentLength = upstream.headers.get('content-length');
      const contentRange = upstream.headers.get('content-range');
      if (contentLength) headers['Content-Length'] = contentLength;
      if (contentRange) headers['Content-Range'] = contentRange;

      return new NextResponse(upstream.body, {
        status: upstream.status,
        headers,
      });
    }

    const endpoint = process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT;
    const projectId = process.env.NEXT_PUBLIC_APPWRITE_PROJECT_ID;
    const apiKey = process.env.APPWRITE_API_KEY;
    if (!endpoint || !projectId || !apiKey) {
      return NextResponse.json({ error: 'Appwrite config missing' }, { status: 500 });
    }

    const url = `${endpoint}/storage/buckets/${BUCKETS.MATERIALS}/files/${filePath}/view`;
    const upstream = await fetch(url, {
      headers: {
        'X-Appwrite-Project': projectId,
        'X-Appwrite-Key': apiKey,
        ...(range ? { range } : {}),
      },
    });

    const headers: Record<string, string> = {
      'Content-Type': upstream.headers.get('content-type') || mimeType,
      'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes',
      'Cache-Control': 'private, max-age=0, must-revalidate',
    };
    const contentLength = upstream.headers.get('content-length');
    const contentRange = upstream.headers.get('content-range');
    if (contentLength) headers['Content-Length'] = contentLength;
    if (contentRange) headers['Content-Range'] = contentRange;

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (error) {
    console.error('[materials/file] Failed to stream file:', error);
    return NextResponse.json({ error: 'Failed to load file' }, { status: 500 });
  }
}
