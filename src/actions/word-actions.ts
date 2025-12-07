'use server';

import { auth } from '@/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { invalidateVocabCache } from '@/lib/redis';
import { queryDictionary } from '@/actions/vocab-actions';

/**
 * Lookup word details by text.
 * First tries to find the word in the database, then falls back to dictionary lookup.
 */
export async function lookupWordByText(wordText: string) {
    if (!wordText || typeof wordText !== 'string') {
        return { error: 'Invalid word text' };
    }

    const normalizedWord = wordText.toLowerCase().trim();
    if (!normalizedWord) {
        return { error: 'Empty word text' };
    }

    const client = supabaseAdmin || supabase;

    // Try to find the word in the database first
    const { data: existingWord, error: dbError } = await client
        .from('words')
        .select('*')
        .eq('text', normalizedWord)
        .is('deleted_at', null)
        .single();

    if (existingWord && !dbError) {
        return { word: existingWord };
    }

    // Fall back to dictionary lookup
    try {
        const dictResults = await queryDictionary([normalizedWord]);
        const dictData = dictResults[normalizedWord];

        if (dictData) {
            return {
                word: {
                    id: null, // Not in database
                    text: dictData.word || normalizedWord,
                    phonetic: dictData.phonetic || null,
                    definition: dictData.definition || null,
                    translation: dictData.translation || null,
                    pos: dictData.pos || null,
                    collins: dictData.collins ? Number(dictData.collins) : null,
                    oxford: dictData.oxford ? Number(dictData.oxford) : null,
                    tag: dictData.tag || null,
                    bnc: dictData.bnc ? Number(dictData.bnc) : null,
                    frq: dictData.frq ? Number(dictData.frq) : null,
                    exchange: dictData.exchange || null,
                    audio: dictData.audio || null,
                }
            };
        }

        return { word: null };
    } catch (e) {
        console.error('[lookupWordByText] Dictionary lookup failed:', e);
        return { error: 'Dictionary lookup failed' };
    }
}

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

/**
 * Edit a word - update the word text and refresh dictionary data
 * This directly queries the dictionary for the new word without going through lemma reverse lookup
 * 
 * If the target word already exists, this will merge the two words:
 * - Move all word_occurrences from the old word to the existing word
 * - Delete the old word's user_word_status
 * - Soft delete the old word
 */
