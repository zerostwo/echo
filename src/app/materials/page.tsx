import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { MaterialsTableWrapper } from '@/components/materials/materials-table-wrapper';
import { UploadMaterialDialog } from './upload-dialog';
import { HeaderPortal } from '@/components/header-portal';

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<{ folderId?: string }> }) {
  const session = await auth();
  const resolvedSearchParams = await searchParams;
  const currentFolderId = resolvedSearchParams.folderId;

  if (!session?.user?.id) return <div>Unauthorized</div>;

  const client = supabaseAdmin || supabase;

  // Fetch folders for the "Move to" action
  const { data: folders } = await client
    .from('folders')
    .select('*')
    .eq('user_id', session.user.id)
    .is('deleted_at', null)
    .order('name', { ascending: true });

  let query = client
    .from('materials')
    .select(`
        *,
        sentences:sentences(
            *,
            practices:practice_progress(*),
            occurrences:word_occurrences(word_id)
        )
    `)
    .eq('user_id', session.user.id)
    .is('deleted_at', null)
    .order('title', { ascending: true });

  if (currentFolderId === 'unfiled') {
      query = query.is('folder_id', null);
  } else if (currentFolderId) {
      query = query.eq('folder_id', currentFolderId);
  }

  const { data: materials } = await query;

  // Process materials to calculate stats
  const processedMaterials = (materials || []).map((m: any) => {
      const sentences = m.sentences || [];
      // Calculate Practice Stats
      const totalSentences = sentences.length;
      const practicedSentences = sentences.filter((s: any) => s.practices && s.practices.length > 0).length;
      
      let totalScore = 0;
      let totalDuration = 0;
      let totalAttempts = 0;

      sentences.forEach((s: any) => {
          const practices = s.practices || [];
          // Filter practices by current user (though likely already filtered by RLS or strict material ownership)
          const userPractice = practices.find((p: any) => p.user_id === session.user.id);
          
          if (userPractice) {
               totalScore += userPractice.score;
               totalDuration += userPractice.duration || 0;
               totalAttempts += userPractice.attempts;
          }
      });

      const avgScore = practicedSentences > 0 ? Math.round(totalScore / practicedSentences) : 0;

      // Calculate Vocab Count
      const uniqueWordIds = new Set<string>();
      sentences.forEach((s: any) => {
          const occurrences = s.occurrences || [];
          occurrences.forEach((o: any) => uniqueWordIds.add(o.word_id));
      });
      
      return {
          ...m,
          stats: {
              practicedCount: practicedSentences,
              totalSentences: totalSentences,
              avgScore: avgScore,
              vocabCount: uniqueWordIds.size,
              duration: totalDuration,
              attempts: totalAttempts
          }
      };
  });

  return (
    <div className="p-8 h-full">
      <HeaderPortal>
          <UploadMaterialDialog folderId={currentFolderId === 'unfiled' ? null : currentFolderId || null} />
      </HeaderPortal>
      
      <MaterialsTableWrapper materials={processedMaterials} folders={folders || []} />
    </div>
  );
}
