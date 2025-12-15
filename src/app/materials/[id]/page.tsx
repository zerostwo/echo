import { auth } from '@/auth';
import { getAdminClient, Query } from '@/lib/appwrite';
import { DATABASE_ID } from '@/lib/appwrite_client';
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

  const { databases } = await getAdminClient();

  // Fetch material
  let material: any = null;
  try {
    material = await databases.getDocument(
      DATABASE_ID,
      'materials',
      id
    );
  } catch (e) {
    notFound();
  }

  if (material.user_id !== session.user.id) notFound();

  // Fetch folder info if exists
  let folder: any = null;
  if (material.folder_id) {
    try {
      folder = await databases.getDocument(
        DATABASE_ID,
        'folders',
        material.folder_id
      );
    } catch (e) {
      console.error("Failed to fetch folder", e);
    }
  }

  // Fetch all folders for building the path
  let allFolders: any[] = [];
  if (folder) {
    const { documents: folders } = await databases.listDocuments(
      DATABASE_ID,
      'folders',
      [
        Query.equal('user_id', session.user.id),
        Query.isNull('deleted_at')
      ]
    );
    
    allFolders = (folders || []).map((f: any) => ({
      id: f.$id,
      name: f.name,
      parentId: f.parent_id,
      userId: f.user_id,
      order: f.order || 0,
      createdAt: f.$createdAt,
      updatedAt: f.$updatedAt,
      deletedAt: f.deleted_at,
    }));
  }

  // Get sentence count
  const { total: sentenceCount } = await databases.listDocuments(
    DATABASE_ID,
    'sentences',
    [
      Query.equal('material_id', id),
      Query.isNull('deleted_at'),
      Query.limit(0)
    ]
  );

  // Get vocab count
  // First get all sentence IDs (limit to 5000 for now as Appwrite has limits)
  const { documents: sentences } = await databases.listDocuments(
    DATABASE_ID,
    'sentences',
    [
      Query.equal('material_id', id),
      Query.isNull('deleted_at'),
      Query.select(['$id']),
      Query.limit(5000)
    ]
  );

  let vocabCount = 0;
  let totalWords = 0;

  if (sentences.length > 0) {
    const ids = sentences.map(s => s.$id);
    
    // Fetch occurrences in chunks if needed, but for now let's try to fetch
    // Appwrite might complain if array is too big for Query.equal('sentence_id', ids)
    // So we might need to iterate or use a different approach.
    // For now, let's assume it fits or we just skip this stats if too many.
    
    // Actually, fetching all occurrences just to count unique words is heavy.
    // Maybe we can skip this or optimize later.
    // Let's try to do it for small sets.
    if (ids.length <= 100) {
        const { documents: occurrences } = await databases.listDocuments(
            DATABASE_ID,
            'word_occurrences',
            [
                Query.equal('sentence_id', ids),
                Query.limit(5000)
            ]
        );
        totalWords = occurrences.length;
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
  
  if (folder && allFolders.length > 0) {
    // Get full folder path from root to current folder
    const folderPath = getFolderPath(allFolders, folder.$id);
    
    folderPath.forEach((f) => {
      breadcrumbs.push({ 
        title: f.name, 
        href: `/materials?folderId=${f.id}` 
      });
    });
  }
  
  breadcrumbs.push({ title: material.title });

  // Get initial paginated sentences
  const initialSentences = await getSentencesPaginated(id, 1, 10, {}, 'order', 'asc');
  
  if ('error' in initialSentences) {
    return <div className="p-8">Error loading sentences: {initialSentences.error}</div>;
  }

  // Get first sentence for Start Practice button
  const { documents: firstSentences } = await databases.listDocuments(
    DATABASE_ID,
    'sentences',
    [
        Query.equal('material_id', id),
        Query.isNull('deleted_at'),
        Query.orderAsc('order'),
        Query.limit(1)
    ]
  );
  const firstSentence = firstSentences[0];

  // Map snake_case to camelCase for material fields
  const materialWithStats = {
    ...material,
    id: material.$id,
    isProcessed: material.is_processed,
    mimeType: material.mime_type,
    sentences: firstSentence ? [{ id: firstSentence.$id }] : [],
    stats: {
      totalSentences: sentenceCount || 0,
      vocabCount,
    }
  };

  return (
    <div className="flex-1 py-8 space-y-8">
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
