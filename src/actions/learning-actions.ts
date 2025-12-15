'use server';

import { auth } from '@/auth';
import { getAdminClient, APPWRITE_DATABASE_ID, Query } from '@/lib/appwrite';
import { ID } from 'node-appwrite';
import { revalidatePath } from 'next/cache';
import { 
  createEmptyCard, 
  fsrs, 
  Rating, 
  State,
  type Card as FSRSCard,
  type RecordLogItem,
  type Grade,
} from 'ts-fsrs';

const f = fsrs();

export interface LearningWord {
  id: string;
  wordId: string;
  text: string;
  phonetic: string | null;
  translation: string | null;
  definition: string | null;
  pos: string | null;
  exchange: string | null;
  status: string;
  exampleSentence: string | null;
  fsrsState: number;
  fsrsDue: string | null;
  fsrsStability: number | null;
  fsrsDifficulty: number | null;
  fsrsReps: number;
  fsrsLapses: number;
  errorCount: number;
}

// Context Listening mode types
export interface ContextListeningWord extends LearningWord {
  sentence: {
    id: string;
    content: string;
    startTime: number;
    endTime: number;
    materialId: string;
    materialTitle: string;
  };
  wordStartIndex: number;
  wordEndIndex: number;
}

export interface ReviewResult {
  success: boolean;
  newStatus?: string;
  nextReviewDate?: string;
  error?: string;
}

export interface LearningFilters {
  materialId?: string;
  dictionaryId?: string;
  oxford?: boolean;
  collins?: number[];
  minFrequency?: number;
  maxFrequency?: number;
  hardest?: boolean;
}

/**
 * Get words that are due for learning (status = NEW or LEARNING, not MASTERED)
 * Priority: 1. Due for review (fsrs_due <= now), 2. New words (fsrs_due is null)
 * 
 * When materialId is provided, we get ALL words from that material,
 * creating UserWordStatus records for words that don't have one yet.
 */
export async function getWordsForLearning(limit: number = 20, filters?: LearningFilters): Promise<{ words: LearningWord[], error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { words: [], error: 'Unauthorized' };

  const admin = getAdminClient();
  const now = new Date().toISOString();
  
  // Special handling for material filter - get all words from material
  if (filters?.materialId) {
    return getWordsFromMaterial(admin, session.user.id, filters.materialId, limit, filters);
  }

  // Special handling for dictionary filter
  if (filters?.dictionaryId) {
    return getWordsFromDictionary(admin, session.user.id, filters.dictionaryId, limit, filters);
  }

  // Special handling for hardest words
  if (filters?.hardest) {
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
    const wordIds = hardestWords.map(w => w.word_id);
    const wordsMap = new Map();
    if (wordIds.length > 0) {
        const { documents: words } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'words',
            [Query.equal('$id', wordIds)]
        );
        for (const w of words) wordsMap.set(w.$id, w);
    }

    const words: LearningWord[] = hardestWords.map((ws: any) => {
      const word = wordsMap.get(ws.word_id);
      return {
        id: ws.$id,
        wordId: ws.word_id,
        text: word?.text || '',
        phonetic: word?.phonetic ?? null,
        translation: word?.translation ?? null,
        definition: word?.definition ?? null,
        pos: word?.pos ?? null,
        exchange: word?.exchange ?? null,
        status: ws.status,
        exampleSentence: null,
        fsrsState: ws.fsrs_state || 0,
        fsrsDue: ws.fsrs_due,
        fsrsStability: ws.fsrs_stability,
        fsrsDifficulty: ws.fsrs_difficulty,
        fsrsReps: ws.fsrs_reps || 0,
        fsrsLapses: ws.fsrs_lapses || 0,
        errorCount: ws.error_count || 0,
      };
    });

    return { words };
  }
  
  // Normal flow: get words from user's vocabulary that need learning
  // We want a mix of reviews and new words.
  // Strategy: Try to get at least 20% new words if available.
  const minNewWords = Math.ceil(limit * 0.2);
  
  // 1. Get words that are due for review (fsrs_due <= now)
  const { documents: dueWords } = await admin.databases.listDocuments(
      APPWRITE_DATABASE_ID,
      'user_word_statuses',
      [
          Query.equal('user_id', session.user.id),
          Query.equal('status', ['NEW', 'LEARNING']),
          Query.lessThanEqual('fsrs_due', now),
          Query.orderAsc('fsrs_due'),
          Query.limit(limit)
      ]
  );
  
  const availableDueWords = dueWords || [];
  
  // 2. Get new words (fsrs_due is null)
  const { documents: newWords } = await admin.databases.listDocuments(
      APPWRITE_DATABASE_ID,
      'user_word_statuses',
      [
          Query.equal('user_id', session.user.id),
          Query.equal('status', ['NEW', 'LEARNING']),
          Query.isNull('fsrs_due'),
          Query.limit(limit)
      ]
  );
  
  const availableNewWords = newWords || [];

  // 3. Combine them with the mix strategy
  let allStatuses: any[] = [];
  
  // If we have enough due words to fill (limit - minNewWords)
  // and we have enough new words to fill minNewWords
  const targetDueCount = Math.max(0, limit - minNewWords);
  
  // Take due words
  const dueToTake = availableDueWords.slice(0, targetDueCount);
  allStatuses = [...dueToTake];
  
  // Take new words
  const newToTake = availableNewWords.slice(0, minNewWords);
  allStatuses = [...allStatuses, ...newToTake];
  
  // Fill remaining space
  const remainingSpace = limit - allStatuses.length;
  if (remainingSpace > 0) {
    // Try to fill with more due words first (if we skipped some)
    const remainingDue = availableDueWords.slice(targetDueCount);
    const moreDue = remainingDue.slice(0, remainingSpace);
    allStatuses = [...allStatuses, ...moreDue];
    
    // If still space, try to fill with more new words
    const stillRemaining = limit - allStatuses.length;
    if (stillRemaining > 0) {
      const remainingNew = availableNewWords.slice(minNewWords);
      const moreNew = remainingNew.slice(0, stillRemaining);
      allStatuses = [...allStatuses, ...moreNew];
    }
  }

  // Fetch word details for all selected statuses
  const wordIds = allStatuses.map(s => s.word_id);
  const wordsMap = new Map();
  
  if (wordIds.length > 0) {
      // Batch fetch words
      for (let i = 0; i < wordIds.length; i += 50) {
          const batch = wordIds.slice(i, i + 50);
          const { documents: batchWords } = await admin.databases.listDocuments(
              APPWRITE_DATABASE_ID,
              'words',
              [Query.equal('$id', batch)]
          );
          for (const w of batchWords) wordsMap.set(w.$id, w);
      }
  }

  // Filter by oxford/collins/frequency if needed
  let filteredStatuses = allStatuses;
  
  // Filter out deleted words first
  filteredStatuses = filteredStatuses.filter((ws: any) => {
    const word = wordsMap.get(ws.word_id);
    return word && !word.deleted_at;
  });
  
  if (filters?.oxford !== undefined) {
    filteredStatuses = filteredStatuses.filter((ws: any) => {
      const word = wordsMap.get(ws.word_id);
      return filters.oxford ? word?.oxford === 1 : word?.oxford !== 1;
    });
  }
  
  if (filters?.collins && filters.collins.length > 0) {
    filteredStatuses = filteredStatuses.filter((ws: any) => {
      const word = wordsMap.get(ws.word_id);
      return filters.collins!.includes(word?.collins);
    });
  }

  // Take only the required limit
  filteredStatuses = filteredStatuses.slice(0, limit);

  const words: LearningWord[] = filteredStatuses.map((ws: any) => {
    const word = wordsMap.get(ws.word_id);

    return {
      id: ws.$id,
      wordId: ws.word_id,
      text: word?.text || '',
      phonetic: word?.phonetic ?? null,
      translation: word?.translation ?? null,
      definition: word?.definition ?? null,
      pos: word?.pos ?? null,
      exchange: word?.exchange ?? null,
      status: ws.status,
      exampleSentence: null, // Example sentences will be loaded separately if needed
      fsrsState: ws.fsrs_state || 0,
      fsrsDue: ws.fsrs_due,
      fsrsStability: ws.fsrs_stability,
      fsrsDifficulty: ws.fsrs_difficulty,
      fsrsReps: ws.fsrs_reps || 0,
      fsrsLapses: ws.fsrs_lapses || 0,
      errorCount: ws.error_count || 0,
    };
  });

  return { words };
}

