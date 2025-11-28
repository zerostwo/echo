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
            .order('order', { ascending: true });

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
        // Get the max order for the parent level
        let query = client
            .from('folders')
            .select('order')
            .eq('user_id', session.user.id)
            .is('deleted_at', null);
        
        if (parentId) {
            query = query.eq('parent_id', parentId);
        } else {
            query = query.is('parent_id', null);
        }

        const { data: siblings } = await query.order('order', { ascending: false }).limit(1);
        const newOrder = siblings && siblings.length > 0 ? (siblings[0].order || 0) + 1 : 0;

        const { data: folder, error } = await client
            .from('folders')
            .insert({
                id: crypto.randomUUID(),
                name,
                user_id: session.user.id,
                parent_id: parentId || null,
                order: newOrder,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        revalidatePath('/materials');
        revalidatePath('/'); // Revalidate root to update sidebar if needed
        return { success: true, folder };
    } catch (e) {
        console.error('Failed to create folder:', e);
        const errorMessage = e instanceof Error ? e.message : 'Failed to create folder';
        return { error: errorMessage };
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

export async function updateFolderParent(folderId: string, newParentId: string | null) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    try {
        // Verify ownership
        const { data: folder, error: fetchError } = await client
            .from('folders')
            .select('*')
            .eq('id', folderId)
            .eq('user_id', session.user.id)
            .single();
        
        if (fetchError || !folder) return { error: 'Folder not found' };

        // Prevent circular references
        if (newParentId) {
            // Check if new parent exists and belongs to user
            const { data: parent, error: parentError } = await client
                .from('folders')
                .select('id, parent_id')
                .eq('id', newParentId)
                .eq('user_id', session.user.id)
                .single();

            if (parentError || !parent) return { error: 'Invalid parent folder' };

            // Check for circular reference by traversing ancestors
            let currentParentId: string | null = newParentId;
            const visited = new Set<string>();
            
            while (currentParentId) {
                if (currentParentId === folderId) {
                    return { error: 'Cannot move folder into its own descendant' };
                }
                if (visited.has(currentParentId)) break;
                visited.add(currentParentId);

                const ancestorResult = await client
                    .from('folders')
                    .select('parent_id')
                    .eq('id', currentParentId)
                    .single();
                
                const ancestorData = ancestorResult.data as { parent_id: string | null } | null;
                currentParentId = ancestorData?.parent_id || null;
            }
        }

        // Get the max order for the new parent level
        let query = client
            .from('folders')
            .select('order')
            .eq('user_id', session.user.id)
            .is('deleted_at', null)
            .neq('id', folderId);
        
        if (newParentId) {
            query = query.eq('parent_id', newParentId);
        } else {
            query = query.is('parent_id', null);
        }

        const { data: siblings } = await query.order('order', { ascending: false }).limit(1);
        const newOrder = siblings && siblings.length > 0 ? (siblings[0].order || 0) + 1 : 0;

        const { error } = await client
            .from('folders')
            .update({ 
                parent_id: newParentId,
                order: newOrder,
                updated_at: new Date().toISOString()
            })
            .eq('id', folderId)
            .eq('user_id', session.user.id);

        if (error) throw error;

        revalidatePath('/materials');
        revalidatePath('/');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to update folder parent' };
    }
}

export async function updateFolderOrder(
    updates: { id: string; order: number; parentId?: string | null }[]
) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    try {
        // Verify all folders belong to the user
        const folderIds = updates.map(u => u.id);
        const { data: folders, error: fetchError } = await client
            .from('folders')
            .select('id')
            .eq('user_id', session.user.id)
            .in('id', folderIds);

        if (fetchError) throw fetchError;
        if (!folders || folders.length !== folderIds.length) {
            return { error: 'Some folders not found or unauthorized' };
        }

        // Update each folder's order (and optionally parentId)
        for (const update of updates) {
            const updateData: { order: number; parent_id?: string | null; updated_at: string } = {
                order: update.order,
                updated_at: new Date().toISOString()
            };

            if (update.parentId !== undefined) {
                updateData.parent_id = update.parentId;
            }

            const { error } = await client
                .from('folders')
                .update(updateData)
                .eq('id', update.id)
                .eq('user_id', session.user.id);

            if (error) throw error;
        }

        revalidatePath('/materials');
        revalidatePath('/');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to update folder order' };
    }
}

export async function bulkMoveMaterials(materialIds: string[], folderId: string | null) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    try {
        // Verify folder ownership if folderId is provided
        if (folderId) {
            const { data: folder, error: folderError } = await client
                .from('folders')
                .select('id')
                .eq('id', folderId)
                .eq('user_id', session.user.id)
                .single();

            if (folderError || !folder) {
                return { error: 'Folder not found or unauthorized' };
            }
        }

        // Verify material ownership
        const { data: materials, error: materialError } = await client
            .from('materials')
            .select('id')
            .eq('user_id', session.user.id)
            .in('id', materialIds);

        if (materialError) throw materialError;
        if (!materials || materials.length !== materialIds.length) {
            return { error: 'Some materials not found or unauthorized' };
        }

        // Update all materials
        const { error } = await client
            .from('materials')
            .update({ 
                folder_id: folderId,
                updated_at: new Date().toISOString()
            })
            .in('id', materialIds)
            .eq('user_id', session.user.id);

        if (error) throw error;

        revalidatePath('/materials');
        return { success: true, count: materialIds.length };
    } catch (e) {
        return { error: 'Failed to move materials' };
    }
}
