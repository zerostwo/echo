'use server';

import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export async function moveMaterial(materialId: string, targetFolderId: string | null) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        const { error } = await supabase
            .from('materials')
            .update({ folder_id: targetFolderId })
            .eq('id', materialId)
            .eq('user_id', session.user.id);

        if (error) throw error;
        
        revalidatePath('/materials');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to move material' };
    }
}
