'use server';

import { auth } from '@/auth';
import { getAdminClient, createSessionClient } from '@/lib/appwrite';
import { 
    DATABASE_ID, 
    FOLDERS_COLLECTION_ID, 
    MATERIALS_COLLECTION_ID
} from '@/lib/appwrite_client';
import { ID, Query } from 'node-appwrite';
import { revalidatePath } from 'next/cache';

export async function getFolders() {
    const session = await auth();
    if (!session?.user?.id) return [];

    const { databases } = await createSessionClient();

    try {
        // Appwrite default limit is 25. We might need pagination if user has many folders.
        // For now, let's set a higher limit like 100.
        const { documents: folders } = await databases.listDocuments(
            DATABASE_ID,
            FOLDERS_COLLECTION_ID,
            [
                Query.equal('user_id', session.user.id),
                Query.isNull('deleted_at'),
                Query.orderAsc('order'),
                Query.limit(100)
            ]
        );

        return folders.map(f => ({
            id: f.$id,
            name: f.name,
            userId: f.user_id,
            parentId: f.parent_id,
            order: f.order,
            createdAt: f.$createdAt,
            updatedAt: f.$updatedAt,
            deletedAt: f.deleted_at
        }));
    } catch (e) {
        console.error('Failed to get folders:', e);
        return [];
    }
}

export async function createFolder(name: string, parentId?: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const { databases } = await createSessionClient();

    try {
        // Get the max order for the parent level
        const queries = [
            Query.equal('user_id', session.user.id),
            Query.isNull('deleted_at'),
            Query.orderDesc('order'),
            Query.limit(1)
        ];
        
        if (parentId) {
            queries.push(Query.equal('parent_id', parentId));
        } else {
            queries.push(Query.isNull('parent_id'));
        }

        const { documents: siblings } = await databases.listDocuments(
            DATABASE_ID,
            FOLDERS_COLLECTION_ID,
            queries
        );
        
        const newOrder = siblings && siblings.length > 0 ? (siblings[0].order || 0) + 1 : 0;

        const folder = await databases.createDocument(
            DATABASE_ID,
            FOLDERS_COLLECTION_ID,
            ID.unique(),
            {
                name,
                user_id: session.user.id,
                parent_id: parentId || null,
                order: newOrder,
                updated_at: new Date().toISOString()
            }
        );

        revalidatePath('/materials');
        revalidatePath('/'); // Revalidate root to update sidebar if needed
        return { 
            success: true, 
            folder: {
                id: folder.$id,
                name: folder.name,
                user_id: folder.user_id,
                parent_id: folder.parent_id,
                order: folder.order,
                created_at: folder.$createdAt,
                updated_at: folder.$updatedAt
            } 
        };
    } catch (e) {
        console.error('Failed to create folder:', e);
        const errorMessage = e instanceof Error ? e.message : 'Failed to create folder';
        return { error: errorMessage };
    }
}

export async function deleteFolder(folderId: string, moveToUnfiled: boolean = true) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const { databases } = await createSessionClient();

    try {
        // Verify ownership
        const folder = await databases.getDocument(
            DATABASE_ID,
            FOLDERS_COLLECTION_ID,
            folderId
        );
        
        if (!folder || folder.user_id !== session.user.id) return { error: 'Folder not found' };

        if (moveToUnfiled) {
             // Move materials to unfiled (folder_id: null)
             // Find materials in this folder
             const materials = await databases.listDocuments(
                 DATABASE_ID,
                 MATERIALS_COLLECTION_ID,
                 [
                     Query.equal('folder_id', folderId),
                     Query.equal('user_id', session.user.id)
                 ]
             );

             // Update them one by one
             await Promise.all(materials.documents.map(m => 
                 databases.updateDocument(
                     DATABASE_ID,
                     MATERIALS_COLLECTION_ID,
                     m.$id,
                     { folder_id: null }
                 )
             ));
        }

        // Soft delete the folder
        await databases.updateDocument(
            DATABASE_ID,
            FOLDERS_COLLECTION_ID,
            folderId,
            { deleted_at: new Date().toISOString() }
        );
        
        revalidatePath('/materials');
        revalidatePath('/');
        return { success: true };
    } catch (e) {
        console.error('Failed to delete folder:', e);
        return { error: 'Failed to delete folder' };
    }
}

