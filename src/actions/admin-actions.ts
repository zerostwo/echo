'use server';
import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

async function checkAdmin() {
    const session = await auth();
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
        throw new Error('Unauthorized');
    }
    return session;
}

export async function updateQuota(userId: string, newQuotaGB: number) {
    try {
        await checkAdmin();
        const quotaBytes = BigInt(newQuotaGB) * BigInt(1024 * 1024 * 1024);
        
        const { error } = await supabase
            .from('users')
            .update({ quota: quotaBytes.toString() }) // Send as string to ensure precision if needed, or number
            .eq('id', userId);

        if (error) throw error;
        
        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { error: 'Failed to update quota' };
    }
}

export async function toggleUserStatus(userId: string, isActive: boolean) {
    try {
        await checkAdmin();
        
        const { error } = await supabase
            .from('users')
            .update({ is_active: isActive })
            .eq('id', userId);

        if (error) throw error;

        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { error: 'Failed to update user status' };
    }
}

export async function deleteUser(userId: string) {
    try {
        await checkAdmin();
        
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);

        if (error) throw error;

        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { error: 'Failed to delete user' };
    }
}
