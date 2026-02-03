'use server';

import { auth } from '@/auth';
import { getAdminClient, APPWRITE_DATABASE_ID, Query } from '@/lib/appwrite';
import { ID } from 'node-appwrite';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { startOfDay } from 'date-fns';
import { 
  getCached, 
  setCached, 
  generateCacheKey, 
  CACHE_PREFIXES,
  invalidateVocabCache,
  invalidateDashboardCache,
} from '@/lib/cache';
import { dedupe, generateDedupeKey } from '@/lib/dedupe';
import { chunkArray } from '@/lib/pagination';
import { withQueryLogging } from '@/lib/query-logger';
import { safeRevalidate, revalidateInBackground, revalidateVocabPaths } from '@/lib/revalidate';

const execFileAsync = promisify(execFile);

export async function queryDictionary(wordList: string[]) {
    if (wordList.length === 0) return {};

    const scriptPath = path.join(process.cwd(), 'scripts', 'query_dict.py');
    const pythonCmd = process.env.PYTHON_CMD || 'python3';
    
    console.log(`[queryDictionary] Processing ${wordList.length} words. Cmd: ${pythonCmd}, Script: ${scriptPath}`);
    
    try {
        // Increase buffer for large JSON output
        // Use execFile to avoid shell escaping issues
        console.log(`[queryDictionary] Executing command...`);
        const { stdout, stderr } = await execFileAsync(pythonCmd, [scriptPath, ...wordList], { maxBuffer: 1024 * 1024 * 10 });
        
        if (stderr && stderr.trim().length > 0) {
            // Some warnings might be printed to stderr, log them but don't fail if stdout is present
            console.warn('[queryDictionary] stderr:', stderr);
        }

        console.log(`[queryDictionary] Command finished. Stdout length: ${stdout.length}`);
        
        const result = JSON.parse(stdout);
        if (result.error) {
             console.error("[queryDictionary] Script returned error:", result.error);
             return {};
        }
        return result;
    } catch (e) {
        console.error("[queryDictionary] Failed:", e);
        return {};
    }
}

/**
 * Optimized vocabulary extraction with word reuse.
 * 
 * Strategy:
 * 1. Extract raw words from sentences
 * 2. Check database for existing words (by lemma text) - skip dictionary lookup for these
 * 3. Only query dictionary for words not in database
 * 4. Insert new words, reuse existing word IDs
 * 5. Create word occurrences linking words to sentences
 * 6. Words are NEVER deleted when material is deleted - only occurrences are removed
 */
