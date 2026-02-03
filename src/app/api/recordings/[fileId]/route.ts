import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAdminClient } from '@/lib/appwrite';

const RECORDINGS_BUCKET = 'recordings';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { fileId } = await params;
    const admin = getAdminClient();

    // Get file download
    const buffer = await admin.storage.getFileDownload(RECORDINGS_BUCKET, fileId);

    // Return the audio file with appropriate headers
    return new NextResponse(buffer, {
      headers: {
        'Content-Type': 'audio/webm',
        'Content-Length': buffer.byteLength.toString(),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error: any) {
    console.error('Failed to stream recording:', error);
    
    if (error.code === 404) {
      return NextResponse.json({ error: 'Recording not found' }, { status: 404 });
    }
    
    return NextResponse.json(
      { error: 'Failed to stream recording' },
      { status: 500 }
    );
  }
}
