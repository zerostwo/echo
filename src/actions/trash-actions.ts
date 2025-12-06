'use server';

import { auth } from '@/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { prisma } from '@/lib/prisma';
import { permanentlyDeleteMaterial, restoreMaterial } from './material-actions';
import { permanentlyDeleteSentence } from './sentence-actions';
import { permanentlyDeleteWord } from './word-actions';
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
    const offset = (page - 1) * pageSize;
    const searchPattern = search ? `%${search}%` : '%';

    try {
        // We use a raw query to UNION all trash items and paginate them efficiently
        // Note: Prisma raw queries return dates as strings or Date objects depending on driver, usually Date objects.
        // We cast to text to be safe or handle Date objects.
        
        const items: any[] = await prisma.$queryRaw`
            SELECT * FROM (
                -- Materials
                SELECT 
                    m.id, 
                    m.title, 
                    'material' as type, 
                    m.deleted_at, 
                    m.size::text as size, 
                    COALESCE(f.name, 'Root') as location 
                FROM materials m
                LEFT JOIN folders f ON m.folder_id = f.id
                WHERE m.user_id = ${userId} AND m.deleted_at IS NOT NULL AND m.title ILIKE ${searchPattern}

                UNION ALL

                -- Dictionaries
                SELECT 
                    id, 
                    name as title, 
                    'dictionary' as type, 
                    deleted_at, 
                    NULL as size, 
                    'Dictionaries' as location 
                FROM dictionaries 
                WHERE user_id = ${userId} AND deleted_at IS NOT NULL AND name ILIKE ${searchPattern}

                UNION ALL

                -- Sentences
                SELECT 
                    s.id, 
                    COALESCE(s.edited_content, s.content) as title, 
                    'sentence' as type, 
                    s.deleted_at, 
                    NULL as size, 
                    m.title as location 
                FROM sentences s 
                JOIN materials m ON s.material_id = m.id 
                WHERE m.user_id = ${userId} AND s.deleted_at IS NOT NULL AND COALESCE(s.edited_content, s.content) ILIKE ${searchPattern}

                UNION ALL

                -- Words
                SELECT 
                    w.id, 
                    w.text as title, 
                    'word' as type, 
                    w.deleted_at, 
                    NULL as size, 
                    COALESCE(w.translation, 'Vocabulary') as location 
                FROM words w 
                JOIN user_word_statuses uws ON w.id = uws.word_id 
                WHERE uws.user_id = ${userId} AND w.deleted_at IS NOT NULL AND w.text ILIKE ${searchPattern}
            ) as all_items
            ORDER BY 
                CASE WHEN ${sortOrder} = 'asc' THEN 
                    CASE WHEN ${sortBy} = 'title' THEN title END
                END ASC,
                CASE WHEN ${sortOrder} = 'desc' THEN 
                    CASE WHEN ${sortBy} = 'title' THEN title END
                END DESC,
                CASE WHEN ${sortOrder} = 'asc' THEN 
                    CASE WHEN ${sortBy} = 'deleted_at' THEN deleted_at END
                END ASC,
                CASE WHEN ${sortOrder} = 'desc' THEN 
                    CASE WHEN ${sortBy} = 'deleted_at' THEN deleted_at END
                END DESC
            LIMIT ${pageSize} OFFSET ${offset}
        `;

        // Get total count for pagination
        const countResult: any[] = await prisma.$queryRaw`
            SELECT COUNT(*)::int as total FROM (
                SELECT m.id FROM materials m WHERE m.user_id = ${userId} AND m.deleted_at IS NOT NULL AND m.title ILIKE ${searchPattern}
                UNION ALL
                SELECT d.id FROM dictionaries d WHERE d.user_id = ${userId} AND d.deleted_at IS NOT NULL AND d.name ILIKE ${searchPattern}
                UNION ALL
                SELECT s.id FROM sentences s JOIN materials m ON s.material_id = m.id WHERE m.user_id = ${userId} AND s.deleted_at IS NOT NULL AND COALESCE(s.edited_content, s.content) ILIKE ${searchPattern}
                UNION ALL
                SELECT w.id FROM words w JOIN user_word_statuses uws ON w.id = uws.word_id WHERE uws.user_id = ${userId} AND w.deleted_at IS NOT NULL AND w.text ILIKE ${searchPattern}
            ) as all_items
        `;

        const total = countResult[0]?.total || 0;

        return {
            data: items.map(item => ({
                ...item,
                deleted_at: item.deleted_at.toISOString(), // Ensure ISO string
            })),
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
                // Need to implement restoreSentence in sentence-actions
                // For now, direct DB update
                await prisma.sentence.update({
                    where: { id },
                    data: { deletedAt: null }
                });
                revalidatePath('/trash');
                return { success: true };
            case 'word':
                // Need to implement restoreWord in word-actions
                // For now, direct DB update
                await prisma.word.update({
                    where: { id },
                    data: { deletedAt: null }
                });
                revalidatePath('/trash');
                return { success: true };
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
        const client = supabaseAdmin || supabase;

        const { data: materials } = await client
            .from('materials')
            .select('id')
            .eq('user_id', session.user.id)
            .not('deleted_at', 'is', null);

        const { data: sentences } = await client
            .from('sentences')
            .select('id, material:materials!inner(user_id)')
            .not('deleted_at', 'is', null)
            .eq('material.user_id', session.user.id);

        const { data: trashedWords } = await client
            .from('user_word_statuses')
            .select('word_id, word:words(id, deleted_at)')
            .eq('user_id', session.user.id);

        const { data: dictionaries } = await client
            .from('dictionaries')
            .select('id')
            .eq('user_id', session.user.id)
            .not('deleted_at', 'is', null);

        if (materials) {
            for (const m of materials) {
                await permanentlyDeleteMaterial(m.id);
            }
        }

        if (dictionaries) {
            for (const d of dictionaries) {
                await permanentlyDeleteDictionary(d.id);
            }
        }

        if (sentences) {
            for (const s of sentences) {
                await permanentlyDeleteSentence(s.id);
            }
        }

        if (trashedWords) {
            const wordIds = Array.from(
                new Set(
                    trashedWords
                        .filter((w: any) => w.word?.deleted_at)
                        .map((w: any) => w.word_id)
                )
            );
            for (const wordId of wordIds) {
                await permanentlyDeleteWord(wordId);
            }
        }
        
        const { error: folderError } = await supabase
            .from('folders')
            .delete()
            .eq('user_id', session.user.id)
            .not('deleted_at', 'is', null);

        if (folderError) throw folderError;

        revalidatePath('/trash');
        revalidatePath('/materials');
        revalidatePath('/words');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to empty trash' };
    }
}
