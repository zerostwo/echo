'use server';
import { auth } from '@/auth';
import prisma from '@/lib/prisma';
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
        
        await prisma.user.update({
            where: { id: userId },
            data: { quota: quotaBytes }
        });
        
        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { error: 'Failed to update quota' };
    }
}

export async function toggleUserStatus(userId: string, isActive: boolean) {
    try {
        await checkAdmin();
        await prisma.user.update({
            where: { id: userId },
            data: { isActive }
        });
        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { error: 'Failed to update user status' };
    }
}

export async function deleteUser(userId: string) {
    try {
        await checkAdmin();
        await prisma.user.delete({
            where: { id: userId }
        });
        revalidatePath('/admin/users');
        return { success: true };
    } catch (error) {
        return { error: 'Failed to delete user' };
    }
}
