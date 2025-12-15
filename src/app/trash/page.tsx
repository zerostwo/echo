import { auth } from '@/auth';
import { getTrashItemsPaginated } from '@/actions/trash-actions';
import { TrashClient } from './trash-client';
import { redirect } from 'next/navigation';
import { getAdminClient } from '@/lib/appwrite';
import { DATABASE_ID } from '@/lib/appwrite_client';

export default async function TrashPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  // Fetch user settings
  let userSettings: any = {};
  try {
    const { databases } = await getAdminClient();
    const user = await databases.getDocument(
      DATABASE_ID,
      'users',
      session.user.id
    );

    if (user?.settings) {
      try {
        userSettings = JSON.parse(user.settings);
      } catch (e) {
        console.error("Failed to parse user settings", e);
      }
    }
  } catch (error) {
    console.error("Failed to fetch user settings", error);
  }

  const pageSize = userSettings.trashPageSize || 10;
  const sortBy = userSettings.trashSortBy || 'deleted_at';
  const sortOrder = userSettings.trashSortOrder || 'desc';

  const result = await getTrashItemsPaginated(1, pageSize, undefined, sortBy, sortOrder);
  
  // Handle error case
  const initialData = 'error' in result ? {
      data: [],
      total: 0,
      page: 1,
      pageSize: pageSize,
      totalPages: 0
  } : result;

  return (
    <div className="py-8 h-full">
      <div className="text-sm text-muted-foreground mb-4">
        Items in trash will be permanently deleted after 30 days.
      </div>
      
      <TrashClient 
        initialData={initialData} 
        initialSortBy={sortBy}
        initialSortOrder={sortOrder}
      />
    </div>
  );
}
