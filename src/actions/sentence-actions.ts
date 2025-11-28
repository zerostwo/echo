'use server';

import { auth } from '@/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { queryDictionary } from './vocab-actions';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';

type SentenceUpdatePayload = {
    content: string;
    startTime: number;
    endTime: number;
    order?: number;
    restoreOriginal?: boolean;
};

function tokenize(content: string) {
    return content
        .toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'\\[\]|<>@]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 1 && !/^\d+$/.test(w));
}

async function cleanupOrphanWords(client: typeof supabase, wordIds: string[]) {
    const unique = Array.from(new Set(wordIds));
    for (const wordId of unique) {
        const { count } = await client
            .from('word_occurrences')
            .select('id', { count: 'exact', head: true })
            .eq('word_id', wordId);

        if ((count ?? 0) === 0) {
            await client
                .from('words')
                .update({ deleted_at: new Date().toISOString() })
                .eq('id', wordId)
                .is('deleted_at', null);
        }
    }
}

async function upsertWordsForTokens(client: typeof supabase, userId: string, rawWords: string[]) {
    const rawWordList = Array.from(new Set(rawWords));
    if (rawWordList.length === 0) return new Map<string, string>();

    const dictResults = await queryDictionary(rawWordList);
    const rawToWordId = new Map<string, string>();
    const lemmaCache = new Map<string, string>(); // lemma -> wordId

    for (const raw of rawWordList) {
        const data = dictResults?.[raw];
        // Fallback to raw token if dictionary lookup fails so we still track vocab
        const lemma = data?.word || raw;
        const lemmaKey = lemma.toLowerCase();

        if (!lemmaCache.has(lemmaKey)) {
            const wordData = {
                id: randomUUID(),
                text: lemma,
                phonetic: data?.phonetic,
                translation: data?.translation,
                pos: data?.pos,
                definition: data?.definition,
                collins: data?.collins ? Number(data.collins) : null,
                oxford: data?.oxford ? Number(data.oxford) : null,
                tag: data?.tag,
                bnc: data?.bnc ? Number(data.bnc) : null,
                frq: data?.frq ? Number(data.frq) : null,
                exchange: data?.exchange,
                audio: data?.audio,
                detail: data?.detail ? JSON.stringify(data.detail) : null,
                deleted_at: null,
            };

            const { data: word } = await client
                .from('words')
                .upsert(wordData, { onConflict: 'text' })
                .select('id')
                .single();

            if (word?.id) {
                lemmaCache.set(lemmaKey, word.id);
                await client
                    .from('user_word_statuses')
                    .upsert(
                        {
                            id: randomUUID(),
                            user_id: userId,
                            word_id: word.id,
                            status: 'NEW',
                        },
                        { onConflict: 'user_id, word_id', ignoreDuplicates: true }
                    );
            }
        }

        const wordId = lemmaCache.get(lemmaKey);
        if (wordId) rawToWordId.set(raw, wordId);
    }

    return rawToWordId;
}

export async function updateSentence(sentenceId: string, payload: SentenceUpdatePayload) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;
    if (!supabaseAdmin) {
        console.warn('updateSentence: SUPABASE_SERVICE_ROLE_KEY missing, falling back to RLS client which may block updates.');
    }

    const { data: sentence, error } = await client
        .from('sentences')
        .select('id, content, edited_content, deleted_at, start_time, end_time, order, material_id')
        .eq('id', sentenceId)
        .single();

    if (error || !sentence) {
        return { error: 'Sentence not found' };
    }

    if (sentence.deleted_at) {
        return { error: 'Sentence is in trash. Restore it before editing.' };
    }

    const { data: material } = await client
        .from('materials')
        .select('id, user_id')
        .eq('id', sentence.material_id)
        .single();

    if (!material || material.user_id !== session.user.id) {
        return { error: 'Unauthorized' };
    }

    const safeStart = Number.isFinite(payload.startTime) ? Math.max(0, payload.startTime) : sentence.start_time;
    const safeEnd = Number.isFinite(payload.endTime) ? Math.max(0, payload.endTime) : sentence.end_time;
    const endTime = safeEnd >= safeStart ? safeEnd : safeStart;

    const trimmedContent = typeof payload.content === 'string' ? payload.content.trim() : undefined;
    if (trimmedContent !== undefined && trimmedContent.length === 0 && !payload.restoreOriginal) {
        return { error: 'Content cannot be empty' };
    }

    const editedContent = payload.restoreOriginal
        ? null
        : trimmedContent !== undefined
            ? (trimmedContent === sentence.content ? null : trimmedContent)
            : (sentence.edited_content ?? null);

    const effectiveContent = editedContent ?? sentence.content;

    const { error: updateError, data: updated } = await client
        .from('sentences')
        .update({
            edited_content: editedContent,
            start_time: safeStart,
            end_time: endTime,
            order: payload.order ?? sentence.order,
            updated_at: new Date().toISOString(),
        })
        .eq('id', sentenceId)
        .select('id, content, edited_content, start_time, end_time, order, material_id, updated_at')
        .single();

    if (updateError || !updated) {
        console.error('Failed to update sentence', updateError);
        return { error: 'Failed to update sentence' };
    }

    const { data: existingOccurrences } = await client
        .from('word_occurrences')
        .select('word_id')
        .eq('sentence_id', sentenceId);
    const oldWordIds = existingOccurrences?.map((o: any) => o.word_id) || [];

    const { error: deleteError } = await client.from('word_occurrences').delete().eq('sentence_id', sentenceId);
    if (deleteError) {
        console.error('Failed to delete old occurrences', deleteError);
        return { error: 'Failed to update vocabulary for sentence' };
    }

    const tokens = tokenize(effectiveContent);
    const rawToWordId = await upsertWordsForTokens(client, session.user.id, tokens);

    const occurrences = tokens
        .map((raw) => {
            const wordId = rawToWordId.get(raw);
            if (!wordId) return null;
            return { id: randomUUID(), word_id: wordId, sentence_id: sentenceId };
        })
        .filter(Boolean) as { id: string; word_id: string; sentence_id: string }[];

    if (occurrences.length > 0) {
        const { error: occError } = await client.from('word_occurrences').insert(occurrences);
        if (occError) {
            console.error('Failed to insert occurrences', occError);
            return { error: 'Failed to update vocabulary for sentence' };
        }
    }

    const newWordIds = Array.from(new Set(occurrences.map((o) => o.word_id)));
    const removedWordIds = oldWordIds.filter((id) => !newWordIds.includes(id));
    if (removedWordIds.length > 0) {
        await cleanupOrphanWords(client, removedWordIds);
    }

    revalidatePath('/materials');
    revalidatePath(`/materials/${sentence.material_id}`);
    revalidatePath(`/listening/${sentenceId}`);
    revalidatePath('/vocab');
    revalidatePath('/vocab');

    return {
        success: true,
        sentence: {
            ...updated,
            content: effectiveContent,
            original_content: sentence.content,
            edited_content: editedContent,
            startTime: updated.start_time,
            endTime: updated.end_time,
        },
    };
}