async function getWordsFromDictionary(
  admin: any,
  userId: string,
  dictionaryId: string,
  limit: number,
  filters?: LearningFilters
): Promise<{ words: LearningWord[], error?: string }> {
  // Get all word IDs from this dictionary
  // Appwrite doesn't support select specific fields easily, so we fetch docs
  // We need to paginate if there are many words
  const wordIdArray: string[] = [];
  let cursor = null;
  
  while (true) {
      const queries = [
          Query.equal('dictionary_id', dictionaryId),
          Query.limit(100)
      ];
      if (cursor) queries.push(Query.cursorAfter(cursor));
      
      const { documents: dictWords } = await admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'dictionary_words',
          queries
      );
      
      if (dictWords.length === 0) break;
      
      wordIdArray.push(...dictWords.map((dw: any) => dw.word_id));
      cursor = dictWords[dictWords.length - 1].$id;
      
      if (wordIdArray.length > 1000) break; // Safety limit
  }

  if (wordIdArray.length === 0) {
    return { words: [] };
  }

  // Get words with their info in batches
  const BATCH_SIZE = 50;
  const validWords: any[] = [];
  const statusMap = new Map<string, any>();
  
  for (let i = 0; i < wordIdArray.length; i += BATCH_SIZE) {
    if (validWords.length >= limit) break;

    const batchIds = wordIdArray.slice(i, i + BATCH_SIZE);
    
    // 1. Fetch word details
    const { documents: batchWords } = await admin.databases.listDocuments(
        APPWRITE_DATABASE_ID,
        'words',
        [
            Query.equal('$id', batchIds),
            Query.isNull('deleted_at')
        ]
    );
    
    if (!batchWords || batchWords.length === 0) continue;

    // 2. Fetch statuses for this batch
    const batchWordIds = batchWords.map((w: any) => w.$id);
    const { documents: batchStatuses } = await admin.databases.listDocuments(
        APPWRITE_DATABASE_ID,
        'user_word_statuses',
        [
            Query.equal('user_id', userId),
            Query.equal('word_id', batchWordIds)
        ]
    );
    
    // Update status map
    for (const status of batchStatuses) {
        statusMap.set(status.word_id, status);
    }

    // 3. Filter this batch
    const filteredBatch = batchWords.filter((word: any) => {
      // Filter by oxford
      if (filters?.oxford !== undefined) {
        if (filters.oxford && word.oxford !== 1) return false;
        if (!filters.oxford && word.oxford === 1) return false;
      }
      // Filter by collins
      if (filters?.collins && filters.collins.length > 0) {
        if (!filters.collins.includes(word.collins)) return false;
      }

      // Filter by SRS status
      const status = statusMap.get(word.$id);
      
      // 1. Exclude MASTERED
      if (status?.status === 'MASTERED') return false;
      
      // 2. Exclude future reviews (strict SRS)
      if (status?.fsrs_due) {
          const dueDate = new Date(status.fsrs_due);
          if (dueDate.getTime() > Date.now() + 60000) {
              return false;
          }
      }

      return true;
    });

    validWords.push(...filteredBatch);
  }

  if (validWords.length === 0) {
    return { words: [] };
  }

  // Sort logic
  const now = new Date().toISOString();
  
  validWords.sort((a, b) => {
    const statusA = statusMap.get(a.$id);
    const statusB = statusMap.get(b.$id);
    
    // 1. Never seen (no status)
    if (!statusA && statusB) return -1;
    if (statusA && !statusB) return 1;
    if (!statusA && !statusB) return 0;
    
    // 2. New (reps = 0)
    if (statusA.status === 'NEW' && statusA.fsrs_reps === 0 && (statusB.status !== 'NEW' || statusB.fsrs_reps > 0)) return -1;
    if ((statusA.status !== 'NEW' || statusA.fsrs_reps > 0) && statusB.status === 'NEW' && statusB.fsrs_reps === 0) return 1;
    
    // 3. New (reps > 0)
    if (statusA.status === 'NEW' && statusB.status !== 'NEW') return -1;
    if (statusA.status !== 'NEW' && statusB.status === 'NEW') return 1;
    
    // 4. Learning
    if (statusA.status === 'LEARNING' && statusB.status !== 'LEARNING') return -1;
    if (statusA.status !== 'LEARNING' && statusB.status === 'LEARNING') return 1;
    
    // 5. Due
    const dueA = statusA.fsrs_due ? new Date(statusA.fsrs_due).getTime() : Infinity;
    const dueB = statusB.fsrs_due ? new Date(statusB.fsrs_due).getTime() : Infinity;
    const nowTime = new Date().getTime();
    
    if (dueA <= nowTime && dueB > nowTime) return -1;
    if (dueA > nowTime && dueB <= nowTime) return 1;
    
    return 0;
  });

  // Take top N
  const selectedWords = validWords.slice(0, limit);
  
  // Map to LearningWord
  const result: LearningWord[] = selectedWords.map(word => {
    const status = statusMap.get(word.$id);
    return {
      id: status?.$id || ID.unique(), // Temporary ID if no status
      wordId: word.$id,
      text: word.text,
      phonetic: word.phonetic,
      translation: word.translation,
      definition: word.definition,
      pos: word.pos,
      exchange: word.exchange,
      status: status?.status || 'NEW',
      exampleSentence: null,
      fsrsState: status?.fsrs_state || State.New,
      fsrsDue: status?.fsrs_due || null,
      fsrsStability: status?.fsrs_stability || null,
      fsrsDifficulty: status?.fsrs_difficulty || null,
      fsrsReps: status?.fsrs_reps || 0,
      fsrsLapses: status?.fsrs_lapses || 0,
      errorCount: status?.error_count || 0,
    };
  });
  
  // Create missing statuses
  const wordsWithoutStatus = result.filter(w => !statusMap.has(w.wordId));
  for (const w of wordsWithoutStatus) {
      try {
          await admin.databases.createDocument(
              APPWRITE_DATABASE_ID,
              'user_word_statuses',
              ID.unique(),
              {
                  user_id: userId,
                  word_id: w.wordId,
                  status: 'NEW',
                  fsrs_state: State.New,
                  fsrs_reps: 0,
                  fsrs_lapses: 0,
                  error_count: 0,
                  updated_at: new Date().toISOString()
              }
          );
      } catch (e) {
          // Ignore duplicates
      }
  }
  
  return { words: result };
}


