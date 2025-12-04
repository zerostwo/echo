'use server';

import { auth } from '@/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import * as Diff from 'diff';
import { revalidatePath } from 'next/cache';
import { startOfDay } from 'date-fns';
import { randomUUID } from 'crypto';
import { 
  createEmptyCard, 
  fsrs, 
  Rating, 
  State,
  type Card as FSRSCard,
} from 'ts-fsrs';

const f = fsrs();

export async function evaluateDictation(sentenceId: string, userText: string, duration: number = 0) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };

  const client = supabaseAdmin || supabase;

  if (!supabaseAdmin) {
    console.warn('evaluateDictation: SUPABASE_SERVICE_ROLE_KEY is missing. Using anonymous client, which may fail RLS policies for progress tracking.');
  }

  const { data: sentence, error } = await client
    .from('sentences')
    .select(`
        *,
        material:materials(*)
    `)
    .eq('id', sentenceId)
    .single();

  if (error) {
      console.error("evaluateDictation: Database error fetching sentence:", error);
      return { error: 'Database error' };
  }

  if (!sentence) {
      console.error(`evaluateDictation: Sentence not found for ID: ${sentenceId}`);
      return { error: 'Sentence not found' };
  }

  if (!sentence.material) {
       console.error(`evaluateDictation: Material not found for sentence ID: ${sentenceId}`);
       return { error: 'Material not found' };
  }

  if (sentence.deleted_at) {
      return { error: 'Sentence is in trash' };
  }
  
  if (sentence.material.user_id !== session.user.id) return { error: 'Unauthorized' };

  // Normalize for comparison
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g,"");
  
  const displayContent = sentence.edited_content ?? sentence.content;
  const target = normalize(displayContent);
  const attempt = normalize(userText);

  const diff = Diff.diffWords(target, attempt);
  
  let matchCount = 0;
  const totalWords = target.split(/\s+/).filter(w => w.length > 0).length;
  const attemptWords = attempt.split(/\s+/).filter(w => w.length > 0).length;
  
  // Track missed/wrong words and correct words
  const missedWords: string[] = []; // Words from target that were missing or wrong
  const correctWords: string[] = []; // Words that were typed correctly
  
  diff.forEach(part => {
      if (!part.added && !part.removed) {
          const words = part.value.trim().split(/\s+/).filter(w => w.length > 0);
          matchCount += words.length;
          correctWords.push(...words.map(w => w.toLowerCase()));
      } else if (part.removed) {
          // These words were in target but missing from user's attempt
          const words = part.value.trim().split(/\s+/).filter(w => w.length > 0);
          missedWords.push(...words.map(w => w.toLowerCase()));
      }
  });

  const denominator = Math.max(totalWords, attemptWords);
  const score = denominator > 0 ? Math.min(100, Math.round((matchCount / denominator) * 100)) : 100;

  // Save progress
  try {
    // Upsert PracticeProgress
    // We first check if it exists to increment attempts properly, or use upsert with default?
    // Supabase upsert replaces unless we specify otherwise. Incrementing requires knowing previous value.
    // Fetch existing
    const { data: existingProgress, error: progressFetchError } = await client
        .from('practice_progress')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('sentence_id', sentenceId)
        .maybeSingle();

    if (progressFetchError) {
        console.error("Error fetching practice progress:", progressFetchError);
    }

    if (existingProgress) {
        const { error: updateError } = await client
            .from('practice_progress')
            .update({
                score: score,
                attempts: existingProgress.attempts + 1,
                duration: existingProgress.duration + duration,
                updated_at: new Date().toISOString()
            })
            .eq('id', existingProgress.id);
            
        if (updateError) {
            console.error("Error updating practice progress:", updateError);
        }
    } else {
        const { error: insertError } = await client
            .from('practice_progress')
            .insert({
                id: randomUUID(),
                user_id: session.user.id,
                sentence_id: sentenceId,
                score: score,
                attempts: 1,
                duration: duration,
                updated_at: new Date().toISOString()
            });
            
        if (insertError) {
            console.error("Error inserting practice progress:", insertError);
        }
    }

    // Update daily stats
    const today = startOfDay(new Date()).toISOString();
    const { data: existingStat, error: statFetchError } = await client
        .from('daily_study_stats')
        .select('*')
        .eq('user_id', session.user.id)
        .eq('date', today)
        .maybeSingle();
    
    if (statFetchError) {
        console.error("Error fetching daily stat:", statFetchError);
    }

    if (existingStat) {
        const { error: updateError } = await client
            .from('daily_study_stats')
            .update({ 
                study_duration: existingStat.study_duration + duration,
                updated_at: new Date().toISOString()
            })
            .eq('id', existingStat.id);
        
        if (updateError) {
            console.error("Error updating daily stat:", updateError);
        }
    } else {
        const { error: insertError } = await client
            .from('daily_study_stats')
            .insert({
                id: randomUUID(),
                user_id: session.user.id,
                date: today,
                study_duration: duration,
                updated_at: new Date().toISOString()
            });
        
        if (insertError) {
            console.error("Error inserting daily stat:", insertError);
        }
    }

    // Update word statuses based on dictation results
    // Get all words associated with this sentence via word_occurrences
    if (missedWords.length > 0 || correctWords.length > 0) {
      const { data: wordOccurrences } = await client
        .from('word_occurrences')
        .select(`
          word_id,
          words:word_id (
            id,
            text,
            exchange
          )
        `)
        .eq('sentence_id', sentenceId);

      if (wordOccurrences && wordOccurrences.length > 0) {
        const now = new Date();
        
        // Build a map of word text (and all its forms) to word_id
        const wordFormToId = new Map<string, string>();
        for (const occ of wordOccurrences) {
          const word = (occ as any).words;
          if (word) {
            // Add the lemma
            wordFormToId.set(word.text.toLowerCase(), word.id);
            
            // Add all word forms from exchange
            if (word.exchange) {
              const parts = word.exchange.split('/');
              for (const part of parts) {
                const colonIndex = part.indexOf(':');
                if (colonIndex > 0) {
                  const form = part.substring(colonIndex + 1).trim().toLowerCase();
                  if (form) {
                    wordFormToId.set(form, word.id);
                  }
                }
              }
            }
          }
        }
        
        // Find word IDs for missed words
        const missedWordIds = new Set<string>();
        for (const missed of missedWords) {
          const wordId = wordFormToId.get(missed.toLowerCase());
          if (wordId) {
            missedWordIds.add(wordId);
          }
        }
        
        // Find word IDs for correct words
        const correctWordIds = new Set<string>();
        for (const correct of correctWords) {
          const wordId = wordFormToId.get(correct.toLowerCase());
          if (wordId && !missedWordIds.has(wordId)) {
            correctWordIds.add(wordId);
          }
        }
        
        // Update word statuses for missed words (increase error count, reset FSRS)
        for (const wordId of missedWordIds) {
          await updateWordStatusOnDictationError(client, session.user.id, wordId, now);
        }
        
        // Update word statuses for correct words (improve FSRS state)
        for (const wordId of correctWordIds) {
          await updateWordStatusOnDictationSuccess(client, session.user.id, wordId, now);
        }
      }
    }

  } catch (e) {
      console.error("Failed to save progress", e);
      // Don't fail the whole request, but log it.
      // In a real app we might want to return a warning.
  }
  
  revalidatePath('/materials'); // Revalidate materials list to show updated practice stats
  revalidatePath(`/listening/${sentenceId}`); // Revalidate current page just in case
  revalidatePath('/vocab'); // Revalidate vocab page for updated word statuses

  return {
      success: true,
      score,
      diff,
      target: displayContent
  };
}

