'use server';

import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export async function getFolders() {
    const session = await auth();
    if (!session?.user?.id) return [];

    const client = supabaseAdmin || supabase;

    try {
        const { data: folders, error } = await client
            .from('folders')
            .select('*')
            .eq('user_id', session.user.id)
            .is('deleted_at', null)
            .order('name', { ascending: true });

        if (error) throw error;
        return folders || [];
    } catch (e) {
        return [];
    }
}

export async function createFolder(name: string, parentId?: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    try {
        const { data: folder, error } = await client
            .from('folders')
            .insert({
                name,
                user_id: session.user.id,
                parent_id: parentId || null,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

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

    const client = supabaseAdmin || supabase;

    try {
        // Verify ownership
        const { data: folder, error: fetchError } = await client
            .from('folders')
            .select('*, children:folders(*)')
            .eq('id', folderId)
            .eq('user_id', session.user.id)
            .single();
        
        if (fetchError || !folder) return { error: 'Folder not found' };

        if (moveToUnfiled) {
             // Move materials to unfiled (folderId: null)
            const { error: moveError } = await client
                .from('materials')
                .update({ folder_id: null })
                .eq('folder_id', folderId)
                .eq('user_id', session.user.id);

            if (moveError) throw moveError;
        }

        // Soft delete the folder
        const { error: deleteError } = await client
            .from('folders')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', folderId);

        if (deleteError) throw deleteError;
        
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

    const client = supabaseAdmin || supabase;

    try {
        const { error } = await client
            .from('folders')
            .update({ name: newName })
            .eq('id', folderId)
            .eq('user_id', session.user.id);

        if (error) throw error;

        revalidatePath('/materials');
        revalidatePath('/');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to rename folder' };
    }
}
