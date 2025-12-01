'use server';

import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { startOfDay } from 'date-fns';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';
import { 
  getCached, 
  setCached, 
  generateCacheKey, 
  CACHE_KEYS,
  invalidateVocabCache 
} from '@/lib/redis';

const execFileAsync = promisify(execFile);
const INTERNAL_REVALIDATE_TOKEN = process.env.INTERNAL_REVALIDATE_TOKEN;

function safeRevalidate(paths: string[]) {
    for (const path of paths) {
        try {
            revalidatePath(path);
        } catch (err) {
            console.warn(`[revalidate] Failed for ${path}:`, err);
        }
    }
}

const revalidateInBackground = async (paths: string[]) => {
    const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.SITE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${process.env.PORT || 3000}`);

    try {
        await fetch(`${baseUrl}/api/revalidate-paths`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(INTERNAL_REVALIDATE_TOKEN ? { 'x-revalidate-token': INTERNAL_REVALIDATE_TOKEN } : {}),
            },
            body: JSON.stringify({ paths }),
        });
    } catch (err) {
        console.warn('[revalidate] Background revalidation failed:', err);
    }
};

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
  
  const client = supabaseAdmin || supabase;

    // 1. Get sentences
    const { data: material, error: materialError } = await client
        .from('materials')
        .select('*, sentences:sentences(*)')
        .eq('id', materialId)
        .single();

    if (materialError || !material) {
        console.error(`[extractVocabulary] Material not found: ${materialId}`);
        return { error: 'Material not found' };
    }
    
    // Sentences might be null or array, handle it
    const sentences = (material.sentences || []).filter((s: any) => !s.deleted_at);
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
                    sentenceId: sentence.id, 
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
    // We need to get lemmas from raw words first via dictionary, then check DB
    // But optimization: batch query dictionary, then batch check DB
    
    const batchSize = 100;
    let dictResults: Record<string, any> = {};
    
    for (let i = 0; i < rawWordList.length; i += batchSize) {
        const batch = rawWordList.slice(i, i + batchSize);
        const batchRes = await queryDictionary(batch);
        dictResults = { ...dictResults, ...batchRes };
    }
    
    // Build lemma map
    const lemmaMap = new Map<string, any>(); // lemmaText -> dict data
    const rawToLemma = new Map<string, string>(); // raw word -> lemma text
    
    for (const raw of rawWordList) {
        const data = dictResults[raw];
        if (data) {
            const lemma = data.word; 
            lemmaMap.set(lemma, data);
            rawToLemma.set(raw, lemma);
        }
    }
    
    const lemmaTexts = Array.from(lemmaMap.keys());
    console.log(`[extractVocabulary] Found ${lemmaTexts.length} unique lemmas.`);

    // 4. Check which lemmas already exist in database
    // Batch query to find existing words (exclude soft-deleted ones)
    const existingWords = new Map<string, string>(); // text -> id
    
    if (lemmaTexts.length > 0) {
        // Query in batches to avoid hitting query limits
        for (let i = 0; i < lemmaTexts.length; i += 500) {
            const batch = lemmaTexts.slice(i, i + 500);
            const { data: existingBatch } = await client
                .from('words')
                .select('id, text')
                .in('text', batch)
                .is('deleted_at', null);  // Only get non-deleted words
            
            if (existingBatch) {
                for (const word of existingBatch) {
                    existingWords.set(word.text, word.id);
                }
            }
        }
    }
    
    console.log(`[extractVocabulary] Found ${existingWords.size} existing words in database.`);
    const newLemmasToInsert = lemmaTexts.filter(text => !existingWords.has(text));
    console.log(`[extractVocabulary] Need to insert ${newLemmasToInsert.length} new words.`);

    // 5. Insert only new words (words that don't exist in database)
    const lemmaToId = new Map<string, string>(existingWords); // Start with existing
    
    // Batch insert new words for better performance
    const wordsToInsert = [];
    for (const lemma of newLemmasToInsert) {
        const d = lemmaMap.get(lemma);
        if (!d) continue;
        
        wordsToInsert.push({
            id: randomUUID(),
            text: lemma,
            phonetic: d.phonetic,
            translation: d.translation,
            pos: d.pos,
            definition: d.definition,
            collins: d.collins ? Number(d.collins) : null,
            oxford: d.oxford ? Number(d.oxford) : null,
            tag: d.tag,
            bnc: d.bnc ? Number(d.bnc) : null,
            frq: d.frq ? Number(d.frq) : null,
            exchange: d.exchange,
            audio: d.audio,
            detail: d.detail ? JSON.stringify(d.detail) : null,
            deleted_at: null,
        });
    }

    // Insert words in batches
    if (wordsToInsert.length > 0) {
        for (let i = 0; i < wordsToInsert.length; i += 100) {
            const batch = wordsToInsert.slice(i, i + 100);
            const { error: insertError } = await client
                .from('words')
                .upsert(batch, { onConflict: 'text', ignoreDuplicates: true });

            if (insertError) {
                console.error("Failed to insert word batch:", insertError);
            }
        }
        
        // After insertion, query back to get the actual IDs (handles race conditions)
        const insertedTexts = wordsToInsert.map(w => w.text);
        for (let i = 0; i < insertedTexts.length; i += 500) {
            const batch = insertedTexts.slice(i, i + 500);
            const { data: insertedWords } = await client
                .from('words')
                .select('id, text')
                .in('text', batch)
                .is('deleted_at', null);
            
            if (insertedWords) {
                for (const word of insertedWords) {
                    lemmaToId.set(word.text, word.id);
                }
            }
        }
    }
    
    console.log(`[extractVocabulary] Total words in lemmaToId: ${lemmaToId.size}`);

    // 6. Create/Update UserWordStatus for this user
    // Only create NEW status if user doesn't have one for this word
    let newWordsCount = 0;
    const wordIdsToCheck = Array.from(lemmaToId.values());
    
    // Batch check existing statuses
    const existingStatuses = new Set<string>(); // word_ids that already have status for this user
    
    if (wordIdsToCheck.length > 0) {
        for (let i = 0; i < wordIdsToCheck.length; i += 500) {
            const batch = wordIdsToCheck.slice(i, i + 500);
            const { data: statusBatch } = await client
                .from('user_word_statuses')
                .select('word_id')
                .eq('user_id', session.user.id)
                .in('word_id', batch);
            
            if (statusBatch) {
                for (const s of statusBatch) {
                    existingStatuses.add(s.word_id);
                }
            }
        }
    }
    
    // Create statuses for words that don't have one
    const statusesToInsert = [];
    for (const wordId of wordIdsToCheck) {
        if (!existingStatuses.has(wordId)) {
            statusesToInsert.push({
                id: randomUUID(),
                user_id: session.user.id,
                word_id: wordId,
                status: "NEW",
                updated_at: new Date().toISOString()
            });
        }
    }
    
    if (statusesToInsert.length > 0) {
        // Batch insert in chunks - use upsert with ignoreDuplicates to handle race conditions
        for (let i = 0; i < statusesToInsert.length; i += 500) {
            const batch = statusesToInsert.slice(i, i + 500);
            const { error: insertError } = await client
                .from('user_word_statuses')
                .upsert(batch, { 
                    onConflict: 'user_id,word_id',
                    ignoreDuplicates: true 
                });
            
            if (insertError) {
                console.error("Error inserting word statuses:", insertError);
            }
        }
        newWordsCount = statusesToInsert.length;
    }
    
    console.log(`[extractVocabulary] Created ${newWordsCount} new word statuses for user.`);

    // 7. Create Word Occurrences (only for verified word IDs) with position info
    const occurrencesData = [];
    
    for (const { sentenceId, rawWord, startIndex, endIndex } of sentenceWords) {
        const lemma = rawToLemma.get(rawWord);
        if (lemma && lemmaToId.has(lemma)) {
            const wordId = lemmaToId.get(lemma)!;
            occurrencesData.push({
                id: randomUUID(),
                word_id: wordId,
                sentence_id: sentenceId,
                start_index: startIndex,
                end_index: endIndex,
            });
        }
    }
    
    console.log(`[extractVocabulary] Creating ${occurrencesData.length} word occurrences.`);
    
    if (occurrencesData.length > 0) {
        const sentenceIds = sentences.map((s: any) => s.id);
        
        // Delete existing occurrences for these sentences (re-processing case)
        await client
            .from('word_occurrences')
            .delete()
            .in('sentence_id', sentenceIds);

        // Batch insert new occurrences
        for (let i = 0; i < occurrencesData.length; i += 500) {
            const batch = occurrencesData.slice(i, i + 500);
            const { error: occError } = await client
                .from('word_occurrences')
                .insert(batch);
                
            if (occError) console.error("Error inserting occurrences:", occError);
        }
    }

    const endTime = Date.now();
    totalDuration = (endTime - startTime) / 1000;

    // Update Material with extraction time
    await client
        .from('materials')
        .update({ vocab_extraction_time: totalDuration })
        .eq('id', materialId);

    // 8. Update Daily Stats
    if (newWordsCount > 0) {
        const today = startOfDay(new Date()).toISOString();
        
        const { data: existingStat } = await client
            .from('daily_study_stats')
            .select('id, words_added')
            .eq('user_id', session.user.id)
            .eq('date', today)
            .maybeSingle();

        if (existingStat) {
            await client
                .from('daily_study_stats')
                .update({ words_added: existingStat.words_added + newWordsCount })
                .eq('id', existingStat.id);
        } else {
            await client
                .from('daily_study_stats')
                .insert({
                    id: randomUUID(),
                    user_id: session.user.id,
                    date: today,
                    words_added: newWordsCount
                });
        }
    }

    // Invalidate vocab cache after extraction
    await invalidateVocabCache(session.user.id);

    await revalidateInBackground([
        '/vocab',
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

    // Find all words associated with this material via sentences
    // Strategy:
    // 1. Get Sentence IDs for Material
    // 2. Get WordOccurrences for Sentence IDs -> Get Word IDs
    // 3. Get Words with Statuses

    const { data: sentences } = await supabase
        .from('sentences')
        .select('id')
        .eq('material_id', materialId)
        .is('deleted_at', null);
        
    if (!sentences || sentences.length === 0) return { words: [] };
    
    const sentenceIds = sentences.map(s => s.id);
    
    // Step 2: Get Word IDs from occurrences
    // Since we can't distinct easily in JS client without .csv() or extra processing, 
    // we fetch all occurrences and dedup in JS.
    // Or use .select('wordId')
    
    const { data: occurrences } = await supabase
        .from('word_occurrences')
        .select('word_id')
        .in('sentence_id', sentenceIds);
        
    if (!occurrences || occurrences.length === 0) return { words: [] };
    
    const wordIds = Array.from(new Set(occurrences.map(o => o.word_id)));
    
    // Step 3: Get Words and Status
    const { data: words, error } = await supabase
        .from('words')
        .select(`
            *,
            statuses:user_word_statuses(*)
        `)
        .in('id', wordIds)
        .is('deleted_at', null)
        .order('text', { ascending: true });
        
    if (error) return { error: 'Failed to fetch words' };

    // Filter statuses to only current user (Supabase left join returns all statuses unless filtered)
    // However, we can't easily filter the nested relation in .select() for ONE user without !inner.
    // If we use !inner, we only get words that HAVE a status. We want ALL words, but only User's status.
    // Post-processing is safer here.
    
    const wordsWithUserStatus = words?.map((word: any) => {
        const userStatus = word.statuses?.find((s: any) => s.user_id === session.user.id);
        return {
            ...word,
            statuses: userStatus ? [userStatus] : []
        };
    });

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
    minFrequency?: number;
    maxFrequency?: number;
    learningState?: number[]; // FSRS states: 0=New, 1=Learning, 2=Review, 3=Relearning
    dueFilter?: 'overdue' | 'today' | 'week' | 'month';
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

// Helper function with retry logic for Supabase requests
async function fetchWithRetry<T>(
    fetchFn: () => Promise<{ data: T | null; error: any }>,
    maxRetries: number = 3,
    delayMs: number = 500
): Promise<{ data: T | null; error: any }> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const result = await fetchFn();
        if (!result.error) return result;
        
        // Check if it's a retryable error (502, 503, etc.)
        const errorMessage = result.error?.message || '';
        if (errorMessage.includes('502') || errorMessage.includes('503') || errorMessage.includes('timeout')) {
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs * (attempt + 1)));
                continue;
            }
        }
        return result;
    }
    return { data: null, error: { message: 'Max retries exceeded' } };
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

    const client = supabaseAdmin || supabase;
    const userId = session.user.id;
    const offset = (page - 1) * pageSize;

    // Generate cache key
    const cacheKey = generateCacheKey(CACHE_KEYS.VOCAB_PAGINATED, {
        user_id: userId,
        page,
        pageSize,
        filters,
        sortBy,
        sortOrder
    });

    // Try to get from cache first
    const cached = await getCached<PaginatedVocabResult>(cacheKey);
    if (cached) {
        console.log('[getVocabPaginated] Cache hit');
        return cached;
    }

    console.log('[getVocabPaginated] Cache miss, fetching from database');

    try {
        // Step 1: Get user's material IDs first
        let materialsQuery = client
            .from('materials')
            .select('id')
            .eq('user_id', userId)
            .is('deleted_at', null);

        // Support both single materialId and multiple materialIds
        if (filters.materialIds && filters.materialIds.length > 0) {
            materialsQuery = materialsQuery.in('id', filters.materialIds);
        } else if (filters.materialId) {
            materialsQuery = materialsQuery.eq('id', filters.materialId);
        }

        const { data: materials, error: materialsError } = await materialsQuery;
        
        console.log('[getVocabPaginated] Materials found:', materials?.length, 'Error:', materialsError);
        
        const materialIds = (materials || []).map((m: any) => m.id);

        if (materialIds.length === 0) {
            console.log('[getVocabPaginated] No materials found, returning empty');
            const emptyResult: PaginatedVocabResult = {
                data: [],
                total: 0,
                page,
                pageSize,
                totalPages: 0,
                stats: { totalWords: 0, masteredWords: 0, learningWords: 0, newWords: 0, newWords24h: 0, masteredWords24h: 0, dueToday: 0, overdueWords: 0, averageRetention: 0 }
            };
            await setCached(cacheKey, emptyResult, 60);
            return emptyResult;
        }

        // Step 2: Get sentences for these materials - use larger batch size
        const MATERIAL_BATCH_SIZE = 100;
        const sentencePromises = [];
        
        for (let i = 0; i < materialIds.length; i += MATERIAL_BATCH_SIZE) {
            const batchMaterialIds = materialIds.slice(i, i + MATERIAL_BATCH_SIZE);
            sentencePromises.push(
                client
                    .from('sentences')
                    .select('id')
                    .in('material_id', batchMaterialIds)
                    .is('deleted_at', null)
            );
        }

        const sentenceResults = await Promise.all(sentencePromises);
        const allSentences = sentenceResults.flatMap(r => r.data || []);
        const sentenceIds = allSentences.map((s: any) => s.id);

        console.log('[getVocabPaginated] Sentences found:', sentenceIds.length);

        if (sentenceIds.length === 0) {
            console.log('[getVocabPaginated] No sentences found, returning empty');
            const emptyResult: PaginatedVocabResult = {
                data: [],
                total: 0,
                page,
                pageSize,
                totalPages: 0,
                stats: { totalWords: 0, masteredWords: 0, learningWords: 0, newWords: 0, newWords24h: 0, masteredWords24h: 0, dueToday: 0, overdueWords: 0, averageRetention: 0 }
            };
            await setCached(cacheKey, emptyResult, 60);
            return emptyResult;
        }

        // Step 3: Get word occurrences - use larger batch size and parallel requests
        const BATCH_SIZE = 200;
        const occurrencePromises = [];
        
        for (let i = 0; i < sentenceIds.length; i += BATCH_SIZE) {
            const batchIds = sentenceIds.slice(i, i + BATCH_SIZE);
            occurrencePromises.push(
                client
                    .from('word_occurrences')
                    .select('word_id, sentence_id')
                    .in('sentence_id', batchIds)
            );
        }

        const occurrenceResults = await Promise.all(occurrencePromises);
        const allOccurrences = occurrenceResults.flatMap(r => r.data || []);

        console.log('[getVocabPaginated] Occurrences found:', allOccurrences.length);

        if (allOccurrences.length === 0) {
            console.log('[getVocabPaginated] No occurrences found, returning empty');
            const emptyResult: PaginatedVocabResult = {
                data: [],
                total: 0,
                page,
                pageSize,
                totalPages: 0,
                stats: { totalWords: 0, masteredWords: 0, learningWords: 0, newWords: 0, newWords24h: 0, masteredWords24h: 0, dueToday: 0, overdueWords: 0, averageRetention: 0 }
            };
            await setCached(cacheKey, emptyResult, 60);
            return emptyResult;
        }

        // Group by word and count frequencies
        const wordFrequencyMap = new Map<string, { frequency: number; sentenceIds: string[] }>();
        allOccurrences.forEach((occ) => {
            const wordId = occ.word_id;
            if (!wordFrequencyMap.has(wordId)) {
                wordFrequencyMap.set(wordId, { frequency: 0, sentenceIds: [] });
            }
            const entry = wordFrequencyMap.get(wordId)!;
            entry.frequency++;
            entry.sentenceIds.push(occ.sentence_id);
        });

        const wordIds = Array.from(wordFrequencyMap.keys());

        if (wordIds.length === 0) {
            const emptyResult: PaginatedVocabResult = {
                data: [],
                total: 0,
                page,
                pageSize,
                totalPages: 0,
                stats: { totalWords: 0, masteredWords: 0, learningWords: 0, newWords: 0, newWords24h: 0, masteredWords24h: 0, dueToday: 0, overdueWords: 0, averageRetention: 0 }
            };
            await setCached(cacheKey, emptyResult, 60);
            return emptyResult;
        }

        // Step 4 & 5: Get word details and user statuses in parallel
        const wordPromises = [];
        const statusPromises = [];
        
        for (let i = 0; i < wordIds.length; i += BATCH_SIZE) {
            const batchWordIds = wordIds.slice(i, i + BATCH_SIZE);
            wordPromises.push(
                client
                    .from('words')
                    .select('id, text, phonetic, translation, pos, definition, collins, oxford, tag, bnc, frq, exchange, audio, detail, deleted_at')
                    .in('id', batchWordIds)
                    .is('deleted_at', null)
            );
            statusPromises.push(
                client
                    .from('user_word_statuses')
                    .select('*')
                    .eq('user_id', userId)
                    .in('word_id', batchWordIds)
            );
        }

        // Execute all in parallel
        const [wordResults, statusResults] = await Promise.all([
            Promise.all(wordPromises),
            Promise.all(statusPromises)
        ]);

        const allWords = wordResults.flatMap(r => r.data || []);
        const allStatuses = statusResults.flatMap(r => r.data || []);

        const statusMap = new Map<string, any>();
        allStatuses.forEach((s: any) => statusMap.set(s.word_id, s));

        // Merge data
        let mergedWords: any[] = [];
        
        allWords.forEach((word) => {
            const freqData = wordFrequencyMap.get(word.id);
            const status = statusMap.get(word.id);
            
            mergedWords.push({
                id: word.id,
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
                statusCreatedAt: status?.created_at,
                statusUpdatedAt: status?.updated_at,
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

        // Cache the result for 2 minutes
        await setCached(cacheKey, result, 120);

        return result;
    } catch (error) {
        console.error('[getVocabPaginated] Error:', error);
        return { error: 'Failed to fetch vocabulary' };
    }
}