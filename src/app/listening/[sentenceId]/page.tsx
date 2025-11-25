import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import PracticeInterface from './practice-interface';

export default async function ListeningPage({ params }: { params: Promise<{ sentenceId: string }> }) {
  const { sentenceId } = await params;
  const session = await auth();
  
  if (!session?.user?.id) return <div>Unauthorized</div>;

  // Use admin client to bypass RLS, we verify ownership manually
  const client = supabaseAdmin || supabase;

  const { data: sentence, error } = await client
    .from('Sentence')
    .select(`
        *,
        material:Material(
            *,
            folder:Folder(*)
        )
    `)
    .eq('id', sentenceId)
    .single();
  
  if (error || !sentence || !sentence.material || sentence.material.userId !== session.user.id) notFound();

  // Fetch ALL sentences for this material to ensure we can navigate correctly
  // This avoids complex RLS/query issues with single item fetching
  const { data: allSentences } = await client
    .from('Sentence')
    .select('id, order')
    .eq('materialId', sentence.materialId)
    .order('order', { ascending: true });

  let nextId = undefined;
  let prevId = undefined;

  if (allSentences && allSentences.length > 0) {
      const currentIndex = allSentences.findIndex(s => s.id === sentenceId);
      if (currentIndex !== -1) {
          if (currentIndex > 0) {
              prevId = allSentences[currentIndex - 1].id;
          }
          if (currentIndex < allSentences.length - 1) {
              nextId = allSentences[currentIndex + 1].id;
          }
      }
  }

  return (
    <PracticeInterface 
        sentence={sentence} 
        materialId={sentence.materialId}
        nextId={nextId}
        prevId={prevId}
    />
  );
}