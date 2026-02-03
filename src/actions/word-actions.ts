'use server';

import { auth } from '@/auth';
import { getAdminClient, APPWRITE_DATABASE_ID, Query } from '@/lib/appwrite';
import { ID } from 'node-appwrite';
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

    const admin = getAdminClient();

    // Try to find the word in the database first
    const { documents: existingWords } = await admin.databases.listDocuments(
        APPWRITE_DATABASE_ID,
        'words',
        [
            Query.equal('text', normalizedWord),
            Query.isNull('deleted_at'),
            Query.limit(1)
        ]
    );

    if (existingWords.length > 0) {
        const w = existingWords[0];
        return { word: { ...w, id: w.$id } };
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

    const admin = getAdminClient();

    try {
        const word = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'words', wordId);
        if (word.deleted_at) return { occurrences: [] };
    } catch (e) {
        return { occurrences: [] };
    }

    // Fetch occurrences
    // We need to filter by material.user_id = session.user.id
    // Appwrite doesn't support deep join filtering.
    // Strategy:
    // 1. Fetch occurrences for word (limit 50?)
    // 2. Fetch sentences for occurrences
    // 3. Fetch materials for sentences
    // 4. Filter by material.user_id
    
    const { documents: occurrences } = await admin.databases.listDocuments(
        APPWRITE_DATABASE_ID,
        'word_occurrences',
        [
            Query.equal('word_id', wordId),
            Query.limit(50) // Fetch more to filter later
        ]
    );

    if (occurrences.length === 0) return { occurrences: [] };

    const sentenceIds = Array.from(new Set(occurrences.map(o => o.sentence_id)));
    
    // Fetch sentences
    const sentencesMap = new Map();
    for (let i = 0; i < sentenceIds.length; i += 50) {
        const batch = sentenceIds.slice(i, i + 50);
        const { documents: sentences } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'sentences',
            [Query.equal('$id', batch)]
        );
        for (const s of sentences) sentencesMap.set(s.$id, s);
    }

    // Fetch materials
    const materialIds = Array.from(new Set(Array.from(sentencesMap.values()).map(s => s.material_id)));
    const materialsMap = new Map();
    
    for (let i = 0; i < materialIds.length; i += 50) {
        const batch = materialIds.slice(i, i + 50);
        const { documents: materials } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'materials',
            [Query.equal('$id', batch)]
        );
        for (const m of materials) materialsMap.set(m.$id, m);
    }

    // Filter and assemble
    const result = occurrences.map(occ => {
        const sentence = sentencesMap.get(occ.sentence_id);
        if (!sentence || sentence.deleted_at) return null;
        
        const material = materialsMap.get(sentence.material_id);
        if (!material || material.user_id !== session.user.id) return null;
        
        return {
            ...occ,
            sentence: {
                ...sentence,
                material: {
                    id: material.$id,
                    title: material.title,
                    user_id: material.user_id
                }
            }
        };
    }).filter(Boolean).slice(0, 10);

    return { occurrences: result };
}

