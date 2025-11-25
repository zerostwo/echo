'use server';

import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function getFolders() {
    const session = await auth();
    if (!session?.user?.id) return [];

    try {
        const folders = await prisma.folder.findMany({
            where: { 
                userId: session.user.id,
                deletedAt: null 
            },
            orderBy: { name: 'asc' }
        });
        return folders;
    } catch (e) {
        return [];
    }
}

export async function createFolder(name: string, parentId?: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        const folder = await prisma.folder.create({
            data: {
                name,
                userId: session.user.id,
                parentId: parentId || null
            }
        });
        revalidatePath('/materials');
        revalidatePath('/'); // Revalidate root to update sidebar if needed
        return { success: true, folder };
    } catch (e) {
        return { error: 'Failed to create folder' };
    }
}

export async function deleteFolder(folderId: string, moveToUnfiled: boolean = true) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        // Verify ownership
        const folder = await prisma.folder.findUnique({
            where: { id: folderId, userId: session.user.id },
            include: { children: true }
        });
        
        if (!folder) return { error: 'Folder not found' };

        if (moveToUnfiled) {
             // Move materials to unfiled (folderId: null)
            await prisma.material.updateMany({
                where: { folderId: folderId, userId: session.user.id },
                data: { folderId: null }
            });
        }

        // Soft delete the folder
        await prisma.folder.update({
            where: { id: folderId },
            data: { deletedAt: new Date() }
        });
        
        revalidatePath('/materials');
        revalidatePath('/');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to delete folder' };
    }
}

export async function renameFolder(folderId: string, newName: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        await prisma.folder.update({
            where: { id: folderId, userId: session.user.id },
            data: { name: newName }
        });
        revalidatePath('/materials');
        revalidatePath('/');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to rename folder' };
    }
}
