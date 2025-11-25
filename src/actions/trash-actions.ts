'use server';

import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { permanentlyDeleteMaterial } from './material-actions';
import { revalidatePath } from 'next/cache';

export async function getTrashItems() {
    const session = await auth();
    if (!session?.user?.id) return { materials: [], folders: [] };

    const materials = await prisma.material.findMany({
        where: { 
            userId: session.user.id, 
            deletedAt: { not: null } 
        },
        orderBy: { deletedAt: 'desc' }
    });

    const folders = await prisma.folder.findMany({
        where: { 
            userId: session.user.id, 
            deletedAt: { not: null } 
        },
        orderBy: { deletedAt: 'desc' }
    });

    return { materials, folders };
}

export async function emptyTrash() {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        const materials = await prisma.material.findMany({
            where: { 
                userId: session.user.id, 
                deletedAt: { not: null } 
            },
            select: { id: true }
        });

        for (const m of materials) {
            await permanentlyDeleteMaterial(m.id);
        }
        
        await prisma.folder.deleteMany({
             where: { 
                userId: session.user.id, 
                deletedAt: { not: null } 
            }
        });

        revalidatePath('/trash');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to empty trash' };
    }
}