/**
 * Get words from a specific material for learning.
 * This creates UserWordStatus records for words that don't have one yet.
 */
async function getWordsFromMaterial(
  admin: any,
  userId: string,
  materialId: string,
  limit: number,
  filters?: LearningFilters
): Promise<{ words: LearningWord[], error?: string }> {
  // Get sentences from material
  const { documents: sentences } = await admin.databases.listDocuments(
      APPWRITE_DATABASE_ID,
      'sentences',
      [
          Query.equal('material_id', materialId),
          Query.isNull('deleted_at'),
          Query.limit(1000) // Reasonable limit for a material
      ]
  );
  
  if (sentences.length === 0) return { words: [] };
  
  const sentenceIds = sentences.map((s: any) => s.$id);
  
  // Get word occurrences
  // Batch fetch occurrences
  const wordIdsSet = new Set<string>();
  
  for (let i = 0; i < sentenceIds.length; i += 50) {
      const batch = sentenceIds.slice(i, i + 50);
      const { documents: occurrences } = await admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'word_occurrences',
          [Query.equal('sentence_id', batch)]
      );
      for (const occ of occurrences) wordIdsSet.add(occ.word_id);
  }

  if (wordIdsSet.size === 0) {
    return { words: [] };
  }

  const wordIdArray = Array.from(wordIdsSet);

  // Get words with their info in batches
  const BATCH_SIZE = 50;
  const validWords: any[] = [];
  const statusMap = new Map<string, any>();
  
  for (let i = 0; i < wordIdArray.length; i += BATCH_SIZE) {
    if (validWords.length >= limit) break;

    const batchIds = wordIdArray.slice(i, i + BATCH_SIZE);
    
    // 1. Fetch word details
    const { documents: batchWords } = await admin.databases.listDocuments(
        APPWRITE_DATABASE_ID,
        'words',
        [
            Query.equal('$id', batchIds),
            Query.isNull('deleted_at')
        ]
    );
    
    if (!batchWords || batchWords.length === 0) continue;

    // 2. Fetch statuses for this batch
    const batchWordIds = batchWords.map((w: any) => w.$id);
    const { documents: batchStatuses } = await admin.databases.listDocuments(
        APPWRITE_DATABASE_ID,
        'user_word_statuses',
        [
            Query.equal('user_id', userId),
            Query.equal('word_id', batchWordIds)
        ]
    );
    
    // Update status map
    for (const status of batchStatuses) {
        statusMap.set(status.word_id, status);
    }

    // 3. Filter this batch
    const filteredBatch = batchWords.filter((word: any) => {
      // Filter by oxford
      if (filters?.oxford !== undefined) {
        if (filters.oxford && word.oxford !== 1) return false;
        if (!filters.oxford && word.oxford === 1) return false;
      }
      // Filter by collins
      if (filters?.collins && filters.collins.length > 0) {
        if (!filters.collins.includes(word.collins)) return false;
      }
      return true;
    });

    validWords.push(...filteredBatch);
  }

  if (validWords.length === 0) {
    return { words: [] };
  }

  // Sort: prioritize words that user hasn't seen before
  const now = new Date().toISOString();
  
  validWords.sort((a, b) => {
    const statusA = statusMap.get(a.$id);
    const statusB = statusMap.get(b.$id);
    
    const getPriority = (status: any): number => {
      if (!status) return 0; // No status = never seen = highest priority
      if (status.status === 'MASTERED') return 100; // Mastered = lowest priority
      if (status.status === 'NEW') {
        if (status.fsrs_reps === 0) return 1; // NEW with 0 reps
        return 2; // NEW with some reps
      }
      if (status.status === 'LEARNING') {
        if (status.fsrs_due && status.fsrs_due <= now) return 3;
        return 4;
      }
      return 50; // Unknown status
    };
    
    const priorityA = getPriority(statusA);
    const priorityB = getPriority(statusB);
    
    if (priorityA !== priorityB) return priorityA - priorityB;
    
    const errA = statusA?.error_count || 0;
    const errB = statusB?.error_count || 0;
    if (errA !== errB) return errB - errA;
    
    if (statusA?.fsrs_due && statusB?.fsrs_due) {
      return statusA.fsrs_due.localeCompare(statusB.fsrs_due);
    }
    
    return 0;
  });

  const nonMasteredWords = validWords.filter(w => {
    const status = statusMap.get(w.$id);
    return !status || status.status !== 'MASTERED';
  });

  const wordsToReturn = nonMasteredWords.slice(0, limit);

  // Create user word statuses for words that don't have one
  const wordsNeedingStatus = wordsToReturn.filter(w => !statusMap.has(w.$id));
  for (const w of wordsNeedingStatus) {
      try {
          const newStatus = await admin.databases.createDocument(
              APPWRITE_DATABASE_ID,
              'user_word_statuses',
              ID.unique(),
              {
                  user_id: userId,
                  word_id: w.$id,
                  status: 'NEW',
                  fsrs_state: 0,
                  fsrs_reps: 0,
                  fsrs_lapses: 0,
                  fsrs_elapsed_days: 0,
                  fsrs_scheduled_days: 0,
                  error_count: 0,
                  updated_at: new Date().toISOString()
              }
          );
          statusMap.set(w.$id, newStatus);
      } catch (e) {
          // Ignore
      }
  }

  // Build the result
  const words: LearningWord[] = wordsToReturn.map(word => {
    const status = statusMap.get(word.$id);
    return {
      id: status?.$id || '',
      wordId: word.$id,
      text: word.text,
      phonetic: word.phonetic ?? null,
      translation: word.translation ?? null,
      definition: word.definition ?? null,
      pos: word.pos ?? null,
      exchange: word.exchange ?? null,
      status: status?.status || 'NEW',
      exampleSentence: null,
      fsrsState: status?.fsrs_state || 0,
      fsrsDue: status?.fsrs_due || null,
      fsrsStability: status?.fsrs_stability ?? null,
      fsrsDifficulty: status?.fsrs_difficulty ?? null,
      fsrsReps: status?.fsrs_reps || 0,
      fsrsLapses: status?.fsrs_lapses || 0,
      errorCount: status?.error_count || 0,
    };
  });

  return { words };
}

