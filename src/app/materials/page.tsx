import { auth } from '@/auth';
import { getAdminClient, APPWRITE_DATABASE_ID, Query } from '@/lib/appwrite';
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

  const admin = getAdminClient();

  // Fetch user settings
  let userSettings: any = {};
  try {
    const user = await admin.databases.getDocument(
        APPWRITE_DATABASE_ID,
        'users',
        session.user.id
    );
    if (user.settings) {
        userSettings = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
    }
  } catch (e) {
    console.error("Failed to fetch user settings", e);
  }

  const pageSize = userSettings.materialsPageSize || 10;
  const sortBy = userSettings.materialsSortBy || 'created_at';
  const sortOrder = userSettings.materialsSortOrder || 'desc';

  // Fetch folders for the "Move to" action
  const { documents: folders } = await admin.databases.listDocuments(
      APPWRITE_DATABASE_ID,
      'folders',
      [
          Query.equal('user_id', session.user.id),
          Query.isNull('deleted_at'),
          Query.orderAsc('name')
      ]
  );

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

  // Map folders to match expected interface if needed (Appwrite returns documents with )
  const mappedFolders = folders.map(f => ({
      id: f.$id,
      name: f.name,
      user_id: f.user_id,
      created_at: f.$createdAt,
      updated_at: f.$updatedAt
  }));

  return (
    <div className="py-8 h-full">
      <HeaderPortal>
          <UploadMaterialDialog folderId={currentFolderId === 'unfiled' ? null : currentFolderId || null} />
      </HeaderPortal>
      
      <MaterialsLiveRefresher watchList={autoRefreshIds} />
      
      <PaginatedDataTable 
        initialData={initialResult} 
        folders={mappedFolders} 
        folderId={currentFolderId === 'unfiled' ? 'unfiled' : currentFolderId || undefined}
        initialSortBy={sortBy}
        initialSortOrder={sortOrder}
      />
    </div>
  );
}
