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
 */
export async function getWordsForLearning(limit: number = 20, filters?: LearningFilters): Promise<{ words: LearningWord[], error?: string }> {
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
        oxford,
        collins
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
    .limit(limit * 2); // Fetch extra to filter

  const { data: wordStatuses, error } = await query;

  if (error) {
    console.error('[getWordsForLearning] Error:', error);
    return { words: [], error: error.message };
  }

  // Filter by oxford/collins/frequency if needed
  let filteredStatuses = wordStatuses || [];
  
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
  mode: 'typing' | 'multiple_choice'
): Grade {
  if (!isCorrect || errorCount > 0) {
    // If wrong, use Again (1)
    return Rating.Again;
  }

  // For correct answers, use response time to determine rating
  const avgResponseTime = mode === 'typing' ? 5000 : 3000; // Expected average response time in ms

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
  mode: 'typing' | 'multiple_choice';
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
 * Get learning statistics
 */
export async function getLearningStats(): Promise<{
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

  // Get counts by status
  const { data: statusCounts, error: countError } = await client
    .from('user_word_statuses')
    .select('status')
    .eq('user_id', session.user.id);

  if (countError) {
    return { totalNew: 0, totalLearning: 0, totalMastered: 0, dueToday: 0, error: countError.message };
  }

  const counts = (statusCounts || []).reduce((acc: Record<string, number>, ws: { status: string }) => {
    acc[ws.status] = (acc[ws.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Get words due today
  const today = new Date();
  today.setHours(23, 59, 59, 999);

  const { count: dueCount } = await client
    .from('user_word_statuses')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', session.user.id)
    .in('status', ['NEW', 'LEARNING'])
    .or(`fsrs_due.is.null,fsrs_due.lte.${today.toISOString()}`);

  return {
    totalNew: counts['NEW'] || 0,
    totalLearning: counts['LEARNING'] || 0,
    totalMastered: counts['MASTERED'] || 0,
    dueToday: dueCount || 0,
  };
}
