import { auth } from '@/auth';
import { getTrashItemsPaginated } from '@/actions/trash-actions';
import { TrashClient } from './trash-client';
import { redirect } from 'next/navigation';
import { supabaseAdmin, supabase } from '@/lib/supabase';

export default async function TrashPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const client = supabaseAdmin || supabase;

  // Fetch user settings
  const { data: user } = await client
    .from('users')
    .select('settings')
    .eq('id', session.user.id)
    .single();

  let userSettings: any = {};
  if (user?.settings) {
    try {
      userSettings = JSON.parse(user.settings);
    } catch (e) {
      console.error("Failed to parse user settings", e);
    }
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
