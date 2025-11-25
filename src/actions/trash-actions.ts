'use server';

import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { permanentlyDeleteMaterial } from './material-actions';
import { revalidatePath } from 'next/cache';

export async function getTrashItems() {
    const session = await auth();
    if (!session?.user?.id) return { materials: [], folders: [] };

    const { data: materials } = await supabase
        .from('Material')
        .select('*')
        .eq('userId', session.user.id)
        .not('deletedAt', 'is', null)
        .order('deletedAt', { ascending: false });

    const { data: folders } = await supabase
        .from('Folder')
        .select('*')
        .eq('userId', session.user.id)
        .not('deletedAt', 'is', null)
        .order('deletedAt', { ascending: false });

    return { materials: materials || [], folders: folders || [] };
}

export async function emptyTrash() {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        const { data: materials } = await supabase
            .from('Material')
            .select('id')
            .eq('userId', session.user.id)
            .not('deletedAt', 'is', null);

        if (materials) {
            for (const m of materials) {
                await permanentlyDeleteMaterial(m.id);
            }
        }
        
        const { error: folderError } = await supabase
            .from('Folder')
            .delete()
            .eq('userId', session.user.id)
            .not('deletedAt', 'is', null);

        if (folderError) throw folderError;

        revalidatePath('/trash');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to empty trash' };
    }
}
