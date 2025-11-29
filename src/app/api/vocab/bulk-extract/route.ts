import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { extractVocabulary } from '@/actions/vocab-actions';
import { NextResponse } from 'next/server';

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = supabaseAdmin || supabase;

  try {
    // Get all processed materials for this user that might need vocab extraction
    const { data: materials, error } = await client
      .from('materials')
      .select('id, title')
      .eq('user_id', session.user.id)
      .eq('is_processed', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching materials:', error);
      return NextResponse.json({ error: 'Failed to fetch materials' }, { status: 500 });
    }

    if (!materials || materials.length === 0) {
      return NextResponse.json({ message: 'No processed materials found', extracted: 0 });
    }

    console.log(`[bulk-extract] Starting extraction for ${materials.length} materials`);

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    for (const material of materials) {
      try {
        console.log(`[bulk-extract] Extracting vocab for: ${material.title} (${material.id})`);
        const result = await extractVocabulary(material.id);
        
        if (result && 'success' in result && result.success) {
          successCount++;
          console.log(`[bulk-extract] Success: ${material.title} - ${result.count} words`);
        } else if (result && 'error' in result) {
          errorCount++;
          errors.push(`${material.title}: ${result.error}`);
          console.error(`[bulk-extract] Error for ${material.title}:`, result.error);
        }
      } catch (e) {
        errorCount++;
        errors.push(`${material.title}: ${e}`);
        console.error(`[bulk-extract] Exception for ${material.title}:`, e);
      }
    }

    return NextResponse.json({
      message: `Extraction complete`,
      total: materials.length,
      success: successCount,
      errors: errorCount,
      errorDetails: errors.slice(0, 10) // Only return first 10 errors
    });
  } catch (error) {
    console.error('Bulk extraction error:', error);
    return NextResponse.json({ error: 'Bulk extraction failed' }, { status: 500 });
  }
}
