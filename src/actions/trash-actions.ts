'use server';

import { auth } from '@/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { permanentlyDeleteMaterial } from './material-actions';
import { permanentlyDeleteSentence } from './sentence-actions';
import { permanentlyDeleteWord } from './word-actions';
import { permanentlyDeleteDictionary } from './dictionary-actions';
import { revalidatePath } from 'next/cache';

export async function getTrashItems() {
    const session = await auth();
    if (!session?.user?.id) return { items: [] };

    const client = supabaseAdmin || supabase;

    const { data: materials } = await client
        .from('materials')
        .select('*, folder:folders(name)')
        .eq('user_id', session.user.id)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

    const { data: sentences } = await client
        .from('sentences')
        .select('id, content, edited_content, deleted_at, material:materials!inner(id, title, user_id)')
        .not('deleted_at', 'is', null)
        .eq('material.user_id', session.user.id)
        .order('deleted_at', { ascending: false });

    const { data: wordStatuses } = await client
        .from('user_word_statuses')
        .select('word_id, word:words(id, text, translation, deleted_at)')
        .eq('user_id', session.user.id);

    const { data: dictionaries } = await client
        .from('dictionaries')
        .select('id, name, deleted_at')
        .eq('user_id', session.user.id)
        .not('deleted_at', 'is', null)
        .order('deleted_at', { ascending: false });

    const items = [
        ...(materials || []).map((m: any) => ({
            id: m.id,
            type: 'material' as const,
            title: m.title,
            deleted_at: m.deleted_at,
            size: m.size,
            location: m.folder?.name || 'Root'
        })),
        ...(dictionaries || []).map((d: any) => ({
            id: d.id,
            type: 'dictionary' as const,
            title: d.name,
            deleted_at: d.deleted_at,
            size: null,
            location: 'Dictionaries'
        })),
        ...(sentences || []).map((s: any) => ({
            id: s.id,
            type: 'sentence' as const,
            title: s.edited_content ?? s.content,
            deleted_at: s.deleted_at,
            size: null,
            location: s.material?.title || 'Unknown material'
        })),
        ...(wordStatuses || [])
            .filter((ws: any) => ws.word?.deleted_at)
            .reduce((acc: any[], ws: any) => {
                const word = ws.word;
                if (!word) return acc;
                if (acc.find((i) => i.id === word.id)) return acc;
                acc.push({
                    id: word.id,
                    type: 'word' as const,
                    title: word.text,
                    deleted_at: word.deleted_at,
                    size: null,
                    location: word.translation ? `Translation: ${word.translation}` : 'Vocabulary'
                });
                return acc;
            }, [])
    ];

    items.sort((a, b) => {
        const aTime = a.deleted_at ? new Date(a.deleted_at).getTime() : 0;
        const bTime = b.deleted_at ? new Date(b.deleted_at).getTime() : 0;
        return bTime - aTime;
    });

    return { items };
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
        revalidatePath('/vocab');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to empty trash' };
    }
}
