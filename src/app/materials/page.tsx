import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { MaterialsTableWrapper } from '@/components/materials/materials-table-wrapper';
import { MaterialsLiveRefresher } from '@/components/materials/materials-live-refresher';
import { UploadMaterialDialog } from './upload-dialog';
import { HeaderPortal } from '@/components/header-portal';
import { redirect } from 'next/navigation';

export default async function MaterialsPage({ searchParams }: { searchParams: Promise<{ folderId?: string }> }) {
  const session = await auth();
  const resolvedSearchParams = await searchParams;
  const currentFolderId = resolvedSearchParams.folderId;

  if (!session?.user?.id) redirect('/login');

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
      const sentences = (m.sentences || []).filter((s: any) => !s.deleted_at);
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

  // Trigger client-side auto refresh while recent items are still processing/empty
  const autoRefreshIds = (processedMaterials || []).filter((m: any) => {
      const createdAt = new Date(m.created_at).getTime();
      const isRecent = Date.now() - createdAt < 30 * 60 * 1000; // 30 minutes
      const stillProcessing = m.is_processed === false;
      const pendingCounts = m.is_processed && isRecent && (m.stats.totalSentences === 0 || m.stats.vocabCount === 0);
      return stillProcessing || pendingCounts;
  }).map((m: any) => m.id);

  return (
    <div className="p-8 h-full">
      <HeaderPortal>
          <UploadMaterialDialog folderId={currentFolderId === 'unfiled' ? null : currentFolderId || null} />
      </HeaderPortal>
      
      <MaterialsLiveRefresher watchList={autoRefreshIds} />
      
      <MaterialsTableWrapper materials={processedMaterials} folders={folders || []} />
    </div>
  );
}
