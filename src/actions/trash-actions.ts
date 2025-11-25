'use server';

import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { permanentlyDeleteMaterial } from './material-actions';
import { revalidatePath } from 'next/cache';

export async function getTrashItems() {
    const session = await auth();
    if (!session?.user?.id) return { materials: [], folders: [] };

    const { data: materials } = await supabase
        .from('materials')
        .select('*')
        .eq('user_id', session.user.id)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

    const { data: folders } = await supabase
        .from('folders')
        .select('*')
        .eq('user_id', session.user.id)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

    return { materials: materials || [], folders: folders || [] };
}

export async function emptyTrash() {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        const { data: materials } = await supabase
            .from('materials')
            .select('id')
            .eq('user_id', session.user.id)
            .not('deleted_at', 'is', null);

        if (materials) {
            for (const m of materials) {
                await permanentlyDeleteMaterial(m.id);
            }
        }
        
        const { error: folderError } = await supabase
            .from('folders')
            .delete()
            .eq('user_id', session.user.id)
            .not('deleted_at', 'is', null);

        if (folderError) throw folderError;

        revalidatePath('/trash');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to empty trash' };
    }
}