export async function extractVocabulary(materialId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };
  
  const admin = getAdminClient();

    // 1. Get sentences
    let material;
    try {
        material = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'materials', materialId);
    } catch (e) {
        console.error(`[extractVocabulary] Material not found: ${materialId}`);
        return { error: 'Material not found' };
    }

    const { documents: sentences } = await admin.databases.listDocuments(
        APPWRITE_DATABASE_ID,
        'sentences',
        [
            Query.equal('material_id', materialId),
            Query.isNull('deleted_at')
        ]
    );
    
    console.log(`[extractVocabulary] Found ${sentences.length} active sentences for material ${materialId}`);

    // 2. Extract raw words from sentences with position info for fill-in-blank feature
    const rawWords = new Set<string>();
    const sentenceWords: { sentenceId: string, rawWord: string, startIndex: number, endIndex: number }[] = [];

    for (const sentence of sentences) {
        // Use tokenization with positions
        const content = sentence.edited_content ?? sentence.content;
        
        // Match word characters (letters, apostrophes for contractions)
        const wordRegex = /[a-zA-Z']+/g;
        let match;
        
        while ((match = wordRegex.exec(content)) !== null) {
            const word = match[0].toLowerCase().replace(/'/g, ''); // Remove apostrophes for lookup
            // Skip if too short, only digits, or only apostrophes
            if (word.length > 1 && !/^\d+$/.test(word)) {
                rawWords.add(word);
                sentenceWords.push({ 
                    sentenceId: sentence.$id, 
                    rawWord: word,
                    startIndex: match.index,
                    endIndex: match.index + match[0].length,
                });
            }
        }
    }

    const rawWordList = Array.from(rawWords);
    console.log(`[extractVocabulary] Extracted ${rawWordList.length} unique raw words.`);
    
    let totalDuration = 0;
    const startTime = Date.now();

    // 3. First, check which lemmas already exist in database
    const batchSize = 100;
    let dictResults: Record<string, any> = {};
    
    for (let i = 0; i < rawWordList.length; i += batchSize) {
        const batch = rawWordList.slice(i, i + batchSize);
        const batchRes = await queryDictionary(batch);
        dictResults = { ...dictResults, ...batchRes };
    }
    
    // Build lemma map - include words without dictionary data
    const lemmaMap = new Map<string, any>(); // lemmaText -> dict data (may be null for unknown words)
    const rawToLemma = new Map<string, string>(); // raw word -> lemma text
    
    for (const raw of rawWordList) {
        const data = dictResults[raw];
        if (data) {
            // Word found in dictionary - use lemma from dictionary
            const lemma = data.word; 
            lemmaMap.set(lemma, data);
            rawToLemma.set(raw, lemma);
        } else {
            // Word not in dictionary - use raw word as lemma
            // This ensures all words from the material are tracked
            if (!lemmaMap.has(raw)) {
                lemmaMap.set(raw, null); // null indicates no dictionary data
            }
            rawToLemma.set(raw, raw);
        }
    }
    
    const lemmaTexts = Array.from(lemmaMap.keys());
    console.log(`[extractVocabulary] Found ${lemmaTexts.length} unique lemmas (${lemmaMap.size - Object.keys(dictResults).length} without dictionary data).`);

    // 4. Check which lemmas already exist in database
    const existingWords = new Map<string, string>(); // text -> id
    
    if (lemmaTexts.length > 0) {
        // Query in batches (smaller batch for Appwrite URL limit)
        for (let i = 0; i < lemmaTexts.length; i += 50) {
            const batch = lemmaTexts.slice(i, i + 50);
            const { documents: existingBatch } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'words',
                [
                    Query.equal('text', batch),
                    Query.isNull('deleted_at')
                ]
            );
            
            for (const word of existingBatch) {
                existingWords.set(word.text, word.$id);
            }
        }
    }
    
    console.log(`[extractVocabulary] Found ${existingWords.size} existing words in database.`);
    const newLemmasToInsert = lemmaTexts.filter(text => !existingWords.has(text));
    console.log(`[extractVocabulary] Need to insert ${newLemmasToInsert.length} new words.`);

    // 5. Insert only new words
    const lemmaToId = new Map<string, string>(existingWords); // Start with existing
    
    const wordsToInsert = [];
    for (const lemma of newLemmasToInsert) {
        const d = lemmaMap.get(lemma);
        // Create word even if no dictionary data (d is null)
        // This ensures all words from the material are tracked
        wordsToInsert.push({
            text: lemma,
            phonetic: d?.phonetic || null,
            translation: d?.translation || null,
            pos: d?.pos || null,
            definition: d?.definition || null,
            deleted_at: null,
        });
    }

    // Insert words in batches (loop)
    if (wordsToInsert.length > 0) {
        for (const word of wordsToInsert) {
            try {
                const doc = await admin.databases.createDocument(
                    APPWRITE_DATABASE_ID,
                    'words',
                    ID.unique(),
                    word
                );
                lemmaToId.set(word.text, doc.$id);
            } catch (e: any) {
                if (e.code === 409) {
                    // Already exists, fetch it
                    const { documents } = await admin.databases.listDocuments(
                        APPWRITE_DATABASE_ID,
                        'words',
                        [Query.equal('text', word.text)]
                    );
                    if (documents.length > 0) {
                        lemmaToId.set(word.text, documents[0].$id);
                    }
                } else {
                    console.error("Failed to insert word:", e);
                }
            }
        }
    }
    
    console.log(`[extractVocabulary] Total words in lemmaToId: ${lemmaToId.size}`);

    // 6. Create/Update UserWordStatus for this user
    let newWordsCount = 0;
    const wordIdsToCheck = Array.from(lemmaToId.values());
    
    // Batch check existing statuses
    const existingStatuses = new Set<string>(); 
    
    if (wordIdsToCheck.length > 0) {
        for (let i = 0; i < wordIdsToCheck.length; i += 50) {
            const batch = wordIdsToCheck.slice(i, i + 50);
            const { documents: statusBatch } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'user_word_statuses',
                [
                    Query.equal('user_id', session.user.id),
                    Query.equal('word_id', batch)
                ]
            );
            
            for (const s of statusBatch) {
                existingStatuses.add(s.word_id);
            }
        }
    }
    
    // Create statuses for words that don't have one
    const statusesToInsert = [];
    for (const wordId of wordIdsToCheck) {
        if (!existingStatuses.has(wordId)) {
            statusesToInsert.push({
                user_id: session.user.id,
                word_id: wordId,
                status: "NEW"
            });
        }
    }
    
    if (statusesToInsert.length > 0) {
        for (const status of statusesToInsert) {
            try {
                await admin.databases.createDocument(
                    APPWRITE_DATABASE_ID,
                    'user_word_statuses',
                    ID.unique(),
                    status
                );
            } catch (e: any) {
                if (e.code !== 409) console.error("Error inserting status:", e);
            }
        }
        newWordsCount = statusesToInsert.length;
    }
    
    console.log(`[extractVocabulary] Created ${newWordsCount} new word statuses for user.`);

    // 7. Create Word Occurrences
    const occurrencesData = [];
    
    for (const { sentenceId, rawWord, startIndex, endIndex } of sentenceWords) {
        const lemma = rawToLemma.get(rawWord);
        if (lemma && lemmaToId.has(lemma)) {
            const wordId = lemmaToId.get(lemma)!;
            occurrencesData.push({
                word_id: wordId,
                sentence_id: sentenceId,
                start_index: startIndex,
                end_index: endIndex,
            });
        }
    }
    
    console.log(`[extractVocabulary] Creating ${occurrencesData.length} word occurrences.`);
    
    if (occurrencesData.length > 0) {
        const sentenceIds = sentences.map((s: any) => s.$id);
        
        // Delete existing occurrences
        for (let i = 0; i < sentenceIds.length; i += 50) {
            const batchIds = sentenceIds.slice(i, i + 50);
            const { documents: occs } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'word_occurrences',
                [
                    Query.equal('sentence_id', batchIds),
                    Query.limit(5000)
                ]
            );
            
            await Promise.all(occs.map(o => admin.databases.deleteDocument(APPWRITE_DATABASE_ID, 'word_occurrences', o.$id)));
        }

        // Insert new occurrences
        for (const occ of occurrencesData) {
             await admin.databases.createDocument(APPWRITE_DATABASE_ID, 'word_occurrences', ID.unique(), occ);
        }
    }

    const endTime = Date.now();
    totalDuration = (endTime - startTime) / 1000;

    // Note: vocab_extraction_time field doesn't exist in Appwrite schema
    // Just log the extraction time instead
    console.log(`[extractVocabulary] Extraction completed in ${totalDuration}s`);

    // 8. Update Daily Stats
    if (newWordsCount > 0) {
        const today = startOfDay(new Date()).toISOString();
        
        const { documents: existingStats } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'daily_study_stats',
            [
                Query.equal('user_id', session.user.id),
                Query.equal('date', today)
            ]
        );
        const existingStat = existingStats[0];

        if (existingStat) {
            await admin.databases.updateDocument(
                APPWRITE_DATABASE_ID,
                'daily_study_stats',
                existingStat.$id,
                { words_added: existingStat.words_added + newWordsCount }
            );
        } else {
            await admin.databases.createDocument(
                APPWRITE_DATABASE_ID,
                'daily_study_stats',
                ID.unique(),
                {
                    user_id: session.user.id,
                    date: today,
                    words_added: newWordsCount
                }
            );
        }
    }

    // Invalidate vocab cache after extraction
    await invalidateVocabCache(session.user.id);

    await revalidateInBackground([
        '/words',
        '/materials',
        `/materials/${materialId}`
    ]);

    console.log(`[extractVocabulary] Completed in ${totalDuration.toFixed(2)}s. ` +
        `Processed ${lemmaToId.size} words, ${newWordsCount} new for user.`);
    
    return { 
        success: true, 
        count: lemmaToId.size,
        newWords: newWordsCount,
        reusedWords: lemmaToId.size - newLemmasToInsert.length
    };
}