export async function editWord(wordId: string, newWordText: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;
    const normalizedWord = newWordText.toLowerCase().trim();

    if (!normalizedWord) {
        return { error: 'Word cannot be empty' };
    }

    try {
        // Check if user has access to this word
        const { data: userStatus, error: checkError } = await client
            .from('user_word_statuses')
            .select('word_id, status')
            .eq('user_id', session.user.id)
            .eq('word_id', wordId)
            .single();

        if (checkError || !userStatus) {
            return { error: 'Word not found or access denied' };
        }

        // Get the current word text
        const { data: currentWord } = await client
            .from('words')
            .select('text')
            .eq('id', wordId)
            .single();

        // If the word text hasn't changed, no need to do anything
        if (currentWord?.text === normalizedWord) {
            return { success: true, word: { id: wordId, text: normalizedWord } };
        }

        // Check if a word with the new text already exists
        const { data: existingWord } = await client
            .from('words')
            .select('id')
            .eq('text', normalizedWord)
            .is('deleted_at', null)
            .neq('id', wordId)
            .single();

        if (existingWord) {
            // Merge: the target word already exists
            // 1. Move all word_occurrences from old word to existing word
            const { error: moveOccurrencesError } = await client
                .from('word_occurrences')
                .update({ word_id: existingWord.id })
                .eq('word_id', wordId);

            if (moveOccurrencesError) {
                console.error('Failed to move word occurrences:', moveOccurrencesError);
                return { error: 'Failed to merge words' };
            }

            // 2. Check if user has status for the existing word
            const { data: existingStatus } = await client
                .from('user_word_statuses')
                .select('id')
                .eq('user_id', session.user.id)
                .eq('word_id', existingWord.id)
                .single();

            if (!existingStatus) {
                // User doesn't have status for existing word, move the status
                const { error: moveStatusError } = await client
                    .from('user_word_statuses')
                    .update({ word_id: existingWord.id })
                    .eq('user_id', session.user.id)
                    .eq('word_id', wordId);

                if (moveStatusError) {
                    console.error('Failed to move word status:', moveStatusError);
                }
            } else {
                // User already has status for existing word, delete the old status
                const { error: deleteStatusError } = await client
                    .from('user_word_statuses')
                    .delete()
                    .eq('user_id', session.user.id)
                    .eq('word_id', wordId);

                if (deleteStatusError) {
                    console.error('Failed to delete old word status:', deleteStatusError);
                }
            }

            // 3. Soft delete the old word (it's now orphaned for this user)
            // Check if any other users have this word
            const { count: otherUsersCount } = await client
                .from('user_word_statuses')
                .select('id', { count: 'exact', head: true })
                .eq('word_id', wordId);

            if ((otherUsersCount ?? 0) === 0) {
                // No other users have this word, soft delete it
                const { error: deleteWordError } = await client
                    .from('words')
                    .update({ deleted_at: new Date().toISOString() })
                    .eq('id', wordId);

                if (deleteWordError) {
                    console.error('Failed to soft delete old word:', deleteWordError);
                }
            }

            // Invalidate vocab cache
            await invalidateVocabCache(session.user.id);

            revalidatePath('/vocab');

            return {
                success: true,
                merged: true,
                word: {
                    id: existingWord.id,
                    text: normalizedWord,
                }
            };
        }

        // No existing word, just update the current word
        // Query dictionary directly for the new word (skip lemma reverse lookup)
        const dictResults = await queryDictionary([normalizedWord]);
        const dictData = dictResults[normalizedWord];

        // Prepare update data
        const updateData: Record<string, any> = {
            text: normalizedWord,
            // updated_at removed as it's not in schema
        };

        // If dictionary data is found, update all word metadata
        if (dictData) {
            updateData.phonetic = dictData.phonetic || null;
            updateData.definition = dictData.definition || null;
            updateData.translation = dictData.translation || null;
            updateData.pos = dictData.pos || null;
            updateData.collins = dictData.collins ? Number(dictData.collins) : null;
            updateData.oxford = dictData.oxford ? Number(dictData.oxford) : null;
            updateData.tag = dictData.tag || null;
            updateData.bnc = dictData.bnc ? Number(dictData.bnc) : null;
            updateData.frq = dictData.frq ? Number(dictData.frq) : null;
            updateData.exchange = dictData.exchange || null;
            updateData.audio = dictData.audio || null;
            updateData.detail = dictData.detail ? JSON.stringify(dictData.detail) : null;
        }

        // Update the word
        const { error: updateError } = await client
            .from('words')
            .update(updateData)
            .eq('id', wordId);

        if (updateError) {
            console.error('Failed to update word:', updateError);
            return { error: 'Failed to update word' };
        }

        // Invalidate vocab cache
        await invalidateVocabCache(session.user.id);

        revalidatePath('/vocab');
        
        return { 
            success: true, 
            word: {
                id: wordId,
                text: normalizedWord,
                ...updateData
            }
        };
    } catch (e) {
        console.error('Failed to edit word:', e);
        return { error: 'Failed to edit word' };
    }
}

/**
 * Update word details (definition, translation, etc.) without changing the word text.
 */
export async function updateWordDetails(wordId: string, updates: { definition?: string; translation?: string }) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    try {
        // Check if user has access to this word
        const { data: userStatus, error: checkError } = await client
            .from('user_word_statuses')
            .select('word_id')
            .eq('user_id', session.user.id)
            .eq('word_id', wordId)
            .single();

        if (checkError || !userStatus) {
            return { error: 'Word not found or access denied' };
        }

        const { error: updateError } = await client
            .from('words')
            .update(updates)
            .eq('id', wordId);

        if (updateError) {
            console.error('Failed to update word details:', updateError);
            return { error: 'Failed to update word details' };
        }

        // Invalidate vocab cache
        await invalidateVocabCache(session.user.id);
        revalidatePath('/vocab');
        
        return { success: true };
    } catch (e) {
        console.error('Failed to update word details:', e);
        return { error: 'Failed to update word details' };
    }
}

