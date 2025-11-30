'use server';

import { auth } from '@/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { invalidateVocabCache } from '@/lib/redis';

export async function getWordContext(wordId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    const { data: wordMeta } = await client
        .from('words')
        .select('deleted_at')
        .eq('id', wordId)
        .single();

    if (!wordMeta || wordMeta.deleted_at) {
        return { occurrences: [] };
    }

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
        .is('sentence.deleted_at', null)
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
        // Check if status exists
        const { data: existing } = await client
            .from('user_word_statuses')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('word_id', wordId)
            .single();

        if (existing) {
            // Update existing
            const { error } = await client
                .from('user_word_statuses')
                .update({
                    status: status,
                    updated_at: new Date().toISOString()
                })
                .eq('id', existing.id);
            if (error) throw error;
        } else {
            // Insert new with generated id
            const { error } = await client
                .from('user_word_statuses')
                .insert({
                    id: crypto.randomUUID(),
                    user_id: session.user.id,
                    word_id: wordId,
                    status: status,
                    updated_at: new Date().toISOString()
                });
            if (error) throw error;
        }

        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: 'Failed to update status' };
    }
}

export async function updateWordsStatus(wordIds: string[], status: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    try {
        // Get existing statuses for these words
        const { data: existingStatuses } = await client
            .from('user_word_statuses')
            .select('id, word_id')
            .eq('user_id', session.user.id)
            .in('word_id', wordIds);

        const existingMap = new Map(existingStatuses?.map(s => [s.word_id, s.id]) || []);

        // Separate into updates and inserts
        const toUpdate: string[] = [];
        const toInsert: { id: string; user_id: string; word_id: string; status: string; updated_at: string }[] = [];

        for (const wordId of wordIds) {
            if (existingMap.has(wordId)) {
                toUpdate.push(existingMap.get(wordId)!);
            } else {
                toInsert.push({
                    id: crypto.randomUUID(),
                    user_id: session.user.id,
                    word_id: wordId,
                    status: status,
                    updated_at: new Date().toISOString()
                });
            }
        }

        // Update existing records
        if (toUpdate.length > 0) {
            const { error: updateError } = await client
                .from('user_word_statuses')
                .update({
                    status: status,
                    updated_at: new Date().toISOString()
                })
                .in('id', toUpdate);
            if (updateError) throw updateError;
        }

        // Insert new records
        if (toInsert.length > 0) {
            const { error: insertError } = await client
                .from('user_word_statuses')
                .insert(toInsert);
            if (insertError) throw insertError;
        }

        // Invalidate vocab cache
        await invalidateVocabCache(session.user.id);

        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: 'Failed to update statuses' };
    }
}

export async function restoreWord(wordId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    const { data: word } = await client
        .from('words')
        .select('deleted_at')
        .eq('id', wordId)
        .single();

    if (!word) return { error: 'Word not found' };
    if (!word.deleted_at) return { error: 'Word is not in trash' };
    if (!word.deleted_at) return { success: true };

    const { count } = await client
        .from('user_word_statuses')
        .select('id', { count: 'exact', head: true })
        .eq('word_id', wordId)
        .eq('user_id', session.user.id);

    if ((count ?? 0) === 0) return { error: 'Word not found' };

    const { error } = await client
        .from('words')
        .update({ deleted_at: null })
        .eq('id', wordId);

    if (error) return { error: 'Failed to restore word' };

    // Invalidate vocab cache
    await invalidateVocabCache(session.user.id);

    revalidatePath('/trash');
    revalidatePath('/vocab');
    return { success: true };
}

export async function permanentlyDeleteWord(wordId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    const { data: word } = await client
        .from('words')
        .select('deleted_at')
        .eq('id', wordId)
        .single();

    if (!word) return { error: 'Word not found' };

    const { count } = await client
        .from('user_word_statuses')
        .select('id', { count: 'exact', head: true })
        .eq('word_id', wordId)
        .eq('user_id', session.user.id);

    if ((count ?? 0) === 0) return { error: 'Word not found in your trash' };

    await client.from('word_occurrences').delete().eq('word_id', wordId);
    await client.from('user_word_statuses').delete().eq('word_id', wordId).eq('user_id', session.user.id);

    const { error } = await client.from('words').delete().eq('id', wordId);
    if (error) {
        console.error('Failed to delete word', error);
        return { error: 'Failed to delete word' };
    }

    // Invalidate vocab cache
    await invalidateVocabCache(session.user.id);

    revalidatePath('/trash');
    revalidatePath('/vocab');
    return { success: true };
}

// Soft delete multiple words (move to trash)
export async function deleteWords(wordIds: string[]) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    try {
        // First verify user has access to these words
        const { data: userStatuses, error: checkError } = await client
            .from('user_word_statuses')
            .select('word_id')
            .eq('user_id', session.user.id)
            .in('word_id', wordIds);

        if (checkError) throw checkError;

        const validWordIds = userStatuses?.map(s => s.word_id) || [];
        
        if (validWordIds.length === 0) {
            return { error: 'No valid words to delete' };
        }

        // Soft delete words by setting deleted_at
        const { error: deleteError } = await client
            .from('words')
            .update({ deleted_at: new Date().toISOString() })
            .in('id', validWordIds);

        if (deleteError) throw deleteError;

        // Invalidate vocab cache
        await invalidateVocabCache(session.user.id);

        revalidatePath('/vocab');
        revalidatePath('/trash');

        return { success: true, count: validWordIds.length };
    } catch (e) {
        console.error('Failed to delete words:', e);
        return { error: 'Failed to delete words' };
    }
}
