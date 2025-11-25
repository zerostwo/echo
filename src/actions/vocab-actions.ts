'use server';

import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { startOfDay } from 'date-fns';

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
    const material = await prisma.material.findUnique({
        where: { id: materialId },
        include: { sentences: true }
    });

    if (!material) {
        console.error(`[extractVocabulary] Material not found: ${materialId}`);
        return { error: 'Material not found' };
    }
    
    console.log(`[extractVocabulary] Found ${material.sentences.length} sentences for material ${materialId}`);

    // 2. Extract raw words from sentences
    const rawWords = new Set<string>();
    const sentenceWords: { sentenceId: string, rawWord: string }[] = [];

    for (const sentence of material.sentences) {
        // Basic tokenization: remove punctuation, lowercase, split by space
        // Added more special chars to the regex to be safe
        const words = sentence.content
            .toLowerCase()
            .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'\\\[\]|<>@]/g, " ")
            .split(/\s+/)
            .filter(w => w.length > 1 && !/^\d+$/.test(w)); // Ignore single chars and numbers

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
    await prisma.material.update({
        where: { id: materialId },
        data: { vocabExtractionTime: totalDuration }
    });

    const processedWords = new Set<string>();
    const lemmaMap = new Map<string, any>(); // lemmaText -> data
    const rawToLemma = new Map<string, string>(); // raw -> lemmaText
    
    for (const raw of rawWordList) {
        const data = dictResults[raw];
        if (data) {
            // query_dict returns the data object. The 'word' field in data is the lemma.
            // If lemma was found, data['word'] is the lemma.
            // If fallback occurred, data['word'] is the word itself.
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
        
        // Prepare data object
        const wordData = {
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

        const word = await prisma.word.upsert({
            where: { text: lemma },
            update: wordData,
            create: {
                text: lemma,
                ...wordData
            }
        });
        
        lemmaToId.set(lemma, word.id);
        processedWords.add(lemma);

        // Initialize UserWordStatus if it doesn't exist
        const userStatus = await prisma.userWordStatus.findUnique({
            where: {
                userId_wordId: {
                    userId: session.user.id,
                    wordId: word.id
                }
            }
        });

        if (!userStatus) {
            await prisma.userWordStatus.create({
                data: {
                    userId: session.user.id,
                    wordId: word.id,
                    status: "NEW"
                }
            });
            newWordsCount++;
        }
    }
    
    // 5. Create Occurrences
    console.log(`[extractVocabulary] Processing ${lemmaMap.size} lemmas.`);
    const occurrencesData = [];
    
    for (const { sentenceId, rawWord } of sentenceWords) {
        const lemma = rawToLemma.get(rawWord);
        if (lemma && lemmaToId.has(lemma)) {
            occurrencesData.push({
                wordId: lemmaToId.get(lemma)!,
                sentenceId: sentenceId
            });
        }
    }
    
    if (occurrencesData.length > 0) {
        // Better to clear first if we are re-running
        const sentenceIds = material.sentences.map(s => s.id);
        await prisma.wordOccurrence.deleteMany({
            where: { sentenceId: { in: sentenceIds } }
        });

        await prisma.wordOccurrence.createMany({
            data: occurrencesData
        });
    }

    // 6. Update Daily Stats
    if (newWordsCount > 0) {
        const today = startOfDay(new Date());
        await prisma.dailyStudyStat.upsert({
            where: {
                userId_date: {
                    userId: session.user.id,
                    date: today
                }
            },
            update: {
                wordsAdded: { increment: newWordsCount }
            },
            create: {
                userId: session.user.id,
                date: today,
                wordsAdded: newWordsCount
            }
        });
    }

    return { success: true, count: processedWords.size };
}

export async function getMaterialVocab(materialId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    // Find all words associated with this material via sentences
    const words = await prisma.word.findMany({
        where: {
            occurrences: {
                some: {
                    sentence: {
                        materialId: materialId
                    }
                }
            }
        },
        include: {
            statuses: {
                where: { userId: session.user.id }
            }
        },
        orderBy: { text: 'asc' }
    });

    return { words };
}
