import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import { SetBreadcrumbs } from '@/components/set-breadcrumbs';
import { MaterialStatsCard } from './material-stats-card';
import { SentencesTable } from './sentences-table';
import { getFolderPath, type Folder } from '@/lib/folder-utils';

export default async function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return <div>Unauthorized</div>;

  const client = supabaseAdmin || supabase;

  // Fetch material with folder info
  const { data: material, error } = await client
    .from('materials')
    .select(`
        *,
        sentences:sentences(
          *,
          practices:practice_progress(score, attempts, user_id),
          occurrences:word_occurrences(word_id)
        ),
        folder:folders(*)
    `)
    .eq('id', id)
    .eq('user_id', session.user.id)
    .single();

  if (error || !material) notFound();

  // Fetch all folders for building the path
  let allFolders: any[] = [];
  if (material.folder) {
    const { data: folders } = await client
      .from('folders')
      .select('*')
      .eq('user_id', session.user.id)
      .is('deleted_at', null);
    
    allFolders = (folders || []).map((f: any) => ({
      id: f.id,
      name: f.name,
      parentId: f.parent_id,
      userId: f.user_id,
      order: f.order || 0,
      createdAt: f.created_at,
      updatedAt: f.updated_at,
      deletedAt: f.deleted_at,
    }));
  }

  const sentences = (material.sentences || []).filter((s: any) => !s.deleted_at);

  const sentenceIds = sentences.map((s: any) => s.id);
  let vocabCount = 0;
  let totalWords = 0;

  if (sentenceIds.length > 0) {
      const wordIds = new Set<string>();
      sentences.forEach((s: any) => {
          const occurrences = s.occurrences || [];
          totalWords += occurrences.length;
          occurrences.forEach((o: any) => wordIds.add(o.word_id));
      });
      vocabCount = wordIds.size;

      if (totalWords === 0) {
          const { data: occurrences } = await client
              .from('word_occurrences')
              .select('word_id')
              .in('sentence_id', sentenceIds);

          totalWords = occurrences?.length || 0;
          if (occurrences) {
              vocabCount = new Set(occurrences.map((o: any) => o.word_id)).size;
          }
      }
  }

  // Calculate Words Per Minute
  const durationInMins = (material.duration || 0) / 60;
  const effectiveWordCount = totalWords || vocabCount;
  const wpm = durationInMins > 0 ? effectiveWordCount / durationInMins : 0;

  // Prepare breadcrumbs with full folder path
  const breadcrumbs: { title: string; href?: string }[] = [
      { title: "Materials", href: "/materials" },
  ];
  
  if (material.folder && allFolders.length > 0) {
    // Get full folder path from root to current folder
    const folderPath = getFolderPath(allFolders, material.folder.id);
    
    folderPath.forEach((folder) => {
      breadcrumbs.push({ 
        title: folder.name, 
        href: `/materials?folderId=${folder.id}` 
      });
    });
  }
  
  breadcrumbs.push({ title: material.title });

  // Sort sentences by order
  // Supabase might return them unsorted unless we specify order in the nested select
  // We can sort here in JS safely
  // Also map snake_case to camelCase for the UI components
  const sortedSentences = [...sentences]
    .sort((a: any, b: any) => a.order - b.order)
    .map((s: any) => {
      const displayContent = s.edited_content ?? s.content;
      return {
        ...s,
        content: displayContent,
        originalContent: s.content,
        editedContent: s.edited_content,
        startTime: s.start_time,
        endTime: s.end_time,
        materialId: s.material_id,
        createdAt: s.created_at,
        updatedAt: s.updated_at,
        practiceAttempts: s.practices?.find((p: any) => p.user_id === session.user.id)?.attempts || 0,
        practiceScore: s.practices?.find((p: any) => p.user_id === session.user.id)?.score ?? null
      };
    });

  // Map snake_case to camelCase for material fields
  const materialWithSortedSentences = {
    ...material,
    isProcessed: material.is_processed,
    mimeType: material.mime_type,
    sentences: sortedSentences
  };

  return (
    <div className="flex-1 p-8 space-y-8">
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
