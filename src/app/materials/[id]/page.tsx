import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { notFound } from 'next/navigation';
import { SetBreadcrumbs } from '@/components/set-breadcrumbs';
import { MaterialStatsCard } from './material-stats-card';
import { PaginatedSentencesTable } from './paginated-sentences-table';
import { getFolderPath, type Folder } from '@/lib/folder-utils';
import { getSentencesPaginated } from '@/actions/sentence-actions';

export default async function MaterialDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) return <div>Unauthorized</div>;

  const client = supabaseAdmin || supabase;

  // Fetch material with folder info (without sentences for initial load)
  const { data: material, error } = await client
    .from('materials')
    .select(`
        *,
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

  // Get sentence count and vocab count for stats
  const { count: sentenceCount } = await client
    .from('sentences')
    .select('id', { count: 'exact', head: true })
    .eq('material_id', id)
    .is('deleted_at', null);

  // Get vocab count
  const { data: sentenceIds } = await client
    .from('sentences')
    .select('id')
    .eq('material_id', id)
    .is('deleted_at', null);

  let vocabCount = 0;
  let totalWords = 0;

  if (sentenceIds && sentenceIds.length > 0) {
    const ids = sentenceIds.map(s => s.id);
    
    const { data: occurrences } = await client
      .from('word_occurrences')
      .select('word_id')
      .in('sentence_id', ids);

    totalWords = occurrences?.length || 0;
    if (occurrences) {
      vocabCount = new Set(occurrences.map((o: any) => o.word_id)).size;
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

  // Get initial paginated sentences
  const initialSentences = await getSentencesPaginated(id, 1, 10, {}, 'order', 'asc');
  
  if ('error' in initialSentences) {
    return <div className="p-8">Error loading sentences: {initialSentences.error}</div>;
  }

  // Map snake_case to camelCase for material fields
  const materialWithStats = {
    ...material,
    isProcessed: material.is_processed,
    mimeType: material.mime_type,
    sentences: [], // We don't pass sentences here anymore
    stats: {
      totalSentences: sentenceCount || 0,
      vocabCount,
    }
  };

  return (
    <div className="flex-1 p-8 space-y-8">
      <SetBreadcrumbs items={breadcrumbs} />

      <MaterialStatsCard 
        material={materialWithStats}
        vocabCount={vocabCount}
        wpm={wpm}
      />

      <div className="space-y-4">
        <PaginatedSentencesTable 
          materialId={id} 
          initialData={initialSentences}
        />
      </div>
    </div>
  );
}
