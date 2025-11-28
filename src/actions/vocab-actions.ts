'use server';

import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { startOfDay } from 'date-fns';
import { randomUUID } from 'crypto';
import { revalidatePath } from 'next/cache';

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

    // 2. Extract raw words from sentences
    const rawWords = new Set<string>();
    const sentenceWords: { sentenceId: string, rawWord: string }[] = [];

    for (const sentence of sentences) {
        // Basic tokenization
        const content = sentence.edited_content ?? sentence.content;
        const words = content
            .toLowerCase()
            .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'\\\[\]|<>@]/g, " ")
            .split(/\s+/)
            .filter((w: string) => w.length > 1 && !/^\d+$/.test(w)); 

        for (const w of words) {
            rawWords.add(w);
            sentenceWords.push({ sentenceId: sentence.id, rawWord: w });
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

    // 7. Create Word Occurrences (only for verified word IDs)
    const occurrencesData = [];
    
    for (const { sentenceId, rawWord } of sentenceWords) {
        const lemma = rawToLemma.get(rawWord);
        if (lemma && lemmaToId.has(lemma)) {
            const wordId = lemmaToId.get(lemma)!;
            occurrencesData.push({
                id: randomUUID(),
                word_id: wordId,
                sentence_id: sentenceId
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
