'use server';

import { auth } from '@/auth';
import { getAdminClient } from '@/lib/appwrite';
import { 
    DATABASE_ID, 
    SENTENCES_COLLECTION_ID, 
    MATERIALS_COLLECTION_ID, 
    WORDS_COLLECTION_ID, 
    WORD_OCCURRENCES_COLLECTION_ID, 
    PRACTICE_PROGRESS_COLLECTION_ID,
    USER_WORD_STATUSES_COLLECTION_ID
} from '@/lib/appwrite_client';
import { ID, Query } from 'node-appwrite';
import { queryDictionary } from './vocab-actions';
import { revalidatePath } from 'next/cache';

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

interface TokenWithPosition {
    word: string;          // lowercase word for dictionary lookup
    startIndex: number;    // position in original content
    endIndex: number;      // position in original content
}

// Tokenize content and return words with their positions in the original content
function tokenizeWithPositions(content: string): TokenWithPosition[] {
    const tokens: TokenWithPosition[] = [];
    // Match word characters (letters, numbers, apostrophes for contractions)
    const wordRegex = /[a-zA-Z']+/g;
    let match;
    
    while ((match = wordRegex.exec(content)) !== null) {
        const word = match[0].toLowerCase();
        // Skip if too short or only digits
        if (word.length > 1 && !/^\d+$/.test(word) && !/^'+$/.test(word)) {
            tokens.push({
                word: word.replace(/'/g, ''),  // Remove apostrophes for lookup
                startIndex: match.index,
                endIndex: match.index + match[0].length,
            });
        }
    }
    
    return tokens;
}

async function cleanupOrphanWords(wordIds: string[]) {
    const { databases } = await getAdminClient();
    const unique = Array.from(new Set(wordIds));
    
    for (const wordId of unique) {
        // Check if there are any occurrences left for this word
        const { total } = await databases.listDocuments(
            DATABASE_ID,
            WORD_OCCURRENCES_COLLECTION_ID,
            [
                Query.equal('word_id', wordId),
                Query.limit(1)
            ]
        );

        if (total === 0) {
            // Soft delete the word if no occurrences found
            // Check if it's already deleted to avoid redundant updates
            try {
                const word = await databases.getDocument(
                    DATABASE_ID,
                    WORDS_COLLECTION_ID,
                    wordId
                );
                
                if (!word.deleted_at) {
                    await databases.updateDocument(
                        DATABASE_ID,
                        WORDS_COLLECTION_ID,
                        wordId,
                        { deleted_at: new Date().toISOString() }
                    );
                }
            } catch (e) {
                // Word might not exist
                console.error(`Failed to cleanup orphan word ${wordId}`, e);
            }
        }
    }
}

async function upsertWordsForTokens(userId: string, rawWords: string[]) {
    const { databases } = await getAdminClient();
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
            let wordId: string | null = null;

            // 1. Try to find existing word by text
            const existingWords = await databases.listDocuments(
                DATABASE_ID,
                WORDS_COLLECTION_ID,
                [Query.equal('text', lemma)]
            );

            if (existingWords.total > 0) {
                wordId = existingWords.documents[0].$id;
                // If it was soft deleted, restore it
                // Ensure it's not deleted.
                if (existingWords.documents[0].deleted_at) {
                    await databases.updateDocument(
                        DATABASE_ID,
                        WORDS_COLLECTION_ID,
                        wordId,
                        { deleted_at: null }
                    );
                }
            } else {
                // 2. Create new word
                const wordData = {
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

                try {
                    const newWord = await databases.createDocument(
                        DATABASE_ID,
                        WORDS_COLLECTION_ID,
                        ID.unique(),
                        wordData
                    );
                    wordId = newWord.$id;
                } catch (e) {
                    // Handle race condition where word might have been created by another process
                    const retryWords = await databases.listDocuments(
                        DATABASE_ID,
                        WORDS_COLLECTION_ID,
                        [Query.equal('text', lemma)]
                    );
                    if (retryWords.total > 0) {
                        wordId = retryWords.documents[0].$id;
                    }
                }
            }

            if (wordId) {
                lemmaCache.set(lemmaKey, wordId);
                
                // 3. Ensure user_word_status exists
                const existingStatus = await databases.listDocuments(
                    DATABASE_ID,
                    USER_WORD_STATUSES_COLLECTION_ID,
                    [
                        Query.equal('user_id', userId),
                        Query.equal('word_id', wordId)
                    ]
                );

                if (existingStatus.total === 0) {
                    try {
                        await databases.createDocument(
                            DATABASE_ID,
                            USER_WORD_STATUSES_COLLECTION_ID,
                            ID.unique(),
                            {
                                user_id: userId,
                                word_id: wordId,
                                status: 'NEW',
                            }
                        );
                    } catch (e) {
                        // Ignore duplicate error
                    }
                }
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

    const { databases } = await getAdminClient(); // Use admin client for updates to ensure permissions

    try {
        const sentence = await databases.getDocument(
            DATABASE_ID,
            SENTENCES_COLLECTION_ID,
            sentenceId
        );

        if (sentence.deleted_at) {
            return { error: 'Sentence is in trash. Restore it before editing.' };
        }

        // Verify material ownership
        const material = await databases.getDocument(
            DATABASE_ID,
            MATERIALS_COLLECTION_ID,
            sentence.material_id
        );

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

        // Build update payload - only include edited_content if the attribute exists in schema
        // Check if edited_content exists in the fetched sentence (indicates schema support)
        const supportsEditedContent = 'edited_content' in sentence;
        
        const updatePayload: Record<string, any> = {
            start_time: safeStart,
            end_time: endTime,
            order: payload.order ?? sentence.order
        };
        
        // Only include edited_content if the schema supports it
        if (supportsEditedContent) {
            updatePayload.edited_content = editedContent;
        } else {
            // If schema doesn't support edited_content, update the content field directly
            // This is a fallback - ideally the Appwrite schema should have edited_content attribute
            console.warn('[updateSentence] edited_content attribute not in schema. Please add it to Appwrite sentences collection.');
            if (editedContent !== null) {
                updatePayload.content = editedContent;
            }
        }

        const updated = await databases.updateDocument(
            DATABASE_ID,
            SENTENCES_COLLECTION_ID,
            sentenceId,
            updatePayload
        );

        // Only update vocabulary if content has changed
        const oldEffectiveContent = sentence.edited_content ?? sentence.content;
        if (effectiveContent !== oldEffectiveContent) {
            // Get old occurrences to identify removed words
            const oldOccurrencesList = await databases.listDocuments(
                DATABASE_ID,
                WORD_OCCURRENCES_COLLECTION_ID,
                [Query.equal('sentence_id', sentenceId)]
            );
            
            const oldWordIds = oldOccurrencesList.documents.map((o: any) => o.word_id);

            // Delete old occurrences
            // Appwrite doesn't support bulk delete, so we loop
            await Promise.all(oldOccurrencesList.documents.map(doc => 
                databases.deleteDocument(DATABASE_ID, WORD_OCCURRENCES_COLLECTION_ID, doc.$id)
            ));

            // Use tokenizeWithPositions to get word positions for fill-in-blank feature
            const tokensWithPositions = tokenizeWithPositions(effectiveContent);
            const tokens = tokensWithPositions.map(t => t.word);
            const rawToWordId = await upsertWordsForTokens(session.user.id, tokens);

            const occurrences = tokensWithPositions
                .map((token) => {
                    const wordId = rawToWordId.get(token.word);
                    if (!wordId) return null;
                    return { 
                        word_id: wordId, 
                        sentence_id: sentenceId,
                        start_index: token.startIndex,
                        end_index: token.endIndex,
                    };
                })
                .filter(Boolean) as { word_id: string; sentence_id: string; start_index: number; end_index: number }[];

            if (occurrences.length > 0) {
                await Promise.all(occurrences.map(occ => 
                    databases.createDocument(
                        DATABASE_ID,
                        WORD_OCCURRENCES_COLLECTION_ID,
                        ID.unique(),
                        occ
                    )
                ));
            }

            const newWordIds = Array.from(new Set(occurrences.map((o) => o.word_id)));
            const removedWordIds = oldWordIds.filter((id) => !newWordIds.includes(id));
            if (removedWordIds.length > 0) {
                await cleanupOrphanWords(removedWordIds);
            }
        }

        revalidatePath('/materials');
        revalidatePath(`/materials/${sentence.material_id}`);
        revalidatePath(`/study/sentences/${sentenceId}`);
        revalidatePath('/words');

        return {
            success: true,
            sentence: {
                id: updated.$id,
                content: effectiveContent,
                original_content: sentence.content,
                edited_content: editedContent,
                startTime: updated.start_time,
                endTime: updated.end_time,
                order: updated.order,
                materialId: updated.material_id,
            },
        };

    } catch (error) {
        console.error('Failed to update sentence', error);
        return { error: 'Failed to update sentence' };
    }
}

export async function restoreSentenceContent(sentenceId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const { databases } = await getAdminClient();

    try {
        const sentence = await databases.getDocument(
            DATABASE_ID,
            SENTENCES_COLLECTION_ID,
            sentenceId
        );

        if (sentence.deleted_at) return { error: 'Sentence is in trash. Restore it first.' };

        return updateSentence(sentenceId, {
            content: sentence.content,
            startTime: sentence.start_time,
            endTime: sentence.end_time,
            order: sentence.order,
            restoreOriginal: true,
        });
    } catch (error) {
        return { error: 'Sentence not found' };
    }
}

export async function deleteSentence(sentenceId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const { databases } = await getAdminClient();

    try {
        const sentence = await databases.getDocument(
            DATABASE_ID,
            SENTENCES_COLLECTION_ID,
            sentenceId
        );

        const material = await databases.getDocument(
            DATABASE_ID,
            MATERIALS_COLLECTION_ID,
            sentence.material_id
        );

        if (!material || material.user_id !== session.user.id) {
            return { error: 'Unauthorized' };
        }

        if (sentence.deleted_at) {
            return { error: 'Sentence already in trash' };
        }

        await databases.updateDocument(
            DATABASE_ID,
            SENTENCES_COLLECTION_ID,
            sentenceId,
            { deleted_at: new Date().toISOString() }
        );

        revalidatePath('/materials');
        revalidatePath(`/materials/${sentence.material_id}`);
        revalidatePath(`/study/sentences/${sentenceId}`);
        revalidatePath('/trash');

        return { success: true };
    } catch (error) {
        console.error('Failed to delete sentence', error);
        return { error: 'Failed to delete sentence' };
    }
}

export async function restoreSentence(sentenceId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const { databases } = await getAdminClient();

    try {
        const sentence = await databases.getDocument(
            DATABASE_ID,
            SENTENCES_COLLECTION_ID,
            sentenceId
        );

        const material = await databases.getDocument(
            DATABASE_ID,
            MATERIALS_COLLECTION_ID,
            sentence.material_id
        );

        if (!material || material.user_id !== session.user.id) return { error: 'Unauthorized' };

        if (!sentence.deleted_at) {
            return { success: true };
        }

        await databases.updateDocument(
            DATABASE_ID,
            SENTENCES_COLLECTION_ID,
            sentenceId,
            { deleted_at: null }
        );

        revalidatePath('/materials');
        revalidatePath(`/materials/${sentence.material_id}`);
        revalidatePath(`/study/sentences/${sentenceId}`);
        revalidatePath('/trash');

        return { success: true };
    } catch (error) {
        console.error('Failed to restore sentence', error);
        return { error: 'Failed to restore sentence' };
    }
}

export async function permanentlyDeleteSentence(sentenceId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const { databases } = await getAdminClient();

    try {
        const sentence = await databases.getDocument(
            DATABASE_ID,
            SENTENCES_COLLECTION_ID,
            sentenceId
        );

        const material = await databases.getDocument(
            DATABASE_ID,
            MATERIALS_COLLECTION_ID,
            sentence.material_id
        );

        if (!material || material.user_id !== session.user.id) {
            return { error: 'Unauthorized' };
        }

        // Get occurrences to cleanup orphan words later
        const occurrencesList = await databases.listDocuments(
            DATABASE_ID,
            WORD_OCCURRENCES_COLLECTION_ID,
            [Query.equal('sentence_id', sentenceId)]
        );
        const oldWordIds = occurrencesList.documents.map((o: any) => o.word_id);

        // Delete occurrences
        await Promise.all(occurrencesList.documents.map(doc => 
            databases.deleteDocument(DATABASE_ID, WORD_OCCURRENCES_COLLECTION_ID, doc.$id)
        ));

        // Delete practice progress
        const practicesList = await databases.listDocuments(
            DATABASE_ID,
            PRACTICE_PROGRESS_COLLECTION_ID,
            [Query.equal('sentence_id', sentenceId)]
        );
        await Promise.all(practicesList.documents.map(doc => 
            databases.deleteDocument(DATABASE_ID, PRACTICE_PROGRESS_COLLECTION_ID, doc.$id)
        ));

        // Delete sentence
        await databases.deleteDocument(
            DATABASE_ID,
            SENTENCES_COLLECTION_ID,
            sentenceId
        );

        if (oldWordIds.length > 0) {
            await cleanupOrphanWords(oldWordIds);
        }

        revalidatePath('/materials');
        revalidatePath(`/materials/${sentence.material_id}`);
        revalidatePath(`/study/sentences/${sentenceId}`);
        revalidatePath('/trash');

        return { success: true };
    } catch (error) {
        console.error('Failed to delete sentence', error);
        return { error: 'Failed to delete sentence' };
    }
}

/**
 * Get paginated sentences for a material with server-side pagination
 */
export interface SentenceFilters {
    search?: string;
}

export interface PaginatedSentenceResult {
    data: any[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export async function getSentencesPaginated(
    materialId: string,
    page: number = 1,
    pageSize: number = 10,
    filters: SentenceFilters = {},
    sortBy: string = 'order',
    sortOrder: 'asc' | 'desc' = 'asc'
): Promise<PaginatedSentenceResult | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const { databases } = await getAdminClient();
    const userId = session.user.id;
    const offset = (page - 1) * pageSize;

    try {
        // Verify material belongs to user
        const material = await databases.getDocument(
            DATABASE_ID,
            MATERIALS_COLLECTION_ID,
            materialId
        );

        if (!material || material.user_id !== userId) {
            return { error: 'Material not found or unauthorized' };
        }

        // Build queries
        const queries = [
            Query.equal('material_id', materialId),
            Query.isNull('deleted_at'),
        ];

        // Apply search filter - only search on content field
        // edited_content may not exist in all Appwrite setups
        if (filters.search) {
            queries.push(Query.search('content', filters.search));
        }

        // Apply sorting
        const orderColumn = sortBy === 'order' ? 'order' : sortBy === 'start_time' ? 'start_time' : 'order';
        if (sortOrder === 'asc') {
            queries.push(Query.orderAsc(orderColumn));
            if (orderColumn === 'order') queries.push(Query.orderAsc('start_time'));
        } else {
            queries.push(Query.orderDesc(orderColumn));
            if (orderColumn === 'order') queries.push(Query.orderDesc('start_time'));
        }

        // Apply pagination
        queries.push(Query.limit(pageSize));
        queries.push(Query.offset(offset));

        const { documents: sentences, total } = await databases.listDocuments(
            DATABASE_ID,
            SENTENCES_COLLECTION_ID,
            queries
        );

        // Fetch practice progress for these sentences
        const sentenceIds = sentences.map(s => s.$id);
        let practices: any[] = [];
        
        if (sentenceIds.length > 0) {
            // We need to fetch practice progress for these sentences AND this user
            // Appwrite doesn't support "IN" query for multiple attributes easily combined with other filters in a single go if not carefully structured
            // But here we can just query practice_progress where sentence_id is in list AND user_id is current user
            
            // Since we can't do "IN" with a large list easily if it exceeds limits, but page size is 10, so it's fine.
            const practiceQueries = [
                Query.equal('user_id', userId),
                Query.equal('sentence_id', sentenceIds)
            ];
            
            const practiceResult = await databases.listDocuments(
                DATABASE_ID,
                PRACTICE_PROGRESS_COLLECTION_ID,
                practiceQueries
            );
            practices = practiceResult.documents;
        }

        // Process sentences
        const processedSentences = sentences.map((s: any) => {
            const displayContent = s.edited_content ?? s.content;
            const userPractice = practices.find((p: any) => p.sentence_id === s.$id);
            
            return {
                id: s.$id,
                order: s.order,
                content: displayContent,
                originalContent: s.content,
                editedContent: s.edited_content,
                startTime: s.start_time,
                endTime: s.end_time,
                materialId: s.material_id,
                createdAt: s.$createdAt,
                updatedAt: s.$updatedAt,
                practiceAttempts: userPractice?.attempts || 0,
                practiceScore: userPractice?.score ?? null,
            };
        });

        const totalPages = Math.ceil(total / pageSize);

        return {
            data: processedSentences,
            total,
            page,
            pageSize,
            totalPages,
        };
    } catch (error) {
        console.error('[getSentencesPaginated] Error:', error);
        return { error: 'Failed to fetch sentences' };
    }
}

export async function mergeSentences(sentenceIds: string[]) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const { databases } = await getAdminClient();
    
    if (sentenceIds.length < 2) {
        return { error: 'Select at least 2 sentences to merge' };
    }

    try {
        // Fetch all sentences
        // Appwrite limit for "equal" array is usually around 100, which should be fine for merge
        const { documents: sentences } = await databases.listDocuments(
            DATABASE_ID,
            SENTENCES_COLLECTION_ID,
            [
                Query.equal('$id', sentenceIds),
                Query.isNull('deleted_at'),
                Query.orderAsc('order')
            ]
        );

        if (!sentences || sentences.length !== sentenceIds.length) {
            return { error: 'Some sentences not found or already deleted' };
        }

        // Verify same material
        const materialId = sentences[0].material_id;
        if (sentences.some(s => s.material_id !== materialId)) {
            return { error: 'Cannot merge sentences from different materials' };
        }

        // Verify ownership
        const material = await databases.getDocument(
            DATABASE_ID,
            MATERIALS_COLLECTION_ID,
            materialId
        );

        if (!material || material.user_id !== session.user.id) {
            return { error: 'Unauthorized' };
        }

        // Calculate new values
        const sortedSentences = sentences.sort((a, b) => a.order - b.order);
        const firstSentence = sortedSentences[0];
        const otherSentences = sortedSentences.slice(1);

        const newStartTime = Math.min(...sentences.map(s => s.start_time));
        const newEndTime = Math.max(...sentences.map(s => s.end_time));
        
        // Merge content
        const mergedContent = sortedSentences
            .map(s => (s.edited_content ?? s.content).trim())
            .join(' ');

        // Update first sentence
        // Build update payload - only include edited_content if the attribute exists in schema
        const supportsEditedContent = 'edited_content' in firstSentence;
        const mergeUpdatePayload: Record<string, any> = {
            content: mergedContent,
            start_time: newStartTime,
            end_time: newEndTime
        };
        if (supportsEditedContent) {
            mergeUpdatePayload.edited_content = null;
        }
        
        await databases.updateDocument(
            DATABASE_ID,
            SENTENCES_COLLECTION_ID,
            firstSentence.$id,
            mergeUpdatePayload
        );

        // Soft delete others
        await Promise.all(otherSentences.map(s => 
            databases.updateDocument(
                DATABASE_ID,
                SENTENCES_COLLECTION_ID,
                s.$id,
                { deleted_at: new Date().toISOString() }
            )
        ));

        // Update vocabulary for the new merged sentence
        // First remove old occurrences for the first sentence
        const oldOccurrences = await databases.listDocuments(
            DATABASE_ID,
            WORD_OCCURRENCES_COLLECTION_ID,
            [Query.equal('sentence_id', firstSentence.$id)]
        );
        await Promise.all(oldOccurrences.documents.map(doc => 
            databases.deleteDocument(DATABASE_ID, WORD_OCCURRENCES_COLLECTION_ID, doc.$id)
        ));
        
        const tokensWithPositions = tokenizeWithPositions(mergedContent);
        const tokens = tokensWithPositions.map(t => t.word);
        const rawToWordId = await upsertWordsForTokens(session.user.id, tokens);

        const occurrences = tokensWithPositions
            .map((token) => {
                const wordId = rawToWordId.get(token.word);
                if (!wordId) return null;
                return { 
                    word_id: wordId, 
                    sentence_id: firstSentence.$id,
                    start_index: token.startIndex,
                    end_index: token.endIndex,
                };
            })
            .filter(Boolean) as { word_id: string; sentence_id: string; start_index: number; end_index: number }[];

        if (occurrences.length > 0) {
            await Promise.all(occurrences.map(occ => 
                databases.createDocument(
                    DATABASE_ID,
                    WORD_OCCURRENCES_COLLECTION_ID,
                    ID.unique(),
                    occ
                )
            ));
        }

        revalidatePath('/materials');
        revalidatePath(`/materials/${materialId}`);
        
        return { success: true };
    } catch (error) {
        console.error('Failed to merge sentences', error);
        return { error: 'Failed to merge sentences' };
    }
}

export async function splitSentence(sentenceId: string, splitIndex: number) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const { databases } = await getAdminClient();

    try {
        const sentence = await databases.getDocument(
            DATABASE_ID,
            SENTENCES_COLLECTION_ID,
            sentenceId
        );

        const material = await databases.getDocument(
            DATABASE_ID,
            MATERIALS_COLLECTION_ID,
            sentence.material_id
        );

        if (!material || material.user_id !== session.user.id) {
            return { error: 'Unauthorized' };
        }

        const currentContent = sentence.edited_content ?? sentence.content;
        
        if (splitIndex <= 0 || splitIndex >= currentContent.length) {
            return { error: 'Invalid split position' };
        }

        const firstPart = currentContent.substring(0, splitIndex).trim();
        const secondPart = currentContent.substring(splitIndex).trim();

        if (!firstPart || !secondPart) {
            return { error: 'Split results in empty sentence' };
        }

        // Estimate time split based on character count ratio
        const totalDuration = sentence.end_time - sentence.start_time;
        const splitRatio = firstPart.length / currentContent.length;
        const splitTime = sentence.start_time + (totalDuration * splitRatio);

        // Update first sentence
        // Build update payload - only include edited_content if the attribute exists in schema
        const supportsEditedContent = 'edited_content' in sentence;
        const splitUpdatePayload: Record<string, any> = {
            content: firstPart,
            end_time: splitTime
        };
        if (supportsEditedContent) {
            splitUpdatePayload.edited_content = null;
        }
        
        await databases.updateDocument(
            DATABASE_ID,
            SENTENCES_COLLECTION_ID,
            sentenceId,
            splitUpdatePayload
        );

        // Insert second sentence
        const newSentence = await databases.createDocument(
            DATABASE_ID,
            SENTENCES_COLLECTION_ID,
            ID.unique(),
            {
                material_id: sentence.material_id,
                content: secondPart,
                start_time: splitTime,
                end_time: sentence.end_time,
                order: sentence.order // Same order, rely on start_time for secondary sort
            }
        );

        // Update vocab for both
        // 1. First sentence (already updated content, need to refresh vocab)
        const oldOccurrences = await databases.listDocuments(
            DATABASE_ID,
            WORD_OCCURRENCES_COLLECTION_ID,
            [Query.equal('sentence_id', sentenceId)]
        );
        await Promise.all(oldOccurrences.documents.map(doc => 
            databases.deleteDocument(DATABASE_ID, WORD_OCCURRENCES_COLLECTION_ID, doc.$id)
        ));

        const tokens1 = tokenizeWithPositions(firstPart);
        const rawToWordId1 = await upsertWordsForTokens(session.user.id, tokens1.map(t => t.word));
        const occ1 = tokens1.map(t => {
            const wordId = rawToWordId1.get(t.word);
            if (!wordId) return null;
            return { word_id: wordId, sentence_id: sentenceId, start_index: t.startIndex, end_index: t.endIndex };
        }).filter(Boolean);
        
        if (occ1.length > 0) {
            await Promise.all(occ1.map(o => 
                databases.createDocument(DATABASE_ID, WORD_OCCURRENCES_COLLECTION_ID, ID.unique(), o as any)
            ));
        }

        // 2. Second sentence
        const tokens2 = tokenizeWithPositions(secondPart);
        const rawToWordId2 = await upsertWordsForTokens(session.user.id, tokens2.map(t => t.word));
        const occ2 = tokens2.map(t => {
            const wordId = rawToWordId2.get(t.word);
            if (!wordId) return null;
            return { word_id: wordId, sentence_id: newSentence.$id, start_index: t.startIndex, end_index: t.endIndex };
        }).filter(Boolean);
        
        if (occ2.length > 0) {
            await Promise.all(occ2.map(o => 
                databases.createDocument(DATABASE_ID, WORD_OCCURRENCES_COLLECTION_ID, ID.unique(), o as any)
            ));
        }

        revalidatePath('/materials');
        revalidatePath(`/materials/${sentence.material_id}`);

        return { success: true };
    } catch (error) {
        console.error('Failed to split sentence', error);
        return { error: 'Failed to split sentence' };
    }
}