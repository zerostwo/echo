'use server';

import { auth } from '@/auth';
import { getAdminClient } from '@/lib/appwrite';
import { 
    DATABASE_ID, 
    MATERIALS_COLLECTION_ID, 
    SENTENCES_COLLECTION_ID, 
    WORDS_COLLECTION_ID, 
    USER_WORD_STATUSES_COLLECTION_ID,
    DICTIONARIES_COLLECTION_ID,
    FOLDERS_COLLECTION_ID
} from '@/lib/appwrite_client';
import { Query } from 'node-appwrite';
import { permanentlyDeleteMaterial, restoreMaterial } from './material-actions';
import { permanentlyDeleteSentence, restoreSentence } from './sentence-actions';
import { permanentlyDeleteWord, restoreWord } from './word-actions';
import { permanentlyDeleteDictionary, restoreDictionary } from './dictionary-actions';
import { revalidatePath } from 'next/cache';

export interface TrashItem {
    id: string;
    type: 'material' | 'dictionary' | 'sentence' | 'word';
    title: string;
    deleted_at: string;
    size: string | null;
    location: string | null;
}

export interface PaginatedTrashResult {
    data: TrashItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export async function getTrashItemsPaginated(
    page: number = 1,
    pageSize: number = 10,
    search: string = '',
    sortBy: string = 'deleted_at',
    sortOrder: 'asc' | 'desc' = 'desc'
): Promise<PaginatedTrashResult | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const userId = session.user.id;
    const { databases } = await getAdminClient();

    try {
        // 1. Fetch Deleted Materials
        const materialQueries = [
            Query.equal('user_id', userId),
            Query.isNotNull('deleted_at'),
            Query.limit(100)
        ];
        if (search) materialQueries.push(Query.search('title', search));

        const { documents: materials } = await databases.listDocuments(
            DATABASE_ID,
            MATERIALS_COLLECTION_ID,
            materialQueries
        );

        // 2. Fetch Deleted Dictionaries
        const dictQueries = [
            Query.equal('user_id', userId),
            Query.isNotNull('deleted_at'),
            Query.limit(100)
        ];
        if (search) dictQueries.push(Query.search('name', search));

        const { documents: dictionaries } = await databases.listDocuments(
            DATABASE_ID,
            DICTIONARIES_COLLECTION_ID,
            dictQueries
        );

        // 3. Fetch Deleted Sentences
        const sentenceQueries = [
            Query.isNotNull('deleted_at'),
            Query.limit(100)
        ];
        if (search) sentenceQueries.push(Query.search('content', search));

        const { documents: sentences } = await databases.listDocuments(
            DATABASE_ID,
            SENTENCES_COLLECTION_ID,
            sentenceQueries
        );
        
        // Filter sentences by ownership
        const materialIds = Array.from(new Set(sentences.map(s => s.material_id)));
        const validMaterialIds = new Set<string>();
        
        if (materialIds.length > 0) {
            // Check which materials belong to user
            // We can't use Query.equal('$id', materialIds) if list is huge, but for 100 sentences it's fine.
            const { documents: userMaterials } = await databases.listDocuments(
                DATABASE_ID,
                MATERIALS_COLLECTION_ID,
                [
                    Query.equal('$id', Array.from(materialIds)),
                    Query.equal('user_id', userId)
                ]
            );
            userMaterials.forEach(m => validMaterialIds.add(m.$id));
        }
        
        const validSentences = sentences.filter(s => validMaterialIds.has(s.material_id));

        // 4. Fetch Deleted Words
        const wordQueries = [
            Query.isNotNull('deleted_at'),
            Query.limit(100)
        ];
        if (search) wordQueries.push(Query.search('text', search));

        const { documents: words } = await databases.listDocuments(
            DATABASE_ID,
            WORDS_COLLECTION_ID,
            wordQueries
        );

        const wordIds = words.map(w => w.$id);
        const validWordIds = new Set<string>();

        if (wordIds.length > 0) {
            const { documents: statuses } = await databases.listDocuments(
                DATABASE_ID,
                USER_WORD_STATUSES_COLLECTION_ID,
                [
                    Query.equal('user_id', userId),
                    Query.equal('word_id', wordIds)
                ]
            );
            statuses.forEach(s => validWordIds.add(s.word_id));
        }

        const validWords = words.filter(w => validWordIds.has(w.$id));

        // Combine
        const allItems: TrashItem[] = [
            ...materials.map(m => ({
                id: m.$id,
                type: 'material' as const,
                title: m.title,
                deleted_at: m.deleted_at,
                size: m.size ? String(m.size) : null,
                location: 'Root' // Simplified
            })),
            ...dictionaries.map(d => ({
                id: d.$id,
                type: 'dictionary' as const,
                title: d.name,
                deleted_at: d.deleted_at,
                size: null,
                location: 'Dictionaries'
            })),
            ...validSentences.map(s => ({
                id: s.$id,
                type: 'sentence' as const,
                title: s.edited_content || s.content,
                deleted_at: s.deleted_at,
                size: null,
                location: 'Material'
            })),
            ...validWords.map(w => ({
                id: w.$id,
                type: 'word' as const,
                title: w.text,
                deleted_at: w.deleted_at,
                size: null,
                location: w.translation || 'Vocabulary'
            }))
        ];

        // Sort
        allItems.sort((a, b) => {
            const dateA = new Date(a.deleted_at).getTime();
            const dateB = new Date(b.deleted_at).getTime();
            
            if (sortBy === 'title') {
                return sortOrder === 'asc' 
                    ? a.title.localeCompare(b.title) 
                    : b.title.localeCompare(a.title);
            }
            
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });

        // Paginate in memory
        const total = allItems.length;
        const offset = (page - 1) * pageSize;
        const paginatedItems = allItems.slice(offset, offset + pageSize);

        return {
            data: paginatedItems,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };

    } catch (error) {
        console.error("Failed to fetch trash items:", error);
        return { error: "Failed to fetch trash items" };
    }
}

export async function restoreItem(id: string, type: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        switch (type) {
            case 'material':
                return await restoreMaterial(id);
            case 'dictionary':
                return await restoreDictionary(id);
            case 'sentence':
                return await restoreSentence(id);
            case 'word':
                return await restoreWord(id);
            default:
                return { error: 'Unknown item type' };
        }
    } catch (e) {
        console.error("Restore error:", e);
        return { error: 'Failed to restore item' };
    }
}

export async function permanentlyDeleteItem(id: string, type: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        switch (type) {
            case 'material':
                return await permanentlyDeleteMaterial(id);
            case 'dictionary':
                return await permanentlyDeleteDictionary(id);
            case 'sentence':
                return await permanentlyDeleteSentence(id);
            case 'word':
                return await permanentlyDeleteWord(id);
            default:
                return { error: 'Unknown item type' };
        }
    } catch (e) {
        console.error("Delete error:", e);
        return { error: 'Failed to delete item' };
    }
}

export async function getTrashItems() {
    // Legacy function, keeping for compatibility if needed, but redirecting to paginated
    const result = await getTrashItemsPaginated(1, 1000);
    if ('error' in result) return { items: [] };
    return { items: result.data };
}

export async function emptyTrash() {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        // Get all trash items (up to a limit)
        const result = await getTrashItemsPaginated(1, 1000);
        if ('error' in result) throw new Error(result.error);

        const items = result.data;

        for (const item of items) {
            await permanentlyDeleteItem(item.id, item.type);
        }

        revalidatePath('/trash');
        revalidatePath('/materials');
        revalidatePath('/words');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to empty trash' };
    }
}
