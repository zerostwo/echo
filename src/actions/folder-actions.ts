'use server';

import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';

export async function getFolders() {
    const session = await auth();
    if (!session?.user?.id) return [];

    try {
        const { data: folders, error } = await supabase
            .from('Folder')
            .select('*')
            .eq('userId', session.user.id)
            .is('deletedAt', null)
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

    try {
        const { data: folder, error } = await supabase
            .from('Folder')
            .insert({
                name,
                userId: session.user.id,
                parentId: parentId || null,
                updatedAt: new Date().toISOString()
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

    try {
        // Verify ownership
        const { data: folder, error: fetchError } = await supabase
            .from('Folder')
            .select('*, children:Folder(*)')
            .eq('id', folderId)
            .eq('userId', session.user.id)
            .single();
        
        if (fetchError || !folder) return { error: 'Folder not found' };

        if (moveToUnfiled) {
             // Move materials to unfiled (folderId: null)
            const { error: moveError } = await supabase
                .from('Material')
                .update({ folderId: null })
                .eq('folderId', folderId)
                .eq('userId', session.user.id);

            if (moveError) throw moveError;
        }

        // Soft delete the folder
        const { error: deleteError } = await supabase
            .from('Folder')
            .update({ deletedAt: new Date().toISOString() })
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

    try {
        const { error } = await supabase
            .from('Folder')
            .update({ name: newName })
            .eq('id', folderId)
            .eq('userId', session.user.id);

        if (error) throw error;

        revalidatePath('/materials');
        revalidatePath('/');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to rename folder' };
    }
}