/**
 * Get random wrong options for multiple choice mode
 */
export async function getRandomWords(
  excludeWordIds: string[], 
  count: number = 3
): Promise<{ words: { id: string; text: string; translation: string | null; definition: string | null; pos: string | null }[], error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { words: [], error: 'Unauthorized' };

  const admin = getAdminClient();

  // Appwrite doesn't support random selection easily.
  // We'll fetch a chunk of words and shuffle them in memory.
  // To make it somewhat random, we could use a random offset, but offset is limited to 5000.
  // For now, we'll just fetch a batch from the beginning (or maybe use a random cursor if we had one).
  // A simple approach: fetch 100 words, filter excluded, shuffle, take count.
  
  const { documents: words } = await admin.databases.listDocuments(
      APPWRITE_DATABASE_ID,
      'words',
      [
          Query.limit(100),
          Query.isNull('deleted_at')
      ]
  );

  const filtered = words.filter((w: any) => !excludeWordIds.includes(w.$id));
  const shuffled = filtered.sort(() => Math.random() - 0.5);
  
  const result = shuffled.slice(0, count).map((w: any) => ({
      id: w.$id,
      text: w.text,
      translation: w.translation,
      definition: w.definition,
      pos: w.pos
  }));

  return { words: result };
}

/**
 * Convert user action to FSRS rating
 */
