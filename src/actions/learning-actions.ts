'use server';

import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { revalidatePath } from 'next/cache';
import { randomUUID } from 'crypto';
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
  oxford?: boolean;
  collins?: number[];
  minFrequency?: number;
  maxFrequency?: number;
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

  const client = supabaseAdmin || supabase;
  const now = new Date().toISOString();
  
  // Special handling for material filter - get all words from material
  if (filters?.materialId) {
    return getWordsFromMaterial(client, session.user.id, filters.materialId, limit, filters);
  }
  
  // Normal flow: get words from user's vocabulary that need learning
  // First, get words that are due for review (fsrs_due <= now)
  // These should be prioritized over new words
  let dueQuery = client
    .from('user_word_statuses')
    .select(`
      id,
      word_id,
      status,
      fsrs_due,
      fsrs_stability,
      fsrs_difficulty,
      fsrs_reps,
      fsrs_lapses,
      fsrs_state,
      error_count,
      words:word_id (
        id,
        text,
        phonetic,
        translation,
        definition,
        pos,
        exchange,
        oxford,
        collins,
        deleted_at
      )
    `)
    .eq('user_id', session.user.id)
    .in('status', ['NEW', 'LEARNING'])
    .lte('fsrs_due', now)
    .order('fsrs_due', { ascending: true })
    .limit(limit);

  const { data: dueWords, error: dueError } = await dueQuery;
  
  if (dueError) {
    console.error('[getWordsForLearning] Error fetching due words:', dueError);
  }
  
  let allWords = dueWords || [];
  
  // If we need more words, get new words (fsrs_due is null)
  if (allWords.length < limit) {
    const remaining = limit - allWords.length;
    
    let newQuery = client
      .from('user_word_statuses')
      .select(`
        id,
        word_id,
        status,
        fsrs_due,
        fsrs_stability,
        fsrs_difficulty,
        fsrs_reps,
        fsrs_lapses,
        fsrs_state,
        error_count,
        words:word_id (
          id,
          text,
          phonetic,
          translation,
          definition,
          pos,
          exchange,
          oxford,
          collins,
          deleted_at
        )
      `)
      .eq('user_id', session.user.id)
      .in('status', ['NEW', 'LEARNING'])
      .is('fsrs_due', null)
      .limit(remaining * 2); // Fetch extra for filtering

    const { data: newWords, error: newError } = await newQuery;
    
    if (newError) {
      console.error('[getWordsForLearning] Error fetching new words:', newError);
    }
    
    if (newWords) {
      allWords = [...allWords, ...newWords];
    }
  }

  // Filter by oxford/collins/frequency if needed
  let filteredStatuses = allWords;
  
  // Filter out deleted words first
  filteredStatuses = filteredStatuses.filter((ws: any) => {
    const word = ws.words;
    return word && !word.deleted_at;
  });
  
  if (filters?.oxford !== undefined) {
    filteredStatuses = filteredStatuses.filter((ws: any) => {
      const word = ws.words;
      return filters.oxford ? word?.oxford === 1 : word?.oxford !== 1;
    });
  }
  
  if (filters?.collins && filters.collins.length > 0) {
    filteredStatuses = filteredStatuses.filter((ws: any) => {
      const word = ws.words;
      return filters.collins!.includes(word?.collins);
    });
  }

  // Take only the required limit
  filteredStatuses = filteredStatuses.slice(0, limit);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const words: LearningWord[] = filteredStatuses.map((ws: any) => {
    const word = ws.words;

    return {
      id: ws.id,
      wordId: word?.id || ws.word_id,
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

/**
 * Get words from a specific material for learning.
 * This creates UserWordStatus records for words that don't have one yet.
 */
async function getWordsFromMaterial(
  client: typeof supabase,
  userId: string,
  materialId: string,
  limit: number,
  filters?: LearningFilters
): Promise<{ words: LearningWord[], error?: string }> {
  // Get all word IDs from this material via word_occurrences
  // Use a join approach to avoid the URI too long issue
  const { data: occurrences, error: occError } = await client
    .from('word_occurrences')
    .select(`
      word_id,
      sentence:sentence_id (
        id,
        material_id,
        deleted_at
      )
    `)
    .not('sentence', 'is', null);

  if (occError) {
    console.error('[getWordsFromMaterial] Error fetching occurrences:', occError);
    return { words: [], error: 'Failed to fetch words from material' };
  }

  // Filter to only get occurrences from this material with non-deleted sentences
  const materialWordIds = new Set<string>();
  for (const occ of occurrences || []) {
    const sentence = occ.sentence as any;
    if (sentence && sentence.material_id === materialId && !sentence.deleted_at) {
      materialWordIds.add(occ.word_id);
    }
  }

  if (materialWordIds.size === 0) {
    return { words: [], error: 'No words found for this material' };
  }

  const wordIdArray = Array.from(materialWordIds);

  // Get words with their info in batches to avoid URI too long
  const BATCH_SIZE = 50; // Small batch size to avoid URI issues
  const wordsData: any[] = [];
  
  for (let i = 0; i < wordIdArray.length && wordsData.length < limit * 2; i += BATCH_SIZE) {
    const batch = wordIdArray.slice(i, i + BATCH_SIZE);
    const { data: batchWords, error: batchError } = await client
      .from('words')
      .select('id, text, phonetic, translation, definition, pos, exchange, oxford, collins, deleted_at')
      .in('id', batch)
      .is('deleted_at', null);
    
    if (batchError) {
      console.error('[getWordsFromMaterial] Error fetching words batch:', batchError);
      continue;
    }
    
    if (batchWords) {
      wordsData.push(...batchWords);
    }
  }

  if (wordsData.length === 0) {
    return { words: [], error: 'Failed to fetch word details' };
  }

  // Get existing user word statuses for these words in batches
  const wordIdsToCheck = wordsData.map(w => w.id);
  const existingStatuses: any[] = [];
  
  for (let i = 0; i < wordIdsToCheck.length; i += BATCH_SIZE) {
    const batch = wordIdsToCheck.slice(i, i + BATCH_SIZE);
    const { data: batchStatuses } = await client
      .from('user_word_statuses')
      .select('*')
      .eq('user_id', userId)
      .in('word_id', batch);
    
    if (batchStatuses) {
      existingStatuses.push(...batchStatuses);
    }
  }

  const statusMap = new Map<string, any>();
  for (const status of existingStatuses) {
    statusMap.set(status.word_id, status);
  }

  // Apply filters and build result
  let filteredWords = wordsData.filter(word => {
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

  // Sort: prioritize words that user hasn't seen before (for pre-learning before dictation)
  // Priority order:
  // 1. Words without any status (never seen by user) - highest priority
  // 2. Words with status NEW and fsrs_reps = 0 (created but never reviewed)
  // 3. Words with status NEW (reviewed once but still new)
  // 4. Words with status LEARNING (in progress)
  // 5. Words due for review (fsrs_due <= now)
  // 6. Mastered words - lowest priority
  const now = new Date().toISOString();
  
  filteredWords.sort((a, b) => {
    const statusA = statusMap.get(a.id);
    const statusB = statusMap.get(b.id);
    
    // Helper to get priority score (lower = higher priority)
    const getPriority = (status: any): number => {
      if (!status) return 0; // No status = never seen = highest priority
      if (status.status === 'MASTERED') return 100; // Mastered = lowest priority
      if (status.status === 'NEW') {
        if (status.fsrs_reps === 0) return 1; // NEW with 0 reps = created but never reviewed
        return 2; // NEW with some reps
      }
      if (status.status === 'LEARNING') {
        // Due for review gets higher priority
        if (status.fsrs_due && status.fsrs_due <= now) return 3;
        return 4;
      }
      return 50; // Unknown status
    };
    
    const priorityA = getPriority(statusA);
    const priorityB = getPriority(statusB);
    
    if (priorityA !== priorityB) return priorityA - priorityB;
    
    // Within same priority, sort by error count (more errors = review more)
    const errA = statusA?.error_count || 0;
    const errB = statusB?.error_count || 0;
    if (errA !== errB) return errB - errA;
    
    // Then by due date for items that have one
    if (statusA?.fsrs_due && statusB?.fsrs_due) {
      return statusA.fsrs_due.localeCompare(statusB.fsrs_due);
    }
    
    return 0;
  });

  // Take only the required limit (excluding mastered words unless we need them)
  const nonMasteredWords = filteredWords.filter(w => {
    const status = statusMap.get(w.id);
    return !status || status.status !== 'MASTERED';
  });

  const wordsToReturn = nonMasteredWords.slice(0, limit);

  // Create user word statuses for words that don't have one
  const wordsNeedingStatus = wordsToReturn.filter(w => !statusMap.has(w.id));
  if (wordsNeedingStatus.length > 0) {
    const newStatuses = wordsNeedingStatus.map(w => ({
      id: randomUUID(),
      user_id: userId,
      word_id: w.id,
      status: 'NEW',
      fsrs_state: 0,
      fsrs_reps: 0,
      fsrs_lapses: 0,
      fsrs_elapsed_days: 0,
      fsrs_scheduled_days: 0,
      error_count: 0,
    }));

    const { error: insertError } = await client
      .from('user_word_statuses')
      .insert(newStatuses);

    if (insertError) {
      console.error('[getWordsFromMaterial] Error creating word statuses:', insertError);
    } else {
      // Update statusMap with new statuses
      for (const status of newStatuses) {
        statusMap.set(status.word_id, status);
      }
    }
  }

  // Build the result
  const words: LearningWord[] = wordsToReturn.map(word => {
    const status = statusMap.get(word.id);
    return {
      id: status?.id || '',
      wordId: word.id,
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
): Promise<{ words: { id: string; text: string }[], error?: string }> {
  const session = await auth();
  if (!session?.user?.id) return { words: [], error: 'Unauthorized' };

  const client = supabaseAdmin || supabase;

  // Get random words excluding the correct answer
  const { data: words, error } = await client
    .from('words')
    .select('id, text')
    .not('id', 'in', `(${excludeWordIds.join(',')})`)
    .is('deleted_at', null)
    .limit(100);

  if (error) {
    console.error('[getRandomWords] Error:', error);
    return { words: [], error: error.message };
  }

  // Shuffle and pick random words
  const shuffled = (words || []).sort(() => Math.random() - 0.5);
  return { words: shuffled.slice(0, count) };
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

  const client = supabaseAdmin || supabase;
  const { userWordStatusId, isCorrect, responseTimeMs, errorCount, mode } = params;

  // Get current word status
  const { data: wordStatus, error: fetchError } = await client
    .from('user_word_statuses')
    .select('*')
    .eq('id', userWordStatusId)
    .eq('user_id', session.user.id)
    .single();

  if (fetchError || !wordStatus) {
    return { success: false, error: 'Word status not found' };
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
  const { error: updateError } = await client
    .from('user_word_statuses')
    .update({
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
    })
    .eq('id', userWordStatusId);

  if (updateError) {
    console.error('[recordReview] Update error:', updateError);
    return { success: false, error: updateError.message };
  }

  // Record review history
  const { error: reviewError } = await client
    .from('word_reviews')
    .insert({
      id: randomUUID(),
      user_word_status_id: userWordStatusId,
      rating,
      mode,
      response_time_ms: responseTimeMs,
      was_correct: isCorrect,
      error_count: errorCount,
      new_stability: newCard.stability,
      new_difficulty: newCard.difficulty,
      new_due: newCard.due.toISOString(),
    });

  if (reviewError) {
    console.error('[recordReview] Review insert error:', reviewError);
    // Non-critical, continue
  }

  revalidatePath('/vocab');
  revalidatePath('/learn');

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

  const client = supabaseAdmin || supabase;

  // Verify the word status belongs to the user
  const { data: wordStatus, error: fetchError } = await client
    .from('user_word_statuses')
    .select('*')
    .eq('id', userWordStatusId)
    .eq('user_id', session.user.id)
    .single();

  if (fetchError || !wordStatus) {
    return { success: false, error: 'Word status not found' };
  }

  const now = new Date();

  // Update word status to MASTERED with high stability
  const { error: updateError } = await client
    .from('user_word_statuses')
    .update({
      status: 'MASTERED',
      fsrs_stability: 365, // Very high stability - won't be scheduled for a long time
      fsrs_state: State.Review,
      fsrs_last_review: now.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('id', userWordStatusId);

  if (updateError) {
    console.error('[markAsMastered] Update error:', updateError);
    return { success: false, error: updateError.message };
  }

  revalidatePath('/vocab');
  revalidatePath('/learn');

  return {
    success: true,
    newStatus: 'MASTERED',
  };
}

/**
 * Get learning statistics
 */
export async function getLearningStats(materialId?: string): Promise<{
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

  const client = supabaseAdmin || supabase;

  // If materialId is provided, get stats only for words from that material
  let wordIdsInMaterial: Set<string> | null = null;
  
  if (materialId) {
    // Get sentences from material
    const { data: sentences } = await client
      .from('sentences')
      .select('id')
      .eq('material_id', materialId)
      .is('deleted_at', null);
    
    if (sentences && sentences.length > 0) {
      const sentenceIds = sentences.map(s => s.id);
      
      // Get word occurrences in batches
      const BATCH_SIZE = 50;
      wordIdsInMaterial = new Set<string>();
      
      for (let i = 0; i < sentenceIds.length; i += BATCH_SIZE) {
        const batch = sentenceIds.slice(i, i + BATCH_SIZE);
        const { data: occurrences } = await client
          .from('word_occurrences')
          .select('word_id')
          .in('sentence_id', batch);
        
        if (occurrences) {
          for (const occ of occurrences) {
            wordIdsInMaterial.add(occ.word_id);
          }
        }
      }
    }
    
    if (!wordIdsInMaterial || wordIdsInMaterial.size === 0) {
      return { totalNew: 0, totalLearning: 0, totalMastered: 0, dueToday: 0 };
    }
  }

  // Get counts by status
  const { data: statusCounts, error: countError } = await client
    .from('user_word_statuses')
    .select('status, word_id')
    .eq('user_id', session.user.id);

  if (countError) {
    return { totalNew: 0, totalLearning: 0, totalMastered: 0, dueToday: 0, error: countError.message };
  }

  // Filter by material if needed
  let filteredStatuses = statusCounts || [];
  if (wordIdsInMaterial) {
    filteredStatuses = filteredStatuses.filter((ws: { word_id: string }) => 
      wordIdsInMaterial!.has(ws.word_id)
    );
  }

  const counts = filteredStatuses.reduce((acc: Record<string, number>, ws: { status: string }) => {
    acc[ws.status] = (acc[ws.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Get words due today
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  // For material-filtered stats, we need to count from the filtered data
  let dueCount = 0;
  if (wordIdsInMaterial) {
    // Get all statuses for words in material that are due
    const { data: dueStatuses } = await client
      .from('user_word_statuses')
      .select('word_id')
      .eq('user_id', session.user.id)
      .in('status', ['NEW', 'LEARNING'])
      .or(`fsrs_due.is.null,fsrs_due.lte.${today.toISOString()}`);
    
    if (dueStatuses) {
      dueCount = dueStatuses.filter((ws: { word_id: string }) => 
        wordIdsInMaterial!.has(ws.word_id)
      ).length;
    }
    
    // Also count words in material that don't have a status yet (truly new)
    const wordIdsWithStatus = new Set(filteredStatuses.map((ws: { word_id: string }) => ws.word_id));
    const newWordsWithoutStatus = Array.from(wordIdsInMaterial).filter(id => !wordIdsWithStatus.has(id)).length;
    
    // Add unseen words to NEW count and dueToday
    counts['NEW'] = (counts['NEW'] || 0) + newWordsWithoutStatus;
    dueCount += newWordsWithoutStatus;
  } else {
    const { count } = await client
      .from('user_word_statuses')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', session.user.id)
      .in('status', ['NEW', 'LEARNING'])
      .or(`fsrs_due.is.null,fsrs_due.lte.${today.toISOString()}`);
    
    dueCount = count || 0;
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

  const client = supabaseAdmin || supabase;
  
  // If we have material filter, we need to get word IDs from that material first
  let filteredWordIds: string[] | null = null;
  
  if (filters?.materialId) {
    // Get sentences from material
    const { data: sentences } = await client
      .from('sentences')
      .select('id')
      .eq('material_id', filters.materialId)
      .is('deleted_at', null);
    
    if (sentences && sentences.length > 0) {
      const sentenceIds = sentences.map(s => s.id);
      
      // Get word occurrences
      const { data: occurrences } = await client
        .from('word_occurrences')
        .select('word_id')
        .in('sentence_id', sentenceIds);
      
      if (occurrences) {
        filteredWordIds = [...new Set(occurrences.map(o => o.word_id))];
      }
    }
    
    if (!filteredWordIds || filteredWordIds.length === 0) {
      return { words: [], error: 'No words found for this material' };
    }
  }
  
  // Get words with status NEW or LEARNING, ordered by due date
  let query = client
    .from('user_word_statuses')
    .select(`
      id,
      word_id,
      status,
      fsrs_due,
      fsrs_stability,
      fsrs_difficulty,
      fsrs_reps,
      fsrs_lapses,
      fsrs_state,
      error_count,
      words:word_id (
        id,
        text,
        phonetic,
        translation,
        definition,
        pos,
        exchange,
        oxford,
        collins,
        deleted_at
      )
    `)
    .eq('user_id', session.user.id)
    .in('status', ['NEW', 'LEARNING']);
  
  // Apply word ID filter if we have material filter
  if (filteredWordIds) {
    query = query.in('word_id', filteredWordIds);
  }
  
  query = query
    .order('fsrs_due', { ascending: true, nullsFirst: true })
    .limit(limit * 3); // Fetch extra since some may not have sentences

  const { data: wordStatuses, error } = await query;

  if (error) {
    console.error('[getWordsForContextListening] Error:', error);
    return { words: [], error: error.message };
  }

  // Filter by oxford/collins/frequency if needed
  let filteredStatuses = wordStatuses || [];
  
  // Filter out deleted words first
  filteredStatuses = filteredStatuses.filter((ws: any) => {
    const word = ws.words;
    return word && !word.deleted_at;
  });
  
  if (filters?.oxford !== undefined) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filteredStatuses = filteredStatuses.filter((ws: any) => {
      const word = ws.words;
      return filters.oxford ? word?.oxford === 1 : word?.oxford !== 1;
    });
  }
  
  if (filters?.collins && filters.collins.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    filteredStatuses = filteredStatuses.filter((ws: any) => {
      const word = ws.words;
      return filters.collins!.includes(word?.collins);
    });
  }

  // Get word IDs that we'll fetch sentences for
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const wordIds = filteredStatuses.map((ws: any) => ws.words?.id || ws.word_id).filter(Boolean);
  
  if (wordIds.length === 0) {
    return { words: [] };
  }

  // Get all word occurrences with sentences for these words
  const { data: occurrencesData, error: occError } = await client
    .from('word_occurrences')
    .select(`
      word_id,
      start_index,
      end_index,
      sentence:sentences!inner(
        id,
        content,
        start_time,
        end_time,
        material:materials!inner(
          id,
          title,
          user_id
        )
      )
    `)
    .in('word_id', wordIds)
    .eq('sentence.material.user_id', session.user.id)
    .is('sentence.deleted_at', null);

  if (occError) {
    console.error('[getWordsForContextListening] Occurrences error:', occError);
    return { words: [], error: occError.message };
  }

  // Group occurrences by word_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const occurrencesByWordId: Record<string, any[]> = {};
  for (const occ of (occurrencesData || [])) {
    if (!occurrencesByWordId[occ.word_id]) {
      occurrencesByWordId[occ.word_id] = [];
    }
    occurrencesByWordId[occ.word_id].push(occ);
  }

  // Build the result, only include words that have at least one sentence
  const contextWords: ContextListeningWord[] = [];
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const ws of filteredStatuses as any[]) {
    const word = ws.words;
    const wordId = word?.id || ws.word_id;
    const occurrences = occurrencesByWordId[wordId];
    
    if (!occurrences || occurrences.length === 0) {
      continue; // Skip words without sentences
    }
    
    // Pick a random sentence from the available ones
    const randomOcc = occurrences[Math.floor(Math.random() * occurrences.length)];
    const sentence = randomOcc.sentence;
    
    if (!sentence || !sentence.material) {
      continue;
    }

    contextWords.push({
      id: ws.id,
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
        id: sentence.id,
        content: sentence.content,
        startTime: sentence.start_time || 0,
        endTime: sentence.end_time || 0,
        materialId: sentence.material.id,
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

  const client = supabaseAdmin || supabase;
  
  try {
    // Get today's date at midnight (normalized)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    // Check if we already have a record for today
    const { data: existingStat, error: fetchError } = await client
      .from('daily_study_stats')
      .select('id, study_duration')
      .eq('user_id', session.user.id)
      .eq('date', todayStr)
      .maybeSingle();

    if (fetchError) {
      console.error('[recordLearningSessionDuration] Fetch error:', fetchError);
      return { success: false, error: fetchError.message };
    }

    if (existingStat) {
      // Update existing record
      const { error: updateError } = await client
        .from('daily_study_stats')
        .update({
          study_duration: existingStat.study_duration + durationSeconds,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingStat.id);

      if (updateError) {
        console.error('[recordLearningSessionDuration] Update error:', updateError);
        return { success: false, error: updateError.message };
      }
    } else {
      // Create new record
      const { error: insertError } = await client
        .from('daily_study_stats')
        .insert({
          id: randomUUID(),
          user_id: session.user.id,
          date: todayStr,
          study_duration: durationSeconds,
          words_added: 0,
          sentences_added: 0,
          updated_at: new Date().toISOString(),
        });

      if (insertError) {
        console.error('[recordLearningSessionDuration] Insert error:', insertError);
        return { success: false, error: insertError.message };
      }
    }

    revalidatePath('/dashboard');
    return { success: true };
  } catch (error) {
    console.error('[recordLearningSessionDuration] Error:', error);
    return { success: false, error: 'Failed to record learning duration' };
  }
}
