'use server';

import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';

export async function getWordContext(wordId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    // Fetch occurrences and related sentences
    // We also want to know which material the sentence belongs to
    // Using !inner to filter by material.userId
    const { data: occurrences, error } = await supabase
        .from('WordOccurrence')
        .select(`
            *,
            sentence:Sentence!inner(
                *,
                material:Material!inner(
                    id,
                    title,
                    userId
                )
            )
        `)
        .eq('wordId', wordId)
        .eq('sentence.material.userId', session.user.id)
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

    try {
        const { error } = await supabase
            .from('UserWordStatus')
            .upsert({
                userId: session.user.id,
                wordId: wordId,
                status: status,
                updatedAt: new Date().toISOString()
            }, { onConflict: 'userId, wordId' });

        if (error) throw error;
        return { success: true };
    } catch (e) {
        return { error: 'Failed to update status' };
    }
}

export async function updateWordsStatus(wordIds: string[], status: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        const updates = wordIds.map(wordId => ({
            userId: session.user.id,
            wordId: wordId,
            status: status,
            updatedAt: new Date().toISOString()
        }));

        const { error } = await supabase
            .from('UserWordStatus')
            .upsert(updates, { onConflict: 'userId, wordId' });

        if (error) throw error;
        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: 'Failed to update statuses' };
    }
}
