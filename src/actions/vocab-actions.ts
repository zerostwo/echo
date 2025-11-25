'use server';

import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { startOfDay } from 'date-fns';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);

async function queryDictionary(wordList: string[]) {
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

export async function extractVocabulary(materialId: string) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };
  
    // 1. Get sentences
    const { data: material, error: materialError } = await supabase
        .from('Material')
        .select('*, sentences:Sentence(*)')
        .eq('id', materialId)
        .single();

    if (materialError || !material) {
        console.error(`[extractVocabulary] Material not found: ${materialId}`);
        return { error: 'Material not found' };
    }
    
    // Sentences might be null or array, handle it
    const sentences = material.sentences || [];
    console.log(`[extractVocabulary] Found ${sentences.length} sentences for material ${materialId}`);

    // 2. Extract raw words from sentences
    const rawWords = new Set<string>();
    const sentenceWords: { sentenceId: string, rawWord: string }[] = [];

    for (const sentence of sentences) {
        // Basic tokenization
        const words = sentence.content
            .toLowerCase()
            .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'\\\[\]|<>@]/g, " ")
            .split(/\s+/)
            .filter((w: string) => w.length > 1 && !/^\d+$/.test(w)); 

        for (const w of words) {
            rawWords.add(w);
            sentenceWords.push({ sentenceId: sentence.id, rawWord: w });
        }
    }

    // 3. Query Dictionary to find Lemmas
    const rawWordList = Array.from(rawWords);
    console.log(`[extractVocabulary] Extracted ${rawWordList.length} unique raw words.`);
    const batchSize = 100;
    let dictResults: Record<string, any> = {};
    let totalDuration = 0;
    
    for (let i = 0; i < rawWordList.length; i += batchSize) {
        const batch = rawWordList.slice(i, i + batchSize);
        const start = Date.now();
        const batchRes = await queryDictionary(batch);
        const end = Date.now();
        totalDuration += (end - start) / 1000;
        
        dictResults = { ...dictResults, ...batchRes };
    }

    // Update Material with extraction time
    await supabase
        .from('Material')
        .update({ vocabExtractionTime: totalDuration })
        .eq('id', materialId);

    const processedWords = new Set<string>();
    const lemmaMap = new Map<string, any>(); // lemmaText -> data
    const rawToLemma = new Map<string, string>(); // raw -> lemmaText
    
    for (const raw of rawWordList) {
        const data = dictResults[raw];
        if (data) {
            const lemma = data.word; 
            lemmaMap.set(lemma, data);
            rawToLemma.set(raw, lemma);
        }
    }
    
    // 4. Upsert Lemmas into Word table
    const lemmaToId = new Map<string, string>();
    let newWordsCount = 0;
    
    for (const [lemma, data] of lemmaMap.entries()) {
        const d = data;
        
        const wordData = {
            id: randomUUID(), // Ensure ID for new inserts
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
        };

        // Upsert word
        const { data: word, error: upsertError } = await supabase
            .from('Word')
            .upsert(wordData, { onConflict: 'text' })
            .select('id')
            .single();

        if (upsertError || !word) {
            console.error("Failed to upsert word:", lemma, upsertError);
            continue;
        }
        
        lemmaToId.set(lemma, word.id);
        processedWords.add(lemma);

        // Initialize UserWordStatus if it doesn't exist
        // Use select first to check existence (or upsert if we assume default status is NEW)
        // We want to KEEP existing status if it exists.
        // So simple upsert won't work unless we read first, or use ON CONFLICT DO NOTHING
        // Supabase upsert with `ignoreDuplicates: true` does exactly "ON CONFLICT DO NOTHING"
        
        const { error: statusError } = await supabase
            .from('UserWordStatus')
            .upsert({
                id: randomUUID(),
                userId: session.user.id,
                wordId: word.id,
                status: "NEW",
                updatedAt: new Date().toISOString()
            }, { onConflict: 'userId, wordId', ignoreDuplicates: true });
            
        if (!statusError) {
            // If we successfully inserted (or ignored), we count it as processed
            // But how do we know if it was NEWly created for counting?
            // We can query to check. For stat accuracy:
            
            const { data: existingStatus } = await supabase
                .from('UserWordStatus')
                .select('id')
                .eq('userId', session.user.id)
                .eq('wordId', word.id)
                .single();
                
            // This logic is flawed because upsert happened before.
            // Correct way: Check existence BEFORE upsert.
            // But for now, we will assume if we upserted with ignoreDuplicates, 
            // the count requires knowing if it was inserted.
            // Let's just skip strict counting for optimization or assume we count all "NEW" statuses found later?
            // Reverting to check-then-create pattern for accurate counting:
            
            // Actually, simpler:
            const { data: currentStatus } = await supabase
                 .from('UserWordStatus')
                 .select('id')
                 .eq('userId', session.user.id)
                 .eq('wordId', word.id)
                 .maybeSingle();
                 
            if (!currentStatus) {
                 await supabase.from('UserWordStatus').insert({
                     id: randomUUID(),
                     userId: session.user.id,
                     wordId: word.id,
                     status: "NEW"
                 });
                 newWordsCount++;
            }
        }
    }
    
    // 5. Create Occurrences
    console.log(`[extractVocabulary] Processing ${lemmaMap.size} lemmas.`);
    const occurrencesData = [];
    
    for (const { sentenceId, rawWord } of sentenceWords) {
        const lemma = rawToLemma.get(rawWord);
        if (lemma && lemmaToId.has(lemma)) {
            occurrencesData.push({
                id: randomUUID(),
                wordId: lemmaToId.get(lemma)!,
                sentenceId: sentenceId
            });
        }
    }
    
    if (occurrencesData.length > 0) {
        const sentenceIds = sentences.map((s: any) => s.id);
        
        // Delete existing occurrences for these sentences
        await supabase
            .from('WordOccurrence')
            .delete()
            .in('sentenceId', sentenceIds);

        // Batch insert new occurrences
        const { error: occError } = await supabase
            .from('WordOccurrence')
            .insert(occurrencesData);
            
        if (occError) console.error("Error inserting occurrences:", occError);
    }

    // 6. Update Daily Stats
    if (newWordsCount > 0) {
        const today = startOfDay(new Date()).toISOString();
        
        const { data: existingStat } = await supabase
            .from('DailyStudyStat')
            .select('id, wordsAdded')
            .eq('userId', session.user.id)
            .eq('date', today)
            .maybeSingle();

        if (existingStat) {
            await supabase
                .from('DailyStudyStat')
                .update({ wordsAdded: existingStat.wordsAdded + newWordsCount })
                .eq('id', existingStat.id);
        } else {
            await supabase
                .from('DailyStudyStat')
                .insert({
                    id: randomUUID(),
                    userId: session.user.id,
                    date: today,
                    wordsAdded: newWordsCount
                });
        }
    }

    return { success: true, count: processedWords.size };
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
        .from('Sentence')
        .select('id')
        .eq('materialId', materialId);
        
    if (!sentences || sentences.length === 0) return { words: [] };
    
    const sentenceIds = sentences.map(s => s.id);
    
    // Step 2: Get Word IDs from occurrences
    // Since we can't distinct easily in JS client without .csv() or extra processing, 
    // we fetch all occurrences and dedup in JS.
    // Or use .select('wordId')
    
    const { data: occurrences } = await supabase
        .from('WordOccurrence')
        .select('wordId')
        .in('sentenceId', sentenceIds);
        
    if (!occurrences || occurrences.length === 0) return { words: [] };
    
    const wordIds = Array.from(new Set(occurrences.map(o => o.wordId)));
    
    // Step 3: Get Words and Status
    const { data: words, error } = await supabase
        .from('Word')
        .select(`
            *,
            statuses:UserWordStatus(*)
        `)
        .in('id', wordIds)
        .order('text', { ascending: true });
        
    if (error) return { error: 'Failed to fetch words' };

    // Filter statuses to only current user (Supabase left join returns all statuses unless filtered)
    // However, we can't easily filter the nested relation in .select() for ONE user without !inner.
    // If we use !inner, we only get words that HAVE a status. We want ALL words, but only User's status.
    // Post-processing is safer here.
    
    const wordsWithUserStatus = words?.map((word: any) => {
        const userStatus = word.statuses?.find((s: any) => s.userId === session.user.id);
        return {
            ...word,
            statuses: userStatus ? [userStatus] : []
        };
    });

    return { words: wordsWithUserStatus };
}