export async function renameFolder(folderId: string, newName: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const { databases } = await createSessionClient();

    try {
        // Verify ownership implicitly by query or getDocument
        const folder = await databases.getDocument(
            DATABASE_ID,
            FOLDERS_COLLECTION_ID,
            folderId
        );

        if (folder.user_id !== session.user.id) return { error: 'Unauthorized' };

        await databases.updateDocument(
            DATABASE_ID,
            FOLDERS_COLLECTION_ID,
            folderId,
            { name: newName }
        );

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

    const { databases } = await createSessionClient();

    try {
        // Verify ownership
        const folder = await databases.getDocument(
            DATABASE_ID,
            FOLDERS_COLLECTION_ID,
            folderId
        );
        
        if (!folder || folder.user_id !== session.user.id) return { error: 'Folder not found' };

        // Prevent circular references
        if (newParentId) {
            // Check if new parent exists and belongs to user
            const parent = await databases.getDocument(
                DATABASE_ID,
                FOLDERS_COLLECTION_ID,
                newParentId
            );

            if (!parent || parent.user_id !== session.user.id) return { error: 'Invalid parent folder' };

            // Check for circular reference by traversing ancestors
            let currentParentId: string | null = newParentId;
            const visited = new Set<string>();
            
            // Safety limit for loop
            let depth = 0;
            const MAX_DEPTH = 20;

            while (currentParentId && depth < MAX_DEPTH) {
                if (currentParentId === folderId) {
                    return { error: 'Cannot move folder into its own descendant' };
                }
                if (visited.has(currentParentId)) break;
                visited.add(currentParentId);

                try {
                    const ancestor: any = await databases.getDocument(
                        DATABASE_ID,
                        FOLDERS_COLLECTION_ID,
                        currentParentId
                    );
                    currentParentId = ancestor.parent_id || null;
                } catch (e) {
                    // Ancestor not found? Break loop
                    currentParentId = null;
                }
                depth++;
            }
        }

        // Get the max order for the new parent level
        const queries = [
            Query.equal('user_id', session.user.id),
            Query.isNull('deleted_at'),
            Query.notEqual('$id', folderId), // Exclude self
            Query.orderDesc('order'),
            Query.limit(1)
        ];
        
        if (newParentId) {
            queries.push(Query.equal('parent_id', newParentId));
        } else {
            queries.push(Query.isNull('parent_id'));
        }

        const { documents: siblings } = await databases.listDocuments(
            DATABASE_ID,
            FOLDERS_COLLECTION_ID,
            queries
        );
        
        const newOrder = siblings && siblings.length > 0 ? (siblings[0].order || 0) + 1 : 0;

        await databases.updateDocument(
            DATABASE_ID,
            FOLDERS_COLLECTION_ID,
            folderId,
            { 
                parent_id: newParentId,
                order: newOrder,
                updated_at: new Date().toISOString()
            }
        );

        revalidatePath('/materials');
        revalidatePath('/');
        return { success: true };
    } catch (e) {
        console.error('Failed to update folder parent:', e);
        return { error: 'Failed to update folder parent' };
    }
}

export async function updateFolderOrder(
    updates: { id: string; order: number; parentId?: string | null }[]
) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const { databases } = await createSessionClient();

    try {
        // Verify all folders belong to the user
        const folderIds = updates.map(u => u.id);
        // Appwrite listDocuments with equal array
        const { documents: folders } = await databases.listDocuments(
            DATABASE_ID,
            FOLDERS_COLLECTION_ID,
            [
                Query.equal('user_id', session.user.id),
                Query.equal('$id', folderIds)
            ]
        );

        if (!folders || folders.length !== folderIds.length) {
            return { error: 'Some folders not found or unauthorized' };
        }

        // Update each folder's order (and optionally parentId)
        await Promise.all(updates.map(update => {
            const updateData: { order: number; parent_id?: string | null; updated_at: string } = {
                order: update.order,
                updated_at: new Date().toISOString()
            };

            if (update.parentId !== undefined) {
                updateData.parent_id = update.parentId;
            }

            return databases.updateDocument(
                DATABASE_ID,
                FOLDERS_COLLECTION_ID,
                update.id,
                updateData
            );
        }));

        revalidatePath('/materials');
        revalidatePath('/');
        return { success: true };
    } catch (e) {
        console.error('Failed to update folder order:', e);
        return { error: 'Failed to update folder order' };
    }
}

export async function bulkMoveMaterials(materialIds: string[], folderId: string | null) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const { databases } = await createSessionClient();

    try {
        // Verify folder ownership if folderId is provided
        if (folderId) {
            const folder = await databases.getDocument(
                DATABASE_ID,
                FOLDERS_COLLECTION_ID,
                folderId
            );

            if (!folder || folder.user_id !== session.user.id) {
                return { error: 'Folder not found or unauthorized' };
            }
        }

        // Verify material ownership
        const { documents: materials } = await databases.listDocuments(
            DATABASE_ID,
            MATERIALS_COLLECTION_ID,
            [
                Query.equal('user_id', session.user.id),
                Query.equal('$id', materialIds)
            ]
        );

        if (!materials || materials.length !== materialIds.length) {
            return { error: 'Some materials not found or unauthorized' };
        }

        // Update all materials
        await Promise.all(materialIds.map(id => 
            databases.updateDocument(
                DATABASE_ID,
                MATERIALS_COLLECTION_ID,
                id,
                { 
                    folder_id: folderId,
                    updated_at: new Date().toISOString()
                }
            )
        ));

        revalidatePath('/materials');
        return { success: true, count: materialIds.length };
    } catch (e) {
        console.error('Failed to move materials:', e);
        return { error: 'Failed to move materials' };
    }
}
