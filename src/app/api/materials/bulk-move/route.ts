import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAdminClient, APPWRITE_DATABASE_ID, Query } from '@/lib/appwrite';
import { revalidatePath } from 'next/cache';

export async function PATCH(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { materialIds, folderId } = body as {
      materialIds: string[];
      folderId: string | null;
    };

    if (!Array.isArray(materialIds) || materialIds.length === 0) {
      return NextResponse.json(
        { error: 'materialIds must be a non-empty array' },
        { status: 400 }
      );
    }

    const admin = getAdminClient();
    const userId = session.user.id;

    // Verify folder ownership if folderId is provided
    if (folderId) {
      try {
        const folder = await admin.databases.getDocument(
          APPWRITE_DATABASE_ID,
          'folders',
          folderId
        );
        if (folder.user_id !== userId) {
           return NextResponse.json(
            { error: 'Folder not found or unauthorized' },
            { status: 404 }
          );
        }
      } catch (e) {
        return NextResponse.json(
          { error: 'Folder not found or unauthorized' },
          { status: 404 }
        );
      }
    }

    // Verify material ownership
    // We can fetch all materials with IDs and check user_id
    const { documents: materials } = await admin.databases.listDocuments(
        APPWRITE_DATABASE_ID,
        'materials',
        [
            Query.equal('$id', materialIds),
            Query.equal('user_id', userId)
        ]
    );

    if (materials.length !== materialIds.length) {
      return NextResponse.json(
        { error: 'Some materials not found or unauthorized' },
        { status: 404 }
      );
    }

    // Update all materials
    // Appwrite doesn't support bulk update, so we loop
    await Promise.all(materialIds.map(id => 
        admin.databases.updateDocument(
            APPWRITE_DATABASE_ID,
            'materials',
            id,
            {
                folder_id: folderId,
                // updated_at is auto-handled by Appwrite usually, but we can set it if we want to track logic time
                // But Appwrite has . Let's rely on that or set it if schema requires.
                // Schema likely has updated_at as string if migrated from Supabase.
                updated_at: new Date().toISOString(),
            }
        )
    ));

    revalidatePath('/materials');

    return NextResponse.json({
      success: true,
      count: materialIds.length,
    });
  } catch (error) {
    console.error('Bulk move error:', error);
    return NextResponse.json(
      { error: 'Failed to move materials' },
      { status: 500 }
    );
  }
}