export async function updateWordStatus(wordId: string, status: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const admin = getAdminClient();

    try {
        // Check if status exists
        const { documents: existing } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'user_word_statuses',
            [
                Query.equal('user_id', session.user.id),
                Query.equal('word_id', wordId)
            ]
        );

        if (existing.length > 0) {
            // Update existing
            await admin.databases.updateDocument(
                APPWRITE_DATABASE_ID,
                'user_word_statuses',
                existing[0].$id,
                {
                    status: status
                }
            );
        } else {
            // Insert new
            await admin.databases.createDocument(
                APPWRITE_DATABASE_ID,
                'user_word_statuses',
                ID.unique(),
                {
                    user_id: session.user.id,
                    word_id: wordId,
                    status: status
                }
            );
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

    const admin = getAdminClient();

    try {
        // Get existing statuses for these words
        // Batch fetch
        const existingMap = new Map();
        
        for (let i = 0; i < wordIds.length; i += 50) {
            const batch = wordIds.slice(i, i + 50);
            const { documents: existingStatuses } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'user_word_statuses',
                [
                    Query.equal('user_id', session.user.id),
                    Query.equal('word_id', batch)
                ]
            );
            for (const s of existingStatuses) existingMap.set(s.word_id, s.$id);
        }

        // Separate into updates and inserts
        const toUpdate: string[] = [];
        const toInsert: string[] = [];

        for (const wordId of wordIds) {
            if (existingMap.has(wordId)) {
                toUpdate.push(existingMap.get(wordId)!);
            } else {
                toInsert.push(wordId);
            }
        }

        // Update existing records
        for (const id of toUpdate) {
            await admin.databases.updateDocument(
                APPWRITE_DATABASE_ID,
                'user_word_statuses',
                id,
                {
                    status: status
                }
            );
        }

        // Insert new records
        for (const wordId of toInsert) {
            await admin.databases.createDocument(
                APPWRITE_DATABASE_ID,
                'user_word_statuses',
                ID.unique(),
                {
                    user_id: session.user.id,
                    word_id: wordId,
                    status: status
                }
            );
        }

        // Invalidate vocab cache
        await invalidateVocabCache(session.user.id);

        return { success: true };
    } catch (e) {
        console.error(e);
        return { error: 'Failed to update statuses' };
    }
}

export async function restoreWord(statusId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const admin = getAdminClient();

    try {
        // statusId is now the user_word_status ID, not the word ID
        const status = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'user_word_statuses', statusId);
        
        if (!status) return { error: 'Word status not found' };
        if (status.user_id !== session.user.id) return { error: 'Unauthorized' };
        if (!status.deleted_at) return { error: 'Word is not in trash' };

        // Restore by clearing deleted_at on user_word_status
        await admin.databases.updateDocument(
            APPWRITE_DATABASE_ID,
            'user_word_statuses',
            statusId,
            { deleted_at: null }
        );

        // Invalidate vocab cache
        await invalidateVocabCache(session.user.id);

        revalidatePath('/trash');
        revalidatePath('/vocab');
        revalidatePath('/words');
        return { success: true };
    } catch (e) {
        return { error: 'Word not found' };
    }
}

export async function permanentlyDeleteWord(statusId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const admin = getAdminClient();

    try {
        // statusId is now the user_word_status ID
        const status = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'user_word_statuses', statusId);
        
        if (!status) return { error: 'Word status not found' };
        if (status.user_id !== session.user.id) return { error: 'Unauthorized' };
        
        const wordId = status.word_id;

        // Get user's materials to only delete their word occurrences
        const { documents: materials } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'materials',
            [Query.equal('user_id', session.user.id), Query.limit(1000)]
        );
        const materialIds = materials.map(m => m.$id);

        if (materialIds.length > 0) {
            // Get sentences for user's materials
            const { documents: sentences } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'sentences',
                [Query.equal('material_id', materialIds), Query.limit(5000)]
            );
            const sentenceIds = sentences.map(s => s.$id);

            if (sentenceIds.length > 0) {
                // Delete word occurrences ONLY for user's sentences
                const { documents: occs } = await admin.databases.listDocuments(
                    APPWRITE_DATABASE_ID,
                    'word_occurrences',
                    [
                        Query.equal('word_id', wordId),
                        Query.equal('sentence_id', sentenceIds),
                        Query.limit(5000)
                    ]
                );
                await Promise.all(occs.map(o => admin.databases.deleteDocument(APPWRITE_DATABASE_ID, 'word_occurrences', o.$id)));
            }
        }

        // Delete user's word status (NOT the global word - other users might have it)
        await admin.databases.deleteDocument(APPWRITE_DATABASE_ID, 'user_word_statuses', statusId);

        // Invalidate vocab cache
        await invalidateVocabCache(session.user.id);

        revalidatePath('/trash');
        revalidatePath('/vocab');
        revalidatePath('/words');
        return { success: true };
    } catch (e) {
        console.error('Failed to delete word', e);
        return { error: 'Failed to delete word' };
    }
}

