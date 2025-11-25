'use server';

import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { revalidatePath } from 'next/cache';

export async function moveMaterial(materialId: string, targetFolderId: string | null) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        await prisma.material.update({
            where: { id: materialId, userId: session.user.id },
            data: { folderId: targetFolderId }
        });
        
        revalidatePath('/materials');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to move material' };
    }
}

