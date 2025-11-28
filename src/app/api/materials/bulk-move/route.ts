import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
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

    const client = supabaseAdmin || supabase;

    // Verify folder ownership if folderId is provided
    if (folderId) {
      const { data: folder, error: folderError } = await client
        .from('folders')
        .select('id')
        .eq('id', folderId)
        .eq('user_id', session.user.id)
        .single();

      if (folderError || !folder) {
        return NextResponse.json(
          { error: 'Folder not found or unauthorized' },
          { status: 404 }
        );
      }
    }

    // Verify material ownership
    const { data: materials, error: materialError } = await client
      .from('materials')
      .select('id')
      .eq('user_id', session.user.id)
      .in('id', materialIds);

    if (materialError) {
      throw materialError;
    }

    if (!materials || materials.length !== materialIds.length) {
      return NextResponse.json(
        { error: 'Some materials not found or unauthorized' },
        { status: 404 }
      );
    }

    // Update all materials
    const { error: updateError } = await client
      .from('materials')
      .update({
        folder_id: folderId,
        updated_at: new Date().toISOString(),
      })
      .in('id', materialIds)
      .eq('user_id', session.user.id);

    if (updateError) {
      throw updateError;
    }

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

