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

  // Fetch user settings
  const { data: userData } = await client
    .from('users')
    .select('settings')
    .eq('id', session.user.id)
    .single();

  let userSettings: any = {};
  if (userData?.settings) {
    try {
      userSettings = JSON.parse(userData.settings);
    } catch (e) {
      console.error("Failed to parse user settings", e);
    }
  }

  const pageSize = userSettings.materialsPageSize || 10;
  const sortBy = userSettings.materialsSortBy || 'created_at';
  const sortOrder = userSettings.materialsSortOrder || 'desc';

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
    pageSize, 
    { folderId: currentFolderId === 'unfiled' ? 'unfiled' : currentFolderId || undefined },
    sortBy,
    sortOrder
  );

  if ('error' in initialResult) {
    return <div className="p-8">Error loading material: {initialResult.error}</div>;
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
    <div className="py-8 h-full">
      <HeaderPortal>
          <UploadMaterialDialog folderId={currentFolderId === 'unfiled' ? null : currentFolderId || null} />
      </HeaderPortal>
      
      <MaterialsLiveRefresher watchList={autoRefreshIds} />
      
      <PaginatedDataTable 
        initialData={initialResult} 
        folders={folders || []} 
        folderId={currentFolderId === 'unfiled' ? 'unfiled' : currentFolderId || undefined}
        initialSortBy={sortBy}
        initialSortOrder={sortOrder}
      />
    </div>
  );
}