export async function getMaterialVocab(materialId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const admin = getAdminClient();

    // 1. Get all sentences for this material
    const { documents: sentences } = await admin.databases.listDocuments(
        APPWRITE_DATABASE_ID,
        'sentences',
        [
            Query.equal('material_id', materialId),
            Query.isNull('deleted_at'),
            Query.limit(5000)
        ]
    );

    if (!sentences?.length) return { words: [] };
    const sentenceIds = sentences.map(s => s.$id);

    // 2. Get all word occurrences in these sentences
    // Must batch query with explicit limit (Appwrite default is only 25)
    const occurrences: any[] = [];
    for (let i = 0; i < sentenceIds.length; i += 50) {
        const batch = sentenceIds.slice(i, i + 50);
        const { documents } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'word_occurrences',
            [
                Query.equal('sentence_id', batch),
                Query.limit(5000)
            ]
        );
        occurrences.push(...documents);
    }

    if (!occurrences.length) return { words: [] };
    
    const wordIds = Array.from(new Set(occurrences.map(o => o.word_id)));

    // 3. Get words and statuses
    // Batch fetch words
    const wordsMap = new Map();
    for (let i = 0; i < wordIds.length; i += 50) {
        const batch = wordIds.slice(i, i + 50);
        const { documents } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'words',
            [Query.equal('$id', batch)]
        );
        for (const w of documents) wordsMap.set(w.$id, w);
    }

    // Batch fetch statuses
    const statusMap = new Map();
    for (let i = 0; i < wordIds.length; i += 50) {
        const batch = wordIds.slice(i, i + 50);
        const { documents } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'user_word_statuses',
            [
                Query.equal('user_id', session.user.id),
                Query.equal('word_id', batch)
            ]
        );
        for (const s of documents) statusMap.set(s.word_id, s);
    }

    // Combine
    const wordsWithUserStatus = wordIds.map(id => {
        const word = wordsMap.get(id);
        const status = statusMap.get(id);
        if (!word) return null;
        
        return {
            ...word,
            statuses: status ? [status] : [],
            status: status?.status || 'NEW',
            next_review: status?.next_review,
            occurrences: occurrences.filter(o => o.word_id === id)
        };
    }).filter(Boolean);

    // Sort by text
    wordsWithUserStatus.sort((a: any, b: any) => a.text.localeCompare(b.text));

    return { words: wordsWithUserStatus };
}

