import { auth } from '@/auth';
import { getTrashItems } from '@/actions/trash-actions';
import { TrashDataTable } from '@/components/trash/trash-data-table';
import { TrashHeaderActions } from '@/components/trash/trash-header-actions';
import { redirect } from 'next/navigation';

export default async function TrashPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const { items } = await getTrashItems();

  return (
    <div className="p-4 h-full">
      <TrashHeaderActions />
      <div className="text-sm text-muted-foreground mb-4">
        Items in trash will be permanently deleted after 30 days.
      </div>
      
      <TrashDataTable data={items || []} />
    </div>
  );
}
