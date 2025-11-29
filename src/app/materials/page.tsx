import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { PaginatedDataTable } from '@/components/materials/paginated-data-table';
import { MaterialsLiveRefresher } from '@/components/materials/materials-live-refresher';
import { UploadMaterialDialog } from './upload-dialog';
import { HeaderPortal } from '@/components/header-portal';
import { redirect } from 'next/navigation';
import { getMaterialsPaginated } from '@/actions/material-actions';

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

  // Get initial paginated data
  const initialResult = await getMaterialsPaginated(
    1, 
    10, 
    { folderId: currentFolderId === 'unfiled' ? 'unfiled' : currentFolderId || undefined },
    'title',
    'asc'
  );

  if ('error' in initialResult) {
    return <div className="p-8">Error loading materials: {initialResult.error}</div>;
  }

  // Trigger client-side auto refresh while recent items are still processing/empty
  const autoRefreshIds = (initialResult.data || []).filter((m: any) => {
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
      
      <PaginatedDataTable 
        initialData={initialResult} 
        folders={folders || []} 
        folderId={currentFolderId === 'unfiled' ? 'unfiled' : currentFolderId || undefined}
      />
    </div>
  );
}