/**
 * Get paginated vocabulary with server-side pagination
 */
export interface VocabFilters {
    search?: string;
    status?: string[];
    collins?: number[];
    oxford?: boolean;
    materialId?: string;
    materialIds?: string[]; // Multi-select material filter
    dictionaryId?: string; // Filter by dictionary
    minFrequency?: number;
    maxFrequency?: number;
    learningState?: number[]; // FSRS states: 0=New, 1=Learning, 2=Review, 3=Relearning
    dueFilter?: 'overdue' | 'today' | 'week' | 'month';
    domain?: string[];
    pos?: string[];
    showMastered?: boolean;
}

export interface PaginatedVocabResult {
    data: any[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    stats: {
        totalWords: number;
        masteredWords: number;
        learningWords: number;
        newWords: number;
        newWords24h: number;
        masteredWords24h: number;
        dueToday: number;
        overdueWords: number;
        averageRetention: number;
    };
}


export async function getVocabPaginated(
    page: number = 1,
    pageSize: number = 10,
    filters: VocabFilters = {},
    sortBy: string = 'updated_at',
    sortOrder: 'asc' | 'desc' = 'desc'
): Promise<PaginatedVocabResult | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const userId = session.user.id;
    const offset = (page - 1) * pageSize;

    // Generate cache and dedupe keys
    const cacheKey = generateCacheKey(CACHE_PREFIXES.VOCAB_PAGINATED, {
        user_id: userId,
        page,
        pageSize,
        filters,
        sortBy,
        sortOrder
    });