// Soft delete multiple words (move to trash)
export async function deleteWords(wordIds: string[]) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const admin = getAdminClient();

    try {
        // Find user_word_statuses for these words
        const statusesToDelete: { id: string; wordId: string }[] = [];
        
        for (let i = 0; i < wordIds.length; i += 50) {
            const batch = wordIds.slice(i, i + 50);
            const { documents: statuses } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'user_word_statuses',
                [
                    Query.equal('user_id', session.user.id),
                    Query.equal('word_id', batch)
                ]
            );
            statusesToDelete.push(...statuses.map(s => ({ id: s.$id, wordId: s.word_id })));
        }
        
        if (statusesToDelete.length === 0) {
            return { error: 'No valid words to delete' };
        }

        // Soft delete user_word_statuses (NOT the global word)
        // This keeps the deletion per-user instead of affecting all users
        for (const status of statusesToDelete) {
            await admin.databases.updateDocument(
                APPWRITE_DATABASE_ID,
                'user_word_statuses',
                status.id,
                { deleted_at: new Date().toISOString() }
            );
        }

        // Invalidate vocab cache
        await invalidateVocabCache(session.user.id);

        revalidatePath('/vocab');
        revalidatePath('/words');
        revalidatePath('/trash');

        return { success: true, count: statusesToDelete.length };
    } catch (e) {
        console.error('Failed to delete words:', e);
        return { error: 'Failed to delete words' };
    }
}

/**
 * Edit a word - update the word text and refresh dictionary data
 */
export async function editWord(wordId: string, newWordText: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const admin = getAdminClient();
    const normalizedWord = newWordText.toLowerCase().trim();

    if (!normalizedWord) {
        return { error: 'Word cannot be empty' };
    }

    try {
        // Check if user has access to this word
        const { documents: statuses } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'user_word_statuses',
            [
                Query.equal('user_id', session.user.id),
                Query.equal('word_id', wordId)
            ]
        );

        if (statuses.length === 0) {
            return { error: 'Word not found or access denied' };
        }

        // Get the current word text
        const currentWord = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'words', wordId);

        // If the word text hasn't changed, no need to do anything
        if (currentWord.text === normalizedWord) {
            return { success: true, word: { id: wordId, text: normalizedWord } };
        }

        // Check if a word with the new text already exists
        const { documents: existingWords } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'words',
            [
                Query.equal('text', normalizedWord),
                Query.isNull('deleted_at')
            ]
        );
        
        const existingWord = existingWords.find(w => w.$id !== wordId);

        if (existingWord) {
            // Merge: the target word already exists
            // 1. Move all word_occurrences from old word to existing word
            const { documents: occs } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'word_occurrences',
                [
                    Query.equal('word_id', wordId),
                    Query.limit(5000)
                ]
            );
            
            for (const occ of occs) {
                await admin.databases.updateDocument(
                    APPWRITE_DATABASE_ID,
                    'word_occurrences',
                    occ.$id,
                    { word_id: existingWord.$id }
                );
            }

            // 2. Check if user has status for the existing word
            const { documents: existingStatuses } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'user_word_statuses',
                [
                    Query.equal('user_id', session.user.id),
                    Query.equal('word_id', existingWord.$id)
                ]
            );

            if (existingStatuses.length === 0) {
                // User doesn't have status for existing word, move the status
                await admin.databases.updateDocument(
                    APPWRITE_DATABASE_ID,
                    'user_word_statuses',
                    statuses[0].$id,
                    { word_id: existingWord.$id }
                );
            } else {
                // User already has status for existing word, delete the old status
                await admin.databases.deleteDocument(
                    APPWRITE_DATABASE_ID,
                    'user_word_statuses',
                    statuses[0].$id
                );
            }

            // 3. Soft delete the old word (it's now orphaned for this user)
            // Check if any other users have this word
            const { documents: otherStatuses } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'user_word_statuses',
                [Query.equal('word_id', wordId)]
            );

            if (otherStatuses.length === 0) {
                // No other users have this word, soft delete it
                await admin.databases.updateDocument(
                    APPWRITE_DATABASE_ID,
                    'words',
                    wordId,
                    { deleted_at: new Date().toISOString() }
                );
            }

            // Invalidate vocab cache
            await invalidateVocabCache(session.user.id);

            revalidatePath('/vocab');

            return {
                success: true,
                merged: true,
                word: {
                    id: existingWord.$id,
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
        };

        // If dictionary data is found, update all word metadata
        if (dictData) {
            updateData.phonetic = dictData.phonetic || null;
            updateData.definition = dictData.definition || null;
            updateData.translation = dictData.translation || null;
            updateData.pos = dictData.pos || null;
        }

        // Update the word
        await admin.databases.updateDocument(
            APPWRITE_DATABASE_ID,
            'words',
            wordId,
            updateData
        );

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

    const admin = getAdminClient();

    try {
        // Check if user has access to this word
        const { documents: statuses } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'user_word_statuses',
            [
                Query.equal('user_id', session.user.id),
                Query.equal('word_id', wordId)
            ]
        );

        if (statuses.length === 0) {
            return { error: 'Word not found or access denied' };
        }

        await admin.databases.updateDocument(
            APPWRITE_DATABASE_ID,
            'words',
            wordId,
            updates
        );

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

    const admin = getAdminClient();
    const normalizedText = relatedText.toLowerCase().trim();

    if (!normalizedText) return { error: 'Related text cannot be empty' };

    // 1. Check if the related word exists in the database
    let relatedWordId: string | null = null;
    
    const { documents: existingWords } = await admin.databases.listDocuments(
        APPWRITE_DATABASE_ID,
        'words',
        [
            Query.equal('text', normalizedText),
            Query.isNull('deleted_at')
        ]
    );

    if (existingWords.length > 0) {
        relatedWordId = existingWords[0].$id;
    } else {
        // 2. If not exists, create it
        // Query dictionary first to get metadata
        const dictResults = await queryDictionary([normalizedText]);
        const dictData = dictResults[normalizedText];
        
        const newWordData: any = {
            text: normalizedText,
            deleted_at: null
        };
        
        if (dictData) {
            newWordData.phonetic = dictData.phonetic || null;
            newWordData.definition = dictData.definition || null;
            newWordData.translation = dictData.translation || null;
            newWordData.pos = dictData.pos || null;
        }
        
        try {
            const newWord = await admin.databases.createDocument(
                APPWRITE_DATABASE_ID,
                'words',
                ID.unique(),
                newWordData
            );
            relatedWordId = newWord.$id;
        } catch (e) {
            // Race condition check
            const { documents: retryWords } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'words',
                [Query.equal('text', normalizedText)]
            );
            if (retryWords.length > 0) relatedWordId = retryWords[0].$id;
            else return { error: 'Failed to create related word' };
        }
    }

    if (!relatedWordId) return { error: 'Failed to resolve related word' };

    // 3. Ensure the user has the RELATED word in their list (UserWordStatus)
    const { documents: existingStatus } = await admin.databases.listDocuments(
        APPWRITE_DATABASE_ID,
        'user_word_statuses',
        [
            Query.equal('user_id', session.user.id),
            Query.equal('word_id', relatedWordId)
        ]
    );
        
    if (existingStatus.length === 0) {
        await admin.databases.createDocument(
            APPWRITE_DATABASE_ID,
            'user_word_statuses',
            ID.unique(),
            {
                user_id: session.user.id,
                word_id: relatedWordId,
                status: 'NEW'
            }
        );
    }

    // 3.5 Add to dictionary if dictionaryId is provided
    if (dictionaryId) {
        try {
            const { documents: existingDictWord } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'dictionary_words',
                [
                    Query.equal('dictionary_id', dictionaryId),
                    Query.equal('word_id', relatedWordId)
                ]
            );

            if (existingDictWord.length === 0) {
                await admin.databases.createDocument(
                    APPWRITE_DATABASE_ID,
                    'dictionary_words',
                    ID.unique(),
                    {
                        dictionary_id: dictionaryId,
                        word_id: relatedWordId,
                        added_at: new Date().toISOString()
                    }
                );
            }
        } catch (e) {
            console.error('Failed to add related word to dictionary:', e);
        }
    }

    // 4. Create the relation (Forward)
    // Note: word_relations collection may not exist - handle gracefully
    try {
        const { documents: existingRelation } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'word_relations',
            [
                Query.equal('word_id', wordId),
                Query.equal('related_word_id', relatedWordId),
                Query.equal('relation_type', type)
            ]
        );

        if (existingRelation.length === 0) {
            await admin.databases.createDocument(
                APPWRITE_DATABASE_ID,
                'word_relations',
                ID.unique(),
                {
                    word_id: wordId,
                    relation_type: type,
                    custom_text: normalizedText,
                    related_word_id: relatedWordId
                }
            );
        }

        // 5. Create reverse relation (Bidirectional)
        if (type === 'SYNONYM' || type === 'ANTONYM') {
            try {
                const { documents: existingReverse } = await admin.databases.listDocuments(
                    APPWRITE_DATABASE_ID,
                    'word_relations',
                    [
                        Query.equal('word_id', relatedWordId),
                        Query.equal('related_word_id', wordId),
                        Query.equal('relation_type', type)
                    ]
                );

                if (existingReverse.length === 0) {
                    const originalWord = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'words', wordId);
                    
                    await admin.databases.createDocument(
                        APPWRITE_DATABASE_ID,
                        'word_relations',
                        ID.unique(),
                        {
                            word_id: relatedWordId,
                            relation_type: type,
                            custom_text: originalWord.text,
                            related_word_id: wordId
                        }
                    );
                }
            } catch (e) {
                console.error('Failed to create reverse relation:', e);
            }
        }

        // 6. Transitive Synonyms Logic
        if (type === 'SYNONYM') {
            try {
                // Collect all unique word IDs in the synonym group
                const groupIds = new Set<string>();
                groupIds.add(wordId);
                groupIds.add(relatedWordId);
                
                // Get existing synonyms
                const { documents: existingRelations } = await admin.databases.listDocuments(
                    APPWRITE_DATABASE_ID,
                    'word_relations',
                    [
                        Query.equal('relation_type', 'SYNONYM'),
                        Query.equal('word_id', [wordId, relatedWordId]) // Appwrite OR
                    ]
                );
                    
                existingRelations.forEach(r => {
                    if (r.related_word_id) groupIds.add(r.related_word_id);
                });

                const groupArray = Array.from(groupIds);

                // Fetch texts
                const { documents: wordsInGroup } = await admin.databases.listDocuments(
                    APPWRITE_DATABASE_ID,
                    'words',
                    [Query.equal('$id', groupArray)]
                );
                
                const wordMap = new Map(wordsInGroup.map(w => [w.$id, w.text]));

                // Fetch ALL existing relations within this group
                // Appwrite doesn't support complex OR logic easily for pairs.
                // We'll fetch all relations for these words and filter in memory.
                const { documents: currentGroupRelations } = await admin.databases.listDocuments(
                    APPWRITE_DATABASE_ID,
                    'word_relations',
                    [
                        Query.equal('word_id', groupArray),
                        Query.equal('relation_type', 'SYNONYM')
                    ]
                );
                
                const existingRelSet = new Set(
                    currentGroupRelations.map(r => `${r.word_id}:${r.related_word_id}`)
                );

                for (const id1 of groupArray) {
                    for (const id2 of groupArray) {
                        if (id1 === id2) continue;
                        if (!existingRelSet.has(`${id1}:${id2}`)) {
                            await admin.databases.createDocument(
                                APPWRITE_DATABASE_ID,
                                'word_relations',
                                ID.unique(),
                                {
                                    word_id: id1,
                                    related_word_id: id2,
                                    relation_type: 'SYNONYM',
                                    custom_text: wordMap.get(id2) || ''
                                }
                            );
                        }
                    }
                }

            } catch (e) {
                console.error('Failed to sync transitive synonyms:', e);
            }
        }
    } catch (e: any) {
        // Handle missing collection gracefully (collection not created yet)
        if (e.code === 404 && e.type === 'collection_not_found') {
            console.warn('[addWordRelation] word_relations collection not found - skipping relation creation');
        } else {
            console.error('[addWordRelation] Error creating relation:', e);
            return { error: 'Failed to create word relation' };
        }
    }

    // Invalidate cache
    await invalidateVocabCache(session.user.id);
    revalidatePath('/words');
    
    return { success: true };
}

