import { auth } from '@/auth';
import { getAdminClient, Query } from '@/lib/appwrite';
import { DATABASE_ID } from '@/lib/appwrite_client';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UserQuotaDialog } from './quota-dialog';
import { Badge } from "@/components/ui/badge";
import { UserActions } from './user-actions';
import { redirect } from 'next/navigation';

export default async function AdminUsersPage() {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
        redirect('/dashboard');
    }

    const { databases } = await getAdminClient();

    const { documents: users } = await databases.listDocuments(
        DATABASE_ID,
        'users',
        [Query.orderDesc('created_at')]
    );

    return (
        <div className="py-8">
            <h1 className="text-3xl font-bold mb-6">User Management</h1>
            <div className="border rounded-lg">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>User</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Usage</TableHead>
                            <TableHead>Quota</TableHead>
                            <TableHead>Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {(users || []).map((u: any) => (
                            <TableRow key={u.$id}>
                                <TableCell>
                                    <div className="flex flex-col">
                                        <span className="font-medium">{u.display_name || u.username || 'User'}</span>
                                        <span className="text-xs text-muted-foreground">{u.email}</span>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <Badge variant={u.role === 'ADMIN' ? 'default' : 'secondary'}>
                                        {u.role}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    <Badge variant={u.is_active ? 'outline' : 'destructive'}>
                                        {u.is_active ? 'Active' : 'Inactive'}
                                    </Badge>
                                </TableCell>
                                <TableCell>{(Number(u.used_space) / 1024 / 1024).toFixed(2)} MB</TableCell>
                                <TableCell>{(Number(u.quota) / 1024 / 1024 / 1024).toFixed(1)} GB</TableCell>
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <UserQuotaDialog userId={u.$id} currentQuotaGB={Number(u.quota) / 1024 / 1024 / 1024} />
                                        <UserActions userId={u.$id} isActive={u.is_active} role={u.role} />
                                    </div>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </div>
        </div>
    );
}