/**
 * Update word status when user makes an error in dictation
 */
async function updateWordStatusOnDictationError(
  client: typeof supabase,
  userId: string,
  wordId: string,
  now: Date
) {
  // Get or create user word status
  const { data: existingStatus } = await client
    .from('user_word_statuses')
    .select('*')
    .eq('user_id', userId)
    .eq('word_id', wordId)
    .maybeSingle();

  if (existingStatus) {
    // Build FSRS card from current state
    let currentCard: FSRSCard;
    if (existingStatus.fsrs_reps === 0 || existingStatus.fsrs_reps === null) {
      currentCard = createEmptyCard(now);
    } else {
      currentCard = {
        due: existingStatus.fsrs_due ? new Date(existingStatus.fsrs_due) : now,
        stability: existingStatus.fsrs_stability || 0,
        difficulty: existingStatus.fsrs_difficulty || 0,
        elapsed_days: existingStatus.fsrs_elapsed_days || 0,
        scheduled_days: existingStatus.fsrs_scheduled_days || 0,
        reps: existingStatus.fsrs_reps || 0,
        lapses: existingStatus.fsrs_lapses || 0,
        state: (existingStatus.fsrs_state || 0) as State,
        last_review: existingStatus.fsrs_last_review ? new Date(existingStatus.fsrs_last_review) : undefined,
      } as FSRSCard;
    }

    // Apply "Again" rating for error
    const recordLog = f.repeat(currentCard, now);
    const newCard = recordLog[Rating.Again].card;

    await client
      .from('user_word_statuses')
      .update({
        status: 'LEARNING', // Reset to learning on error
        fsrs_due: newCard.due.toISOString(),
        fsrs_stability: newCard.stability,
        fsrs_difficulty: newCard.difficulty,
        fsrs_elapsed_days: newCard.elapsed_days,
        fsrs_scheduled_days: newCard.scheduled_days,
        fsrs_reps: newCard.reps,
        fsrs_lapses: newCard.lapses,
        fsrs_state: newCard.state,
        fsrs_last_review: now.toISOString(),
        error_count: (existingStatus.error_count || 0) + 1,
        last_error_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', existingStatus.id);
  } else {
    // Create new word status with error
    const newCard = createEmptyCard(now);
    const recordLog = f.repeat(newCard, now);
    const afterError = recordLog[Rating.Again].card;

    await client
      .from('user_word_statuses')
      .insert({
        id: randomUUID(),
        user_id: userId,
        word_id: wordId,
        status: 'LEARNING',
        fsrs_due: afterError.due.toISOString(),
        fsrs_stability: afterError.stability,
        fsrs_difficulty: afterError.difficulty,
        fsrs_elapsed_days: afterError.elapsed_days,
        fsrs_scheduled_days: afterError.scheduled_days,
        fsrs_reps: afterError.reps,
        fsrs_lapses: afterError.lapses,
        fsrs_state: afterError.state,
        fsrs_last_review: now.toISOString(),
        error_count: 1,
        last_error_at: now.toISOString(),
      });
  }
}

/**
 * Update word status when user correctly types a word in dictation
 */
async function updateWordStatusOnDictationSuccess(
  client: typeof supabase,
  userId: string,
  wordId: string,
  now: Date
) {
  // Get or create user word status
  const { data: existingStatus } = await client
    .from('user_word_statuses')
    .select('*')
    .eq('user_id', userId)
    .eq('word_id', wordId)
    .maybeSingle();

  if (existingStatus) {
    // Only update if word is in NEW or LEARNING state
    if (existingStatus.status === 'MASTERED') {
      return; // Already mastered, no need to update
    }

    // Build FSRS card from current state
    let currentCard: FSRSCard;
    if (existingStatus.fsrs_reps === 0 || existingStatus.fsrs_reps === null) {
      currentCard = createEmptyCard(now);
    } else {
      currentCard = {
        due: existingStatus.fsrs_due ? new Date(existingStatus.fsrs_due) : now,
        stability: existingStatus.fsrs_stability || 0,
        difficulty: existingStatus.fsrs_difficulty || 0,
        elapsed_days: existingStatus.fsrs_elapsed_days || 0,
        scheduled_days: existingStatus.fsrs_scheduled_days || 0,
        reps: existingStatus.fsrs_reps || 0,
        lapses: existingStatus.fsrs_lapses || 0,
        state: (existingStatus.fsrs_state || 0) as State,
        last_review: existingStatus.fsrs_last_review ? new Date(existingStatus.fsrs_last_review) : undefined,
      } as FSRSCard;
    }

    // Apply "Good" rating for correct answer in dictation
    const recordLog = f.repeat(currentCard, now);
    const newCard = recordLog[Rating.Good].card;

    // Determine new status
    let newStatus = existingStatus.status;
    if (newCard.state === State.Review && newCard.stability > 21) {
      newStatus = 'MASTERED';
    } else if (newCard.state === State.Learning || newCard.state === State.Relearning) {
      newStatus = 'LEARNING';
    } else if (newCard.state === State.Review) {
      newStatus = 'LEARNING';
    }

    await client
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
        updated_at: now.toISOString(),
      })
      .eq('id', existingStatus.id);
  }
  // If no existing status, don't create one - user needs to explicitly add words to vocabulary
}
