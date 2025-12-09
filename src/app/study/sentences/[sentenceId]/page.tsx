import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { notFound, redirect } from 'next/navigation';
import PracticeInterface from './practice-interface';

export default async function ListeningPage({ params }: { params: Promise<{ sentenceId: string }> }) {
  const { sentenceId } = await params;
  const session = await auth();
  
  if (!session?.user?.id) redirect('/login');

  // Use admin client to bypass RLS, we verify ownership manually
  const client = supabaseAdmin || supabase;

  const { data: sentence, error } = await client
    .from('sentences')
    .select(`
        *,
        material:materials(
            *,
            folder:folders(*)
        )
    `)
    .eq('id', sentenceId)
    .single();
  
  if (error || !sentence || !sentence.material || sentence.material.user_id !== session.user.id || sentence.deleted_at) notFound();

  // Fetch ALL sentences for this material to ensure we can navigate correctly
  // This avoids complex RLS/query issues with single item fetching
  const { data: allSentences } = await client
    .from('sentences')
    .select('id, order, start_time')
    .eq('material_id', sentence.material_id)
    .is('deleted_at', null)
    .order('order', { ascending: true })
    .order('start_time', { ascending: true });

  let nextId = undefined;
  let prevId = undefined;
  let displayIndex = sentence.order + 1;

  if (allSentences && allSentences.length > 0) {
      const currentIndex = allSentences.findIndex(s => s.id === sentenceId);
      if (currentIndex !== -1) {
          displayIndex = currentIndex + 1;
          if (currentIndex > 0) {
              prevId = allSentences[currentIndex - 1].id;
          }
          if (currentIndex < allSentences.length - 1) {
              nextId = allSentences[currentIndex + 1].id;
          }
      }
  }

  // Map snake_case to camelCase
  const mappedSentence = {
    ...sentence,
    content: sentence.edited_content ?? sentence.content,
    originalContent: sentence.content,
    editedContent: sentence.edited_content,
    startTime: sentence.start_time,
    endTime: sentence.end_time,
    materialId: sentence.material_id,
    createdAt: sentence.created_at,
    updatedAt: sentence.updated_at,
    material: sentence.material ? {
        ...sentence.material,
        userId: sentence.material.user_id,
        folderId: sentence.material.folder_id,
        filePath: sentence.material.file_path,
        mimeType: sentence.material.mime_type,
        isProcessed: sentence.material.is_processed,
        createdAt: sentence.material.created_at,
        updatedAt: sentence.material.updated_at,
    } : null
  };

  return (
    <PracticeInterface 
        sentence={mappedSentence} 
        materialId={sentence.material_id}
        nextId={nextId}
        prevId={prevId}
        displayIndex={displayIndex}
    />
  );
}
