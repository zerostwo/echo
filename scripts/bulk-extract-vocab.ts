#!/usr/bin/env npx tsx

/**
 * Bulk extract vocabulary for all processed materials
 * Run with: npx tsx scripts/bulk-extract-vocab.ts
 */

import { createClient } from '@supabase/supabase-js';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { randomUUID } from 'crypto';

const execFileAsync = promisify(execFile);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function queryDictionary(wordList: string[]) {
  if (wordList.length === 0) return {};

  const scriptPath = path.join(process.cwd(), 'scripts', 'query_dict.py');
  const pythonCmd = process.env.PYTHON_CMD || 'python3';

  try {
    const { stdout, stderr } = await execFileAsync(pythonCmd, [scriptPath, ...wordList], { 
      maxBuffer: 1024 * 1024 * 10 
    });

    if (stderr && stderr.trim().length > 0) {
      console.warn('[queryDictionary] stderr:', stderr);
    }

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

async function extractVocabularyForMaterial(materialId: string, userId: string) {
  // 1. Get sentences
  const { data: sentences, error: sentencesError } = await supabase
    .from('sentences')
    .select('id, content, edited_content')
    .eq('material_id', materialId)
    .is('deleted_at', null);

  if (sentencesError || !sentences || sentences.length === 0) {
    console.log(`  No sentences found for material ${materialId}`);
    return { count: 0, newWords: 0 };
  }

  console.log(`  Found ${sentences.length} sentences`);

  // 2. Extract raw words from sentences
  const rawWords = new Set<string>();
  const sentenceWords: { sentenceId: string, rawWord: string }[] = [];

  for (const sentence of sentences) {
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
  console.log(`  Extracted ${rawWordList.length} unique raw words`);

  if (rawWordList.length === 0) {
    return { count: 0, newWords: 0 };
  }

  // 3. Query dictionary in batches
  const batchSize = 100;
  let dictResults: Record<string, any> = {};

  for (let i = 0; i < rawWordList.length; i += batchSize) {
    const batch = rawWordList.slice(i, i + batchSize);
    const batchRes = await queryDictionary(batch);
    dictResults = { ...dictResults, ...batchRes };
    process.stdout.write(`\r  Dictionary lookup: ${Math.min(i + batchSize, rawWordList.length)}/${rawWordList.length}`);
  }
  console.log('');

  // Build lemma map
  const lemmaMap = new Map<string, any>();
  const rawToLemma = new Map<string, string>();

  for (const raw of rawWordList) {
    const data = dictResults[raw];
    if (data) {
      const lemma = data.word;
      lemmaMap.set(lemma, data);
      rawToLemma.set(raw, lemma);
    }
  }

  const lemmaTexts = Array.from(lemmaMap.keys());
  console.log(`  Found ${lemmaTexts.length} unique lemmas`);

  if (lemmaTexts.length === 0) {
    return { count: 0, newWords: 0 };
  }

  // 4. Check existing words
  const existingWords = new Map<string, string>();

  for (let i = 0; i < lemmaTexts.length; i += 500) {
    const batch = lemmaTexts.slice(i, i + 500);
    const { data: existingBatch } = await supabase
      .from('words')
      .select('id, text')
      .in('text', batch)
      .is('deleted_at', null);

    if (existingBatch) {
      for (const word of existingBatch) {
        existingWords.set(word.text, word.id);
      }
    }
  }

  console.log(`  Found ${existingWords.size} existing words in database`);

  const newLemmasToInsert = lemmaTexts.filter(text => !existingWords.has(text));
  console.log(`  Need to insert ${newLemmasToInsert.length} new words`);

  // 5. Insert new words
  const lemmaToId = new Map<string, string>(existingWords);

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

  if (wordsToInsert.length > 0) {
    for (let i = 0; i < wordsToInsert.length; i += 100) {
      const batch = wordsToInsert.slice(i, i + 100);
      const { error: insertError } = await supabase
        .from('words')
        .upsert(batch, { onConflict: 'text', ignoreDuplicates: true });

      if (insertError) {
        console.error("  Failed to insert word batch:", insertError);
      }
    }

    // Query back to get IDs
    const insertedTexts = wordsToInsert.map(w => w.text);
    for (let i = 0; i < insertedTexts.length; i += 500) {
      const batch = insertedTexts.slice(i, i + 500);
      const { data: insertedWords } = await supabase
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

  // 6. Create UserWordStatus for this user
  const wordIdsToCheck = Array.from(lemmaToId.values());
  const existingStatuses = new Set<string>();

  for (let i = 0; i < wordIdsToCheck.length; i += 500) {
    const batch = wordIdsToCheck.slice(i, i + 500);
    const { data: statusBatch } = await supabase
      .from('user_word_statuses')
      .select('word_id')
      .eq('user_id', userId)
      .in('word_id', batch);

    if (statusBatch) {
      for (const s of statusBatch) {
        existingStatuses.add(s.word_id);
      }
    }
  }

  const statusesToInsert = [];
  for (const wordId of wordIdsToCheck) {
    if (!existingStatuses.has(wordId)) {
      statusesToInsert.push({
        id: randomUUID(),
        user_id: userId,
        word_id: wordId,
        status: "NEW",
        updated_at: new Date().toISOString()
      });
    }
  }

  if (statusesToInsert.length > 0) {
    for (let i = 0; i < statusesToInsert.length; i += 500) {
      const batch = statusesToInsert.slice(i, i + 500);
      const { error: insertError } = await supabase
        .from('user_word_statuses')
        .upsert(batch, {
          onConflict: 'user_id,word_id',
          ignoreDuplicates: true
        });

      if (insertError) {
        console.error("  Error inserting word statuses:", insertError);
      }
    }
  }

  console.log(`  Created ${statusesToInsert.length} new word statuses`);

  // 7. Create Word Occurrences
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

  console.log(`  Creating ${occurrencesData.length} word occurrences`);

  if (occurrencesData.length > 0) {
    const sentenceIds = sentences.map(s => s.id);

    // Delete existing occurrences for these sentences
    await supabase
      .from('word_occurrences')
      .delete()
      .in('sentence_id', sentenceIds);

    // Batch insert new occurrences
    for (let i = 0; i < occurrencesData.length; i += 500) {
      const batch = occurrencesData.slice(i, i + 500);
      const { error: occError } = await supabase
        .from('word_occurrences')
        .insert(batch);

      if (occError) console.error("  Error inserting occurrences:", occError);
    }
  }

  return { count: lemmaToId.size, newWords: statusesToInsert.length };
}

async function main() {
  console.log('Starting bulk vocabulary extraction...\n');

  // Get all users
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, email');

  if (usersError || !users) {
    console.error('Failed to fetch users:', usersError);
    return;
  }

  console.log(`Found ${users.length} users\n`);

  for (const user of users) {
    console.log(`\nProcessing user: ${user.email}`);

    // Get all processed materials for this user
    const { data: materials, error: materialsError } = await supabase
      .from('materials')
      .select('id, title')
      .eq('user_id', user.id)
      .eq('is_processed', true)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (materialsError || !materials || materials.length === 0) {
      console.log('  No processed materials found');
      continue;
    }

    console.log(`  Found ${materials.length} processed materials`);

    let totalWords = 0;
    let totalNewWords = 0;

    for (let i = 0; i < materials.length; i++) {
      const material = materials[i];
      console.log(`\n  [${i + 1}/${materials.length}] ${material.title}`);
      
      try {
        const result = await extractVocabularyForMaterial(material.id, user.id);
        totalWords += result.count;
        totalNewWords += result.newWords;
      } catch (e) {
        console.error(`  Error processing ${material.title}:`, e);
      }
    }

    console.log(`\n  User total: ${totalWords} words, ${totalNewWords} new word statuses`);
  }

  console.log('\n\nBulk extraction complete!');
}

main().catch(console.error);