function calculateRating(
  isCorrect: boolean, 
  responseTimeMs: number, 
  errorCount: number,
  mode: 'typing' | 'multiple_choice' | 'context_listening'
): Grade {
  if (!isCorrect || errorCount > 0) {
    // If wrong, use Again (1)
    return Rating.Again;
  }

  // For correct answers, use response time to determine rating
  // Context listening takes longer due to audio playback
  const avgResponseTime = mode === 'multiple_choice' ? 3000 : mode === 'context_listening' ? 8000 : 5000;

  if (responseTimeMs < avgResponseTime * 0.5) {
    // Very fast = Easy
    return Rating.Easy;
  } else if (responseTimeMs < avgResponseTime) {
    // Normal speed = Good
    return Rating.Good;
  } else {
    // Slow = Hard
    return Rating.Hard;
  }
}

/**
 * Record a review event and update FSRS state
 */
export async function recordReview(params: {
  userWordStatusId: string;
  isCorrect: boolean;
  responseTimeMs: number;
  errorCount: number;
  mode: 'typing' | 'multiple_choice' | 'context_listening';
}): Promise<ReviewResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  const admin = getAdminClient();
  const { userWordStatusId, isCorrect, responseTimeMs, errorCount, mode } = params;

  // Get current word status
  let wordStatus;
  try {
      wordStatus = await admin.databases.getDocument(
          APPWRITE_DATABASE_ID,
          'user_word_statuses',
          userWordStatusId
      );
  } catch (e) {
      return { success: false, error: 'Word status not found' };
  }

  if (wordStatus.user_id !== session.user.id) {
      return { success: false, error: 'Unauthorized' };
  }

  // Calculate FSRS rating
  const rating = calculateRating(isCorrect, responseTimeMs, errorCount, mode);

  // Build current FSRS card state or create a new one
  const now = new Date();
  let currentCard: FSRSCard;
  
  if (wordStatus.fsrs_reps === 0 || wordStatus.fsrs_reps === null) {
    // New card - create empty card
    currentCard = createEmptyCard(now);
  } else {
    currentCard = {
      due: wordStatus.fsrs_due ? new Date(wordStatus.fsrs_due) : now,
      stability: wordStatus.fsrs_stability || 0,
      difficulty: wordStatus.fsrs_difficulty || 0,
      elapsed_days: wordStatus.fsrs_elapsed_days || 0,
      scheduled_days: wordStatus.fsrs_scheduled_days || 0,
      reps: wordStatus.fsrs_reps || 0,
      lapses: wordStatus.fsrs_lapses || 0,
      state: (wordStatus.fsrs_state || 0) as State,
      last_review: wordStatus.fsrs_last_review ? new Date(wordStatus.fsrs_last_review) : undefined,
    } as FSRSCard;
  }

  // Get the next state based on rating
  const recordLog = f.repeat(currentCard, now);
  const nextState: RecordLogItem = recordLog[rating];
  const newCard = nextState.card;

  // Determine new status based on FSRS state
  let newStatus = wordStatus.status;
  if (newCard.state === State.Review && newCard.stability > 21) {
    // High stability = mastered
    newStatus = 'MASTERED';
  } else if (newCard.state === State.Learning || newCard.state === State.Relearning) {
    newStatus = 'LEARNING';
  } else if (newCard.state === State.Review) {
    newStatus = 'LEARNING';
  }

  // Update word status with new FSRS state
  await admin.databases.updateDocument(
      APPWRITE_DATABASE_ID,
      'user_word_statuses',
      userWordStatusId,
      {
          status: newStatus,
          fsrs_due: newCard.due.toISOString(),
          fsrs_stability: newCard.stability,
          fsrs_difficulty: newCard.difficulty,
          fsrs_elapsed_days: newCard.elapsed_days,
          fsrs_scheduled_days: newCard.scheduled_days,
          fsrs_reps: newCard.reps,
          fsrs_lapses: newCard.lapses,
          fsrs_state: newCard.state,
          fsrs_last_review: now.toISOString(),
          error_count: isCorrect ? wordStatus.error_count : (wordStatus.error_count || 0) + 1,
          last_error_at: isCorrect ? wordStatus.last_error_at : now.toISOString(),
          updated_at: now.toISOString(),
      }
  );

  // Record review history
  try {
      await admin.databases.createDocument(
          APPWRITE_DATABASE_ID,
          'word_reviews',
          ID.unique(),
          {
              user_word_status_id: userWordStatusId,
              rating,
              mode,
              response_time_ms: responseTimeMs,
              was_correct: isCorrect,
              error_count: errorCount,
              new_stability: newCard.stability,
              new_difficulty: newCard.difficulty,
              new_due: newCard.due.toISOString(),
          }
      );
  } catch (e) {
      console.error('[recordReview] Review insert error:', e);
  }

  revalidatePath('/words');
  revalidatePath('/study/words');

  return {
    success: true,
    newStatus,
    nextReviewDate: newCard.due.toISOString(),
  };
}