    const dedupeKey = generateDedupeKey('getVocabPaginated', {
        user_id: userId,
        page,
        pageSize,
        filters,
        sortBy,
        sortOrder
    });

    // Try to get from cache first
    const cached = getCached<PaginatedVocabResult>(cacheKey);
    if (cached) {
        return cached;
    }

    // Use dedupe to prevent concurrent identical requests
    return dedupe(dedupeKey, async () => {
        // Double-check cache after acquiring dedupe lock
        const cachedAfterLock = getCached<PaginatedVocabResult>(cacheKey);
        if (cachedAfterLock) {
            return cachedAfterLock;
        }

        return withQueryLogging('getVocabPaginated', async () => {
            const admin = getAdminClient();

            const wordFrequencyMap = new Map<string, { frequency: number; sentenceIds: string[] }>();
        let dictionaryWordIds: string[] | null = null;

        // Step 0: Get Dictionary Words if needed
        if (filters.dictionaryId) {
            const { documents: dictWords } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'dictionary_words',
                [Query.equal('dictionary_id', filters.dictionaryId)]
            );
            dictionaryWordIds = dictWords.map(dw => dw.word_id);
        }

        // Step 1: Get words from Materials (calculate frequency)
        // Get user's material IDs first
        let materialIds: string[] = [];
        
        if (filters.materialIds && filters.materialIds.length > 0) {
            materialIds = filters.materialIds;
        } else if (filters.materialId) {
            materialIds = [filters.materialId];
        } else {
            // Fetch all user materials
            const { documents: materials } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'materials',
                [
                    Query.equal('user_id', userId),
                    Query.isNull('deleted_at')
                ]
            );
            materialIds = materials.map(m => m.$id);
        }

        if (materialIds.length > 0) {
            // Get sentences for these materials - use larger batch size
            const sentenceIds: string[] = [];
            
            // Batch fetch sentences
            for (let i = 0; i < materialIds.length; i += 50) {
                const batch = materialIds.slice(i, i + 50);
                const { documents: sentences } = await admin.databases.listDocuments(
                    APPWRITE_DATABASE_ID,
                    'sentences',
                    [
                        Query.equal('material_id', batch),
                        Query.isNull('deleted_at'),
                        Query.limit(5000)
                    ]
                );
                sentenceIds.push(...sentences.map(s => s.$id));
            }

            if (sentenceIds.length > 0) {
                // Get word occurrences - use larger batch size with explicit limit
                const allOccurrences: any[] = [];
                
                for (let i = 0; i < sentenceIds.length; i += 50) {
                    const batchIds = sentenceIds.slice(i, i + 50);
                    const { documents: occs } = await admin.databases.listDocuments(
                        APPWRITE_DATABASE_ID,
                        'word_occurrences',
                        [
                            Query.equal('sentence_id', batchIds),
                            Query.limit(5000) // Must specify limit, Appwrite default is only 25
                        ]
                    );
                    allOccurrences.push(...occs);
                }

                // Group by word and count frequencies
                allOccurrences.forEach((occ) => {
                    const wordId = occ.word_id;
                    
                    // If dictionary filter is active, only count if word is in dictionary
                    if (dictionaryWordIds && !dictionaryWordIds.includes(wordId)) {
                        return;
                    }

                    if (!wordFrequencyMap.has(wordId)) {
                        wordFrequencyMap.set(wordId, { frequency: 0, sentenceIds: [] });
                    }
                    const entry = wordFrequencyMap.get(wordId)!;
                    entry.frequency++;
                    entry.sentenceIds.push(occ.sentence_id);
                });
            }
        }

        // Step 2: Determine final word list
        let wordIds: string[] = [];

        if (dictionaryWordIds) {
            // Use dictionary words
            wordIds = dictionaryWordIds;
            // Ensure they are in map for consistency (even if freq is 0)
            wordIds.forEach(wid => {
                if (!wordFrequencyMap.has(wid)) {
                    wordFrequencyMap.set(wid, { frequency: 0, sentenceIds: [] });
                }
            });
        } else {
            // Use words from materials AND all user dictionaries
            
            // Fetch words from ALL user dictionaries to include in global vocab
            const { documents: userDicts } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'dictionaries',
                [Query.equal('user_id', userId)]
            );
                
            if (userDicts.length > 0) {
                 const dictIds = userDicts.map(d => d.$id);
                 // Batch fetch dictionary words
                 for (let i = 0; i < dictIds.length; i += 50) {
                     const batch = dictIds.slice(i, i + 50);
                     const { documents: dictWords } = await admin.databases.listDocuments(
                        APPWRITE_DATABASE_ID,
                        'dictionary_words',
                        [Query.equal('dictionary_id', batch)]
                     );
                     
                     for (const dw of dictWords) {
                        if (!wordFrequencyMap.has(dw.word_id)) {
                            wordFrequencyMap.set(dw.word_id, { frequency: 0, sentenceIds: [] });
                        }
                     }
                 }
            }
            
            wordIds = Array.from(wordFrequencyMap.keys());
        }

            if (wordIds.length === 0) {
                const emptyResult: PaginatedVocabResult = {
                    data: [],
                    total: 0,
                    page,
                    pageSize,
                    totalPages: 0,
                    stats: { totalWords: 0, masteredWords: 0, learningWords: 0, newWords: 0, newWords24h: 0, masteredWords24h: 0, dueToday: 0, overdueWords: 0, averageRetention: 0 }
                };
                setCached(cacheKey, emptyResult, 60000);
                return emptyResult;
            }

        // Step 4 & 5: Get word details and user statuses in parallel
        const allWords: any[] = [];
        const allStatuses: any[] = [];
        
        // Batch fetch words and statuses
        for (let i = 0; i < wordIds.length; i += 50) {
            const batchWordIds = wordIds.slice(i, i + 50);
            
            const [wordsRes, statusesRes] = await Promise.all([
                admin.databases.listDocuments(
                    APPWRITE_DATABASE_ID,
                    'words',
                    [
                        Query.equal('$id', batchWordIds),
                        Query.isNull('deleted_at')
                    ]
                ),
                admin.databases.listDocuments(
                    APPWRITE_DATABASE_ID,
                    'user_word_statuses',
                    [
                        Query.equal('user_id', userId),
                        Query.equal('word_id', batchWordIds)
                    ]
                )
            ]);
            
            allWords.push(...wordsRes.documents);
            allStatuses.push(...statusesRes.documents);
        }

        const statusMap = new Map<string, any>();
        allStatuses.forEach((s: any) => statusMap.set(s.word_id, s));

        // Merge data
        let mergedWords: any[] = [];
        
        allWords.forEach((word) => {
            const freqData = wordFrequencyMap.get(word.$id);
            const status = statusMap.get(word.$id);
            
            mergedWords.push({
                id: word.$id,
                text: word.text,
                phonetic: word.phonetic,
                translation: word.translation,
                pos: word.pos,
                definition: word.definition,
                collins: word.collins,
                oxford: word.oxford,
                tag: word.tag,
                bnc: word.bnc,
                frq: word.frq,
                exchange: word.exchange,
                audio: word.audio,
                detail: word.detail,
                frequency: freqData?.frequency || 0,
                occurrences: (freqData?.sentenceIds || []).map(sid => ({ sentence_id: sid })),
                status: status?.status ?? 'NEW',
                statusCreatedAt: status?.$createdAt,
                statusUpdatedAt: status?.$updatedAt,
                // FSRS learning progress fields
                fsrsDue: status?.fsrs_due,
                fsrsReps: status?.fsrs_reps ?? 0,
                fsrsLapses: status?.fsrs_lapses ?? 0,
                fsrsState: status?.fsrs_state ?? 0, // 0=New, 1=Learning, 2=Review, 3=Relearning
                fsrsLastReview: status?.fsrs_last_review,
            });
        });

        // Calculate stats before filtering
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const todayEnd = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        
        const totalWords = mergedWords.length;
        const masteredWords = mergedWords.filter(w => w.status === 'MASTERED').length;
        const learningWords = mergedWords.filter(w => w.status === 'LEARNING').length;
        const newWords = mergedWords.filter(w => w.status === 'NEW').length;
        const newWords24h = mergedWords.filter(w => w.statusCreatedAt > oneDayAgo).length;
        const masteredWords24h = mergedWords.filter(w => w.status === 'MASTERED' && w.statusUpdatedAt > oneDayAgo).length;
        
        // Calculate due today and overdue
        const dueToday = mergedWords.filter(w => {
            if (!w.fsrsDue || w.fsrsState === 0) return false;
            const dueDate = new Date(w.fsrsDue);
            return dueDate >= today && dueDate < todayEnd;
        }).length;
        
        const overdueWords = mergedWords.filter(w => {
            if (!w.fsrsDue || w.fsrsState === 0) return false;
            const dueDate = new Date(w.fsrsDue);
            return dueDate < now;
        }).length;
        
        // Calculate average retention (based on words with reviews)
        const wordsWithReviews = mergedWords.filter(w => w.fsrsReps > 0);
        const avgRetention = wordsWithReviews.length > 0 
            ? wordsWithReviews.reduce((acc, w) => acc + (w.fsrsLapses > 0 ? 1 - (w.fsrsLapses / w.fsrsReps) : 1), 0) / wordsWithReviews.length * 100
            : 0;

        // Apply filters
        if (filters.search) {
            const searchLower = filters.search.toLowerCase();
            mergedWords = mergedWords.filter(w => 
                w.text?.toLowerCase().includes(searchLower) ||
                w.translation?.toLowerCase().includes(searchLower)
            );
        }

        if (filters.status && filters.status.length > 0) {
            mergedWords = mergedWords.filter(w => filters.status!.includes(w.status));
        }

        if (filters.collins && filters.collins.length > 0) {
            mergedWords = mergedWords.filter(w => filters.collins!.includes(w.collins));
        }

        if (filters.oxford === true) {
            mergedWords = mergedWords.filter(w => w.oxford === 1);
        } else if (filters.oxford === false) {
            mergedWords = mergedWords.filter(w => w.oxford !== 1);
        }

        // Frequency range filter
        if (filters.minFrequency !== undefined) {
            mergedWords = mergedWords.filter(w => w.frequency >= filters.minFrequency!);
        }
        if (filters.maxFrequency !== undefined) {
            mergedWords = mergedWords.filter(w => w.frequency <= filters.maxFrequency!);
        }

        // FSRS learning state filter
        if (filters.learningState && filters.learningState.length > 0) {
            mergedWords = mergedWords.filter(w => filters.learningState!.includes(w.fsrsState));
        }

        // Due filter
        if (filters.dueFilter) {
            const filterNow = new Date();
            const weekEnd = new Date(filterNow.getTime() + 7 * 24 * 60 * 60 * 1000);
            const monthEnd = new Date(filterNow.getTime() + 30 * 24 * 60 * 60 * 1000);
            
            mergedWords = mergedWords.filter(w => {
                if (!w.fsrsDue) return false;
                const dueDate = new Date(w.fsrsDue);
                
                switch (filters.dueFilter) {
                    case 'overdue':
                        return dueDate < filterNow;
                    case 'today':
                        return dueDate >= today && dueDate < todayEnd;
                    case 'week':
                        return dueDate <= weekEnd;
                    case 'month':
                        return dueDate <= monthEnd;
                    default:
                        return true;
                }
            });
        }

        // Domain filter
        if (filters.domain && filters.domain.length > 0) {
            mergedWords = mergedWords.filter(w => {
                if (!w.translation) return false;
                // Check if translation contains any of the selected domain tags
                // Domain tags are usually in format [医]
                return filters.domain!.some(domain => w.translation.includes(`[${domain}]`));
            });
        }

        // POS filter
        if (filters.pos && filters.pos.length > 0) {
            mergedWords = mergedWords.filter(w => {
                // Check pos column first
                if (w.pos && filters.pos!.some(p => w.pos.includes(p))) return true;
                
                // Also check translation for POS tags if pos column is empty or not matching
                if (w.translation && filters.pos!.some(p => w.translation.includes(p))) return true;
                
                return false;
            });
        }

        // Show/Hide Mastered words
        if (filters.showMastered === false) {
            mergedWords = mergedWords.filter(w => w.status !== 'MASTERED');
        }

        // Sort
        mergedWords.sort((a, b) => {
            let aVal: any, bVal: any;
            
            switch (sortBy) {
                case 'text':
                    aVal = a.text?.toLowerCase() || '';
                    bVal = b.text?.toLowerCase() || '';
                    break;
                case 'frequency':
                    aVal = a.frequency;
                    bVal = b.frequency;
                    break;
                case 'collins':
                    aVal = a.collins || 0;
                    bVal = b.collins || 0;
                    break;
                case 'fsrs_reps':
                    aVal = a.fsrsReps || 0;
                    bVal = b.fsrsReps || 0;
                    break;
                case 'fsrs_due':
                    // Handle nulls (not started)
                    // Treat null as very far future
                    const maxDate = 8640000000000000;
                    aVal = a.fsrsDue ? new Date(a.fsrsDue).getTime() : maxDate;
                    bVal = b.fsrsDue ? new Date(b.fsrsDue).getTime() : maxDate;
                    break;
                case 'updated_at':
                default:
                    aVal = new Date(a.statusUpdatedAt || 0).getTime();
                    bVal = new Date(b.statusUpdatedAt || 0).getTime();
                    break;
            }

            if (sortOrder === 'asc') {
                return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
            } else {
                return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
            }
        });

        // Paginate
        const total = mergedWords.length;
        const totalPages = Math.ceil(total / pageSize);
        const paginatedData = mergedWords.slice(offset, offset + pageSize);

            const result: PaginatedVocabResult = {
                data: paginatedData,
                total,
                page,
                pageSize,
                totalPages,
                stats: { 
                    totalWords, 
                    masteredWords, 
                    learningWords,
                    newWords,
                    newWords24h, 
                    masteredWords24h,
                    dueToday,
                    overdueWords,
                    averageRetention: Math.round(avgRetention),
                }
            };

            // Cache the result for 2 minutes (120000ms)
            setCached(cacheKey, result, 120000);

            return result;
        }, { user_id: userId, page, pageSize });
    });
}