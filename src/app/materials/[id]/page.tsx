import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import { SetBreadcrumbs } from '@/components/set-breadcrumbs';
import { MaterialStatsCard } from './material-stats-card';
import { SentencesTable } from './sentences-table';

export default async function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return <div>Unauthorized</div>;

  const client = supabaseAdmin || supabase;

  const { data: material, error } = await client
    .from('materials')
    .select(`
        *,
        sentences:sentences(*),
        folder:folders(*)
    `)
    .eq('id', id)
    .eq('user_id', session.user.id)
    .single();

  if (error || !material) notFound();

  // Calculate Vocab Count (distinct words in this material)
  // 1. Get sentence IDs
  const sentences = material.sentences || [];
  const sentenceIds = sentences.map((s: any) => s.id);
  
  let vocabCount = 0;
  
  if (sentenceIds.length > 0) {
      // 2. Fetch occurrences for these sentences
      const { data: occurrences } = await client
          .from('word_occurrences')
          .select('word_id')
          .in('sentence_id', sentenceIds);
          
      if (occurrences) {
          vocabCount = new Set(occurrences.map((o: any) => o.word_id)).size;
      }
  }

  // Calculate Words Per Minute
  const durationInMins = (material.duration || 0) / 60;
  const wpm = durationInMins > 0 ? vocabCount / durationInMins : 0;

  // Prepare breadcrumbs
  const breadcrumbs = [
      { title: "Materials", href: "/materials" },
  ];
  
  if (material.folder) {
       breadcrumbs.push({ 
           title: material.folder.name, 
           href: `/materials?folderId=${material.folder.id}` 
       });
  }
  
  breadcrumbs.push({ title: material.title });

  // Sort sentences by order
  // Supabase might return them unsorted unless we specify order in the nested select
  // We can sort here in JS safely
  // Also map snake_case to camelCase for the UI components
  const sortedSentences = [...sentences]
    .sort((a: any, b: any) => a.order - b.order)
    .map((s: any) => ({
      ...s,
      startTime: s.start_time,
      endTime: s.end_time,
      materialId: s.material_id,
      createdAt: s.created_at,
      updatedAt: s.updated_at
    }));

  const materialWithSortedSentences = {
    ...material,
    sentences: sortedSentences
  };

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-8">
      <SetBreadcrumbs items={breadcrumbs} />

      <MaterialStatsCard 
        material={materialWithSortedSentences}
        vocabCount={vocabCount}
        wpm={wpm}
      />

      <div className="space-y-4">
        <SentencesTable data={sortedSentences} />
      </div>
    </div>
  );
}
