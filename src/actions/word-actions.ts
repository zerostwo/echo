'use server';

import { auth } from '@/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function getWordContext(wordId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    // Fetch occurrences and related sentences
    // We also want to know which material the sentence belongs to
    // Using !inner to filter by material.userId
    const { data: occurrences, error } = await client
        .from('word_occurrences')
        .select(`
            *,
            sentence:sentences!inner(
                *,
                material:materials!inner(
                    id,
                    title,
                    user_id
                )
            )
        `)
        .eq('word_id', wordId)
        .eq('sentence.material.user_id', session.user.id)
        .limit(10);

    if (error) {
        console.error("Error fetching word context:", error);
        return { occurrences: [] };
    }

    return { occurrences };
}

export async function updateWordStatus(wordId: string, status: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    try {
        const { error } = await client
            .from('user_word_statuses')
            .upsert({
                user_id: session.user.id,
                word_id: wordId,
                status: status,
                updated_at: new Date().toISOString()
            }, { onConflict: 'user_id, word_id' });

        if (error) throw error;
        return { success: true };
    } catch (e) {
        return { error: 'Failed to update status' };
    }
}

export async function updateWordsStatus(wordIds: string[], status: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    try {
        const updates = wordIds.map(wordId => ({
            user_id: session.user.id,
            word_id: wordId,
            status: status,
            updated_at: new Date().toISOString()
        }));

        const { error } = await client
            .from('user_word_statuses')
            .upsert(updates, { onConflict: 'user_id, word_id' });

        if (error) throw error;
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: 'Failed to update statuses' };
    }
}