/**
 * Mark a word as mastered - it will no longer appear in learning sessions
 */
export async function markAsMastered(userWordStatusId: string): Promise<ReviewResult> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  const admin = getAdminClient();

  // Verify the word status belongs to the user
  let wordStatus;
  try {
      wordStatus = await admin.databases.getDocument(
          APPWRITE_DATABASE_ID,
          'user_word_statuses',
          userWordStatusId
      );
  } catch (e) {
      return { success: false, error: 'Word status not found' };
  }

  if (wordStatus.user_id !== session.user.id) {
      return { success: false, error: 'Unauthorized' };
  }

  const now = new Date();

  // Update word status to MASTERED with high stability
  await admin.databases.updateDocument(
      APPWRITE_DATABASE_ID,
      'user_word_statuses',
      userWordStatusId,
      {
          status: 'MASTERED',
          fsrs_stability: 365, // Very high stability - won't be scheduled for a long time
          fsrs_state: State.Review,
          fsrs_last_review: now.toISOString(),
          updated_at: now.toISOString(),
      }
  );

  revalidatePath('/words');
  revalidatePath('/study/words');

  return {
    success: true,
    newStatus: 'MASTERED',
  };
}

/**
 * Get learning statistics
 */
export async function getLearningStats(materialId?: string, dictionaryId?: string): Promise<{
  totalNew: number;
  totalLearning: number;
  totalMastered: number;
  dueToday: number;
  error?: string;
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { totalNew: 0, totalLearning: 0, totalMastered: 0, dueToday: 0, error: 'Unauthorized' };
  }

  const admin = getAdminClient();

  // If materialId or dictionaryId is provided, get stats only for words from that scope
  let wordIdsInScope: Set<string> | null = null;
  
  if (materialId) {
    // Get sentences from material
    const { documents: sentences } = await admin.databases.listDocuments(
        APPWRITE_DATABASE_ID,
        'sentences',
        [Query.equal('material_id', materialId), Query.isNull('deleted_at')]
    );
    
    if (sentences.length > 0) {
      const sentenceIds = sentences.map((s: any) => s.$id);
      
      // Get word occurrences in batches
      wordIdsInScope = new Set<string>();
      
      for (let i = 0; i < sentenceIds.length; i += 50) {
        const batch = sentenceIds.slice(i, i + 50);
        const { documents: occurrences } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'word_occurrences',
            [Query.equal('sentence_id', batch)]
        );
        for (const occ of occurrences) wordIdsInScope.add(occ.word_id);
      }
    }
    
    if (!wordIdsInScope || wordIdsInScope.size === 0) {
      return { totalNew: 0, totalLearning: 0, totalMastered: 0, dueToday: 0 };
    }
  } else if (dictionaryId) {
    // Get words from dictionary
    const wordIds = [];
    let cursor = null;
    while (true) {
        const queries = [Query.equal('dictionary_id', dictionaryId), Query.limit(100)];
        if (cursor) queries.push(Query.cursorAfter(cursor));
        const { documents: dictWords } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'dictionary_words',
            queries
        );
        if (dictWords.length === 0) break;
        wordIds.push(...dictWords.map((dw: any) => dw.word_id));
        cursor = dictWords[dictWords.length - 1].$id;
        if (wordIds.length > 1000) break;
    }
    
    if (wordIds.length > 0) {
      wordIdsInScope = new Set(wordIds);
    } else {
      return { totalNew: 0, totalLearning: 0, totalMastered: 0, dueToday: 0 };
    }
  }

  // Get all statuses for user
  // We might need to paginate if user has many words
  const allStatuses: any[] = [];
  let cursor = null;
  while (true) {
      const queries = [Query.equal('user_id', session.user.id), Query.limit(100)];
      if (cursor) queries.push(Query.cursorAfter(cursor));
      const { documents: statuses } = await admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'user_word_statuses',
          queries
      );
      if (statuses.length === 0) break;
      allStatuses.push(...statuses);
      cursor = statuses[statuses.length - 1].$id;
      if (allStatuses.length > 5000) break; // Safety
  }

  // Filter by scope if needed
  let filteredStatuses = allStatuses;
  if (wordIdsInScope) {
    filteredStatuses = filteredStatuses.filter((ws: any) => 
      wordIdsInScope!.has(ws.word_id)
    );
  }

  const counts = filteredStatuses.reduce((acc: Record<string, number>, ws: any) => {
    acc[ws.status] = (acc[ws.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Get words due today
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const todayStr = today.toISOString();

  let dueCount = 0;
  
  // Count due words from filtered statuses
  const dueStatuses = filteredStatuses.filter((ws: any) => {
      if (ws.status !== 'NEW' && ws.status !== 'LEARNING') return false;
      if (!ws.fsrs_due) return true; // New words are due
      return ws.fsrs_due <= todayStr;
  });
  
  dueCount = dueStatuses.length;

  // If scoped, we also need to count words that are in scope but have NO status (truly new)
  if (wordIdsInScope) {
      const wordIdsWithStatus = new Set(filteredStatuses.map((ws: any) => ws.word_id));
      const newWordsWithoutStatus = Array.from(wordIdsInScope).filter(id => !wordIdsWithStatus.has(id)).length;
      
      counts['NEW'] = (counts['NEW'] || 0) + newWordsWithoutStatus;
      dueCount += newWordsWithoutStatus;
  }

  return {
    totalNew: counts['NEW'] || 0,
    totalLearning: counts['LEARNING'] || 0,
    totalMastered: counts['MASTERED'] || 0,
    dueToday: dueCount,
  };
}

/**
 * Get words with their source sentences for Context Listening mode
 * Each word must have at least one sentence with audio
 */
export async function getWordsForContextListening(
  limit: number = 20, 
  filters?: LearningFilters
): Promise<{ words: ContextListeningWord[], error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { words: [], error: 'Unauthorized' };

  const admin = getAdminClient();
  
  // If we have material filter, we need to get word IDs from that material first
  let filteredWordIds: string[] | null = null;
  
  if (filters?.materialId) {
    // Get sentences from material
    const { documents: sentences } = await admin.databases.listDocuments(
        APPWRITE_DATABASE_ID,
        'sentences',
        [Query.equal('material_id', filters.materialId), Query.isNull('deleted_at')]
    );
    
    if (sentences.length > 0) {
      const sentenceIds = sentences.map((s: any) => s.$id);
      
      // Get word occurrences
      const wordIdsSet = new Set<string>();
      for (let i = 0; i < sentenceIds.length; i += 50) {
          const batch = sentenceIds.slice(i, i + 50);
          const { documents: occurrences } = await admin.databases.listDocuments(
              APPWRITE_DATABASE_ID,
              'word_occurrences',
              [Query.equal('sentence_id', batch)]
          );
          for (const occ of occurrences) wordIdsSet.add(occ.word_id);
      }
      filteredWordIds = Array.from(wordIdsSet);
    }
    
    if (!filteredWordIds || filteredWordIds.length === 0) {
      return { words: [], error: 'No words found for this material' };
    }
  }
  
  // Get words with status NEW or LEARNING, ordered by due date
  const queries = [
      Query.equal('user_id', session.user.id),
      Query.equal('status', ['NEW', 'LEARNING']),
      Query.orderAsc('fsrs_due'),
      Query.limit(limit * 3)
  ];
  
  if (filteredWordIds) {
      // Appwrite doesn't support IN query with large array easily in one go if it's too big
      // But here we are filtering statuses.
      // If filteredWordIds is huge, this might fail.
      // Instead, we should probably fetch statuses and filter in memory if filteredWordIds is large.
      // For now, let's assume it fits or we rely on the limit.
      // Actually, we can't easily combine "IN" with other filters if the list is huge.
      // Let's fetch statuses first then filter.
  }

  const { documents: wordStatuses } = await admin.databases.listDocuments(
      APPWRITE_DATABASE_ID,
      'user_word_statuses',
      queries
  );

  // Filter by material word IDs if needed
  let filteredStatuses = wordStatuses;
  if (filteredWordIds) {
      const allowedSet = new Set(filteredWordIds);
      filteredStatuses = filteredStatuses.filter((ws: any) => allowedSet.has(ws.word_id));
  }

  // Fetch word details
  const wordIds = filteredStatuses.map((ws: any) => ws.word_id);
  const wordsMap = new Map();
  
  if (wordIds.length > 0) {
      for (let i = 0; i < wordIds.length; i += 50) {
          const batch = wordIds.slice(i, i + 50);
          const { documents: words } = await admin.databases.listDocuments(
              APPWRITE_DATABASE_ID,
              'words',
              [Query.equal('$id', batch)]
          );
          for (const w of words) wordsMap.set(w.$id, w);
      }
  }

  // Filter by oxford/collins/frequency if needed
  filteredStatuses = filteredStatuses.filter((ws: any) => {
    const word = wordsMap.get(ws.word_id);
    return word && !word.deleted_at;
  });
  
  if (filters?.oxford !== undefined) {
    filteredStatuses = filteredStatuses.filter((ws: any) => {
      const word = wordsMap.get(ws.word_id);
      return filters.oxford ? word?.oxford === 1 : word?.oxford !== 1;
    });
  }
  
  if (filters?.collins && filters.collins.length > 0) {
    filteredStatuses = filteredStatuses.filter((ws: any) => {
      const word = wordsMap.get(ws.word_id);
      return filters.collins!.includes(word?.collins);
    });
  }

  // Get word IDs that we'll fetch sentences for
  const finalWordIds = filteredStatuses.map((ws: any) => ws.word_id);
  
  if (finalWordIds.length === 0) {
    return { words: [] };
  }

  // Get occurrences for these words
  // We need to find sentences for these words.
  // Strategy: Fetch occurrences -> Fetch sentences -> Filter by user ownership
  const occurrencesByWordId: Record<string, any[]> = {};
  
  for (let i = 0; i < finalWordIds.length; i += 50) {
      const batch = finalWordIds.slice(i, i + 50);
      const { documents: occurrences } = await admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'word_occurrences',
          [Query.equal('word_id', batch)]
      );
      
      // We need to fetch sentences for these occurrences to check ownership and get content
      const sentenceIds = Array.from(new Set(occurrences.map((o: any) => o.sentence_id)));
      const sentencesMap = new Map();
      
      for (let j = 0; j < sentenceIds.length; j += 50) {
          const sBatch = sentenceIds.slice(j, j + 50);
          const { documents: sentences } = await admin.databases.listDocuments(
              APPWRITE_DATABASE_ID,
              'sentences',
              [Query.equal('$id', sBatch)]
          );
          
          // We also need materials to check user_id
          const materialIds = Array.from(new Set(sentences.map((s: any) => s.material_id)));
          const materialsMap = new Map();
          
          for (let k = 0; k < materialIds.length; k += 50) {
              const mBatch = materialIds.slice(k, k + 50);
              const { documents: materials } = await admin.databases.listDocuments(
                  APPWRITE_DATABASE_ID,
                  'materials',
                  [Query.equal('$id', mBatch)]
              );
              for (const m of materials) materialsMap.set(m.$id, m);
          }
          
          for (const s of sentences) {
              const m = materialsMap.get(s.material_id);
              if (m && m.user_id === session.user.id && !s.deleted_at) {
                  sentencesMap.set(s.$id, { ...s, material: m });
              }
          }
      }
      
      for (const occ of occurrences) {
          const sentence = sentencesMap.get(occ.sentence_id);
          if (sentence) {
              if (!occurrencesByWordId[occ.word_id]) {
                  occurrencesByWordId[occ.word_id] = [];
              }
              occurrencesByWordId[occ.word_id].push({ ...occ, sentence });
          }
      }
  }

  // Build the result
  const contextWords: ContextListeningWord[] = [];
  
  for (const ws of filteredStatuses) {
    const wordId = ws.word_id;
    const word = wordsMap.get(wordId);
    const occurrences = occurrencesByWordId[wordId];
    
    if (!occurrences || occurrences.length === 0) {
      continue; // Skip words without sentences
    }
    
    // Pick the shortest sentence
    occurrences.sort((a: any, b: any) => {
      const lenA = a.sentence?.content?.length || Number.MAX_SAFE_INTEGER;
      const lenB = b.sentence?.content?.length || Number.MAX_SAFE_INTEGER;
      return lenA - lenB;
    });
    
    const randomOcc = occurrences[0];
    const sentence = randomOcc.sentence;
    
    contextWords.push({
      id: ws.$id,
      wordId: wordId,
      text: word?.text || '',
      phonetic: word?.phonetic ?? null,
      translation: word?.translation ?? null,
      definition: word?.definition ?? null,
      pos: word?.pos ?? null,
      exchange: word?.exchange ?? null,
      status: ws.status,
      exampleSentence: sentence.content,
      fsrsState: ws.fsrs_state || 0,
      fsrsDue: ws.fsrs_due,
      fsrsStability: ws.fsrs_stability,
      fsrsDifficulty: ws.fsrs_difficulty,
      fsrsReps: ws.fsrs_reps || 0,
      fsrsLapses: ws.fsrs_lapses || 0,
      errorCount: ws.error_count || 0,
      sentence: {
        id: sentence.$id,
        content: sentence.content,
        startTime: sentence.start_time || 0,
        endTime: sentence.end_time || 0,
        materialId: sentence.material.$id,
        materialTitle: sentence.material.title,
      },
      wordStartIndex: randomOcc.start_index ?? -1,
      wordEndIndex: randomOcc.end_index ?? -1,
    });

    if (contextWords.length >= limit) {
      break;
    }
  }

  return { words: contextWords };
}

/**
 * Record learning session duration to daily study stats
 * This should be called when a learning session ends
 */
export async function recordLearningSessionDuration(durationSeconds: number): Promise<{ success: boolean; error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { success: false, error: 'Unauthorized' };

  if (durationSeconds <= 0) {
    return { success: true }; // Nothing to record
  }

  const admin = getAdminClient();
  
  try {
    // Get today's date at midnight (normalized)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    // Check if we already have a record for today
    const { documents: existingStats } = await admin.databases.listDocuments(
        APPWRITE_DATABASE_ID,
        'daily_study_stats',
        [
            Query.equal('user_id', session.user.id),
            Query.equal('date', todayStr)
        ]
    );

    if (existingStats.length > 0) {
      // Update existing record
      const existingStat = existingStats[0];
      await admin.databases.updateDocument(
          APPWRITE_DATABASE_ID,
          'daily_study_stats',
          existingStat.$id,
          {
              study_duration: existingStat.study_duration + durationSeconds,
              updated_at: new Date().toISOString(),
          }
      );
    } else {
      // Create new record
      await admin.databases.createDocument(
          APPWRITE_DATABASE_ID,
          'daily_study_stats',
          ID.unique(),
          {
              user_id: session.user.id,
              date: todayStr,
              study_duration: durationSeconds,
              words_added: 0,
              sentences_added: 0,
              updated_at: new Date().toISOString(),
          }
      );
    }

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('[recordLearningSessionDuration] Error:', error);
    return { success: false, error: 'Failed to record learning duration' };
  }
}