export async function addWordRelation(wordId: string, relatedText: string, type: string, dictionaryId?: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;
    const normalizedText = relatedText.toLowerCase().trim();

    if (!normalizedText) return { error: 'Related text cannot be empty' };

    // 1. Check if the related word exists in the database
    let relatedWordId: string | null = null;
    
    const { data: existingWord } = await client
        .from('words')
        .select('id')
        .eq('text', normalizedText)
        .is('deleted_at', null)
        .single();

    if (existingWord) {
        relatedWordId = existingWord.id;
    } else {
        // 2. If not exists, create it
        // Query dictionary first to get metadata
        const dictResults = await queryDictionary([normalizedText]);
        const dictData = dictResults[normalizedText];
        
        const newWordData: any = {
            id: crypto.randomUUID(),
            text: normalizedText,
            // updated_at removed as it's not in schema
        };
        
        if (dictData) {
            newWordData.phonetic = dictData.phonetic || null;
            newWordData.definition = dictData.definition || null;
            newWordData.translation = dictData.translation || null;
            newWordData.pos = dictData.pos || null;
            newWordData.collins = dictData.collins ? Number(dictData.collins) : null;
            newWordData.oxford = dictData.oxford ? Number(dictData.oxford) : null;
            newWordData.tag = dictData.tag || null;
            newWordData.bnc = dictData.bnc ? Number(dictData.bnc) : null;
            newWordData.frq = dictData.frq ? Number(dictData.frq) : null;
            newWordData.exchange = dictData.exchange || null;
            newWordData.audio = dictData.audio || null;
            newWordData.detail = dictData.detail ? JSON.stringify(dictData.detail) : null;
        }
        
        const { data: newWord, error: createError } = await client
            .from('words')
            .insert(newWordData)
            .select('id')
            .single();
            
        if (createError) {
            console.error('Failed to create related word:', createError);
            // Try to find it again in case of race condition
            const { data: retryWord } = await client
                .from('words')
                .select('id')
                .eq('text', normalizedText)
                .single();
            if (retryWord) relatedWordId = retryWord.id;
            else return { error: 'Failed to create related word' };
        } else {
            relatedWordId = newWord.id;
        }
    }

    if (!relatedWordId) return { error: 'Failed to resolve related word' };

    // 3. Ensure the user has the RELATED word in their list (UserWordStatus)
    // This addresses "change should be added to my word list"
    const { data: existingStatus } = await client
        .from('user_word_statuses')
        .select('id')
        .eq('user_id', session.user.id)
        .eq('word_id', relatedWordId)
        .single();
        
    if (!existingStatus) {
        await client
            .from('user_word_statuses')
            .insert({
                id: crypto.randomUUID(),
                user_id: session.user.id,
                word_id: relatedWordId,
                status: 'NEW', // Default status
                updated_at: new Date().toISOString()
            });
    }

    // 3.5 Add to dictionary if dictionaryId is provided
    if (dictionaryId) {
        try {
            // Check if already in dictionary
            const { data: existingDictWord } = await client
                .from('dictionary_words')
                .select('word_id')
                .eq('dictionary_id', dictionaryId)
                .eq('word_id', relatedWordId)
                .single();

            if (!existingDictWord) {
                await client
                    .from('dictionary_words')
                    .insert({
                        dictionary_id: dictionaryId,
                        word_id: relatedWordId,
                        added_at: new Date().toISOString()
                    });
            }
        } catch (e) {
            console.error('Failed to add related word to dictionary:', e);
            // Don't fail the whole operation
        }
    }

    // 4. Create the relation (Forward)
    // Check if exists first
    const { data: existingRelation } = await client
        .from('word_relations')
        .select('id')
        .eq('word_id', wordId)
        .eq('related_word_id', relatedWordId)
        .eq('relation_type', type)
        .single();

    if (!existingRelation) {
        const relationData = {
            id: crypto.randomUUID(),
            word_id: wordId,
            relation_type: type,
            custom_text: normalizedText,
            related_word_id: relatedWordId,
        };

        const { error } = await client
            .from('word_relations')
            .insert(relationData);

        if (error) {
            console.error('Failed to add word relation:', error);
            return { error: 'Failed to add word relation' };
        }
    }

    // 5. Create reverse relation (Bidirectional)
    // This addresses "change's relationship should also show adjust"
    if (type === 'SYNONYM' || type === 'ANTONYM') {
        try {
            // Check if reverse relation already exists
            const { data: existingReverse } = await client
                .from('word_relations')
                .select('id')
                .eq('word_id', relatedWordId)
                .eq('related_word_id', wordId)
                .eq('relation_type', type)
                .single();

            if (!existingReverse) {
                // Get original word text for custom_text
                const { data: originalWord } = await client
                    .from('words')
                    .select('text')
                    .eq('id', wordId)
                    .single();

                if (originalWord) {
                    await client
                        .from('word_relations')
                        .insert({
                            id: crypto.randomUUID(),
                            word_id: relatedWordId,
                            relation_type: type,
                            custom_text: originalWord.text,
                            related_word_id: wordId,
                        });
                }
            }
        } catch (e) {
            console.error('Failed to create reverse relation:', e);
            // Don't fail the whole operation if reverse relation fails
        }
    }

    // 6. Transitive Synonyms Logic
    // If A is synonym of B, and B is synonym of C, then A, B, C should all be synonyms
    if (type === 'SYNONYM') {
        try {
            // Collect all unique word IDs in the synonym group
            const groupIds = new Set<string>();
            groupIds.add(wordId);
            groupIds.add(relatedWordId);
            
            // Get existing synonyms for both words to build the full group
            // We look for any synonym relation involving either word
            const { data: existingRelations } = await client
                .from('word_relations')
                .select('word_id, related_word_id')
                .in('word_id', [wordId, relatedWordId])
                .eq('relation_type', 'SYNONYM');
                
            existingRelations?.forEach(r => {
                if (r.related_word_id) groupIds.add(r.related_word_id);
            });

            const groupArray = Array.from(groupIds);

            // Fetch texts for all words in the group
            const { data: wordsInGroup } = await client
                .from('words')
                .select('id, text')
                .in('id', groupArray);
            
            const wordMap = new Map(wordsInGroup?.map(w => [w.id, w.text]));

            // Fetch ALL existing relations within this group to avoid duplicates
            const { data: currentGroupRelations } = await client
                .from('word_relations')
                .select('word_id, related_word_id')
                .in('word_id', groupArray)
                .eq('relation_type', 'SYNONYM');
            
            const existingRelSet = new Set(
                currentGroupRelations?.map(r => `${r.word_id}:${r.related_word_id}`)
            );

            const inserts = [];
            for (const id1 of groupArray) {
                for (const id2 of groupArray) {
                    if (id1 === id2) continue;
                    if (!existingRelSet.has(`${id1}:${id2}`)) {
                        inserts.push({
                            id: crypto.randomUUID(),
                            word_id: id1,
                            related_word_id: id2,
                            relation_type: 'SYNONYM',
                            custom_text: wordMap.get(id2) || '',
                        });
                    }
                }
            }

            if (inserts.length > 0) {
                await client.from('word_relations').insert(inserts);
            }

        } catch (e) {
            console.error('Failed to sync transitive synonyms:', e);
        }
    }

    // Invalidate cache to ensure new words appear in the list
    await invalidateVocabCache(session.user.id);
    revalidatePath('/words');
    
    return { success: true };
}

export async function removeWordRelation(relationId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    const { error } = await client
        .from('word_relations')
        .delete()
        .eq('id', relationId);

    if (error) {
        console.error('Failed to remove word relation:', error);
        return { error: 'Failed to remove word relation' };
    }

    revalidatePath('/words');
    return { success: true };
}

export async function getWordRelations(wordId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;

    const { data: relations, error } = await client
        .from('word_relations')
        .select(`
            *,
            relatedWord:words!related_word_id(*)
        `)
        .eq('word_id', wordId);

    if (error) {
        console.error('Failed to get word relations:', error);
        return { error: 'Failed to get word relations' };
    }

    return { relations };
}
