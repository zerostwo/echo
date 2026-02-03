'use server';

import { auth } from '@/auth';
import { getAdminClient } from '@/lib/appwrite';
import { DATABASE_IDS, COLLECTION_IDS } from '@/lib/appwrite_client';
import { revalidatePath } from 'next/cache';

export async function moveMaterial(materialId: string, targetFolderId: string | null) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        const { databases } = await getAdminClient();
        
        // Verify material ownership
        const material = await databases.getDocument(
            DATABASE_IDS.main,
            COLLECTION_IDS.materials,
            materialId
        );
        
        if (material.user_id !== session.user.id) {
            return { error: 'Unauthorized' };
        }
        
        await databases.updateDocument(
            DATABASE_IDS.main,
            COLLECTION_IDS.materials,
            materialId,
            {
                folder_id: targetFolderId
            }
        );
        
        revalidatePath('/materials');
        return { success: true };
    } catch (e) {
        console.error('Failed to move material:', e);
        return { error: 'Failed to move material' };
    }
}
