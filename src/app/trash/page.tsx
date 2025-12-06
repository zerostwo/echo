import { auth } from '@/auth';
import { getTrashItemsPaginated } from '@/actions/trash-actions';
import { TrashClient } from './trash-client';
import { redirect } from 'next/navigation';

export default async function TrashPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const result = await getTrashItemsPaginated(1, 10);
  
  // Handle error case
  const initialData = 'error' in result ? {
      data: [],
      total: 0,
      page: 1,
      pageSize: 10,
      totalPages: 0
  } : result;

  return (
    <div className="p-4 h-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">Trash</h1>
      </div>
      <div className="text-sm text-muted-foreground mb-4">
        Items in trash will be permanently deleted after 30 days.
      </div>
      
      <TrashClient initialData={initialData} />
    </div>
  );
}