export async function removeWordRelation(relationId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const admin = getAdminClient();

    try {
        await admin.databases.deleteDocument(APPWRITE_DATABASE_ID, 'word_relations', relationId);
    } catch (e: any) {
        // Handle missing collection gracefully (collection not created yet)
        if (e.code === 404 && e.type === 'collection_not_found') {
            console.warn('[removeWordRelation] word_relations collection not found');
            return { success: true }; // Nothing to delete if collection doesn't exist
        }
        console.error('Failed to remove word relation:', e);
        return { error: 'Failed to remove word relation' };
    }

    revalidatePath('/words');
    return { success: true };
}

export async function getWordRelations(wordId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const admin = getAdminClient();

    try {
        const { documents: relations } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'word_relations',
            [Query.equal('word_id', wordId)]
        );

        // Fetch related words details
        const relatedWordIds = relations.map(r => r.related_word_id).filter(Boolean);
        const relatedWordsMap = new Map();
        
        if (relatedWordIds.length > 0) {
            const { documents: words } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'words',
                [Query.equal('$id', relatedWordIds)]
            );
            for (const w of words) relatedWordsMap.set(w.$id, w);
        }

        const result = relations.map(r => ({
            ...r,
            relatedWord: relatedWordsMap.get(r.related_word_id) || null
        }));

        return { relations: result };
    } catch (e: any) {
        // Handle missing collection gracefully (collection not created yet)
        if (e.code === 404 && e.type === 'collection_not_found') {
            return { relations: [] };
        }
        console.error('[getWordRelations] Error:', e);
        return { relations: [] };
    }
}

export async function getHardestWords(limit: number = 50) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const admin = getAdminClient();

    const { documents: hardestWords } = await admin.databases.listDocuments(
        APPWRITE_DATABASE_ID,
        'user_word_statuses',
        [
            Query.equal('user_id', session.user.id),
            Query.greaterThan('error_count', 0),
            Query.orderDesc('error_count'),
            Query.limit(limit)
        ]
    );

    // Fetch word details
    const wordIds = hardestWords.map(s => s.word_id);
    const wordsMap = new Map();
    
    if (wordIds.length > 0) {
        const { documents: words } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'words',
            [Query.equal('$id', wordIds)]
        );
        for (const w of words) wordsMap.set(w.$id, w);
    }

    return {
        words: hardestWords.map((ws: any) => {
            const word = wordsMap.get(ws.word_id);
            return {
                id: word?.$id || ws.$id,
                text: word?.text || '',
                errorCount: ws.error_count || 0,
                translation: word?.translation || null,
                phonetic: word?.phonetic || null,
                pos: word?.pos || null,
                definition: word?.definition || null,
                tag: word?.tag || null,
                exchange: word?.exchange || null,
            };
        })
    };
}
