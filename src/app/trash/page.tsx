import { auth } from '@/auth';
import { getTrashItems } from '@/actions/trash-actions';
import { DataTable } from '@/components/materials/data-table';
import { columns } from '@/components/trash/columns';
import { EmptyTrashButton } from '@/components/trash/empty-trash-button';

export default async function TrashPage() {
  const session = await auth();
  if (!session?.user?.id) return <div>Unauthorized</div>;

  const { materials } = await getTrashItems();

  return (
    <div className="p-8 h-full">
      <div className="flex items-center justify-between mb-4">
          <div className="text-sm text-muted-foreground">
              Items in trash will be permanently deleted after 30 days.
          </div>
          <EmptyTrashButton />
      </div>
      
      <DataTable columns={columns} data={materials as any[]} />
    </div>
  );
}