export async function restoreSentenceContent(sentenceId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    const { data: sentence } = await client
        .from('sentences')
        .select('id, content, start_time, end_time, order, deleted_at, material_id')
        .eq('id', sentenceId)
        .single();

    if (!sentence) return { error: 'Sentence not found' };
    if (sentence.deleted_at) return { error: 'Sentence is in trash. Restore it first.' };

    return updateSentence(sentenceId, {
        content: sentence.content,
        startTime: sentence.start_time,
        endTime: sentence.end_time,
        order: sentence.order,
        restoreOriginal: true,
    });
}

export async function deleteSentence(sentenceId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    const { data: sentence, error } = await client
        .from('sentences')
        .select('id, material_id, deleted_at')
        .eq('id', sentenceId)
        .single();

    if (error || !sentence) {
        return { error: 'Sentence not found' };
    }

    const { data: material } = await client
        .from('materials')
        .select('id, user_id')
        .eq('id', sentence.material_id)
        .single();

    if (!material || material.user_id !== session.user.id) {
        return { error: 'Unauthorized' };
    }

    if (sentence.deleted_at) {
        return { error: 'Sentence already in trash' };
    }

    const { error: softDeleteError } = await client
        .from('sentences')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', sentenceId);

    if (softDeleteError) {
        console.error('Failed to move sentence to trash', softDeleteError);
        return { error: 'Failed to delete sentence' };
    }

    revalidatePath('/materials');
    revalidatePath(`/materials/${sentence.material_id}`);
    revalidatePath(`/listening/${sentenceId}`);
    revalidatePath('/trash');

    return { success: true };
}

export async function restoreSentence(sentenceId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    const { data: sentence, error } = await client
        .from('sentences')
        .select('id, material_id, deleted_at')
        .eq('id', sentenceId)
        .single();

    if (error || !sentence) return { error: 'Sentence not found' };

    const { data: material } = await client
        .from('materials')
        .select('id, user_id')
        .eq('id', sentence.material_id)
        .single();

    if (!material || material.user_id !== session.user.id) return { error: 'Unauthorized' };

    if (!sentence.deleted_at) {
        return { success: true };
    }

    const { error: restoreError } = await client
        .from('sentences')
        .update({ deleted_at: null })
        .eq('id', sentenceId);

    if (restoreError) {
        console.error('Failed to restore sentence', restoreError);
        return { error: 'Failed to restore sentence' };
    }

    revalidatePath('/materials');
    revalidatePath(`/materials/${sentence.material_id}`);
    revalidatePath(`/listening/${sentenceId}`);
    revalidatePath('/trash');

    return { success: true };
}

export async function permanentlyDeleteSentence(sentenceId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    const { data: sentence, error } = await client
        .from('sentences')
        .select('id, material_id')
        .eq('id', sentenceId)
        .single();

    if (error || !sentence) {
        return { error: 'Sentence not found' };
    }

    const { data: material } = await client
        .from('materials')
        .select('id, user_id')
        .eq('id', sentence.material_id)
        .single();

    if (!material || material.user_id !== session.user.id) {
        return { error: 'Unauthorized' };
    }

    const { data: existingOccurrences } = await client
        .from('word_occurrences')
        .select('word_id')
        .eq('sentence_id', sentenceId);
    const oldWordIds = existingOccurrences?.map((o: any) => o.word_id) || [];

    await client.from('word_occurrences').delete().eq('sentence_id', sentenceId);
    await client.from('practice_progress').delete().eq('sentence_id', sentenceId);

    const { error: deleteError } = await client.from('sentences').delete().eq('id', sentenceId);

    if (deleteError) {
        console.error('Failed to delete sentence', deleteError);
        return { error: 'Failed to delete sentence' };
    }

    if (oldWordIds.length > 0) {
        await cleanupOrphanWords(client, oldWordIds);
    }

    revalidatePath('/materials');
    revalidatePath(`/materials/${sentence.material_id}`);
    revalidatePath(`/listening/${sentenceId}`);
    revalidatePath('/trash');

    return { success: true };
}
