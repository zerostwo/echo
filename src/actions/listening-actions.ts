'use server';

import { auth } from '@/auth';
import { getAdminClient } from '@/lib/appwrite';
import { 
    DATABASE_ID, 
    SENTENCES_COLLECTION_ID, 
    MATERIALS_COLLECTION_ID, 
    WORDS_COLLECTION_ID, 
    WORD_OCCURRENCES_COLLECTION_ID, 
    PRACTICE_PROGRESS_COLLECTION_ID,
    USER_WORD_STATUSES_COLLECTION_ID,
    DAILY_STUDY_STATS_COLLECTION_ID
} from '@/lib/appwrite_client';
import { ID, Query } from 'node-appwrite';
import * as Diff from 'diff';
import { revalidatePath } from 'next/cache';
import { startOfDay } from 'date-fns';
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

  // Use admin client for all database operations to avoid permission issues
  const { databases } = await getAdminClient();

  try {
    const sentence = await databases.getDocument(
        DATABASE_ID,
        SENTENCES_COLLECTION_ID,
        sentenceId
    );

    if (!sentence) {
        return { error: 'Sentence not found' };
    }

    if (sentence.deleted_at) {
        return { error: 'Sentence is in trash' };
    }

    const material = await databases.getDocument(
        DATABASE_ID,
        MATERIALS_COLLECTION_ID,
        sentence.material_id
    );

    if (!material) {
         return { error: 'Material not found' };
    }
    
    if (material.user_id !== session.user.id) return { error: 'Unauthorized' };

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
        const existingProgressList = await databases.listDocuments(
            DATABASE_ID,
            PRACTICE_PROGRESS_COLLECTION_ID,
            [
                Query.equal('user_id', session.user.id),
                Query.equal('sentence_id', sentenceId),
                Query.limit(1)
            ]
        );

        if (existingProgressList.total > 0) {
            const existingProgress = existingProgressList.documents[0];
            await databases.updateDocument(
                DATABASE_ID,
                PRACTICE_PROGRESS_COLLECTION_ID,
                existingProgress.$id,
                {
                    score: score,
                    attempts: (existingProgress.attempts || 0) + 1,
                    duration: (existingProgress.duration || 0) + duration
                }
            );
        } else {
            await databases.createDocument(
                DATABASE_ID,
                PRACTICE_PROGRESS_COLLECTION_ID,
                ID.unique(),
                {
                    user_id: session.user.id,
                    sentence_id: sentenceId,
                    score: score,
                    attempts: 1,
                    duration: duration
                }
            );
        }

        // Update daily stats
        const today = startOfDay(new Date()).toISOString();
        const existingStatList = await databases.listDocuments(
            DATABASE_ID,
            DAILY_STUDY_STATS_COLLECTION_ID,
            [
                Query.equal('user_id', session.user.id),
                Query.equal('date', today),
                Query.limit(1)
            ]
        );
        
        if (existingStatList.total > 0) {
            const existingStat = existingStatList.documents[0];
            await databases.updateDocument(
                DATABASE_ID,
                DAILY_STUDY_STATS_COLLECTION_ID,
                existingStat.$id,
                { 
                    study_duration: (existingStat.study_duration || 0) + duration
                }
            );
        } else {
            await databases.createDocument(
                DATABASE_ID,
                DAILY_STUDY_STATS_COLLECTION_ID,
                ID.unique(),
                {
                    user_id: session.user.id,
                    date: today,
                    study_duration: duration
                }
            );
        }

        // Update word statuses based on dictation results
        if (missedWords.length > 0 || correctWords.length > 0) {
            // Get all words associated with this sentence via word_occurrences
            const wordOccurrences = await databases.listDocuments(
                DATABASE_ID,
                WORD_OCCURRENCES_COLLECTION_ID,
                [Query.equal('sentence_id', sentenceId)]
            );

            if (wordOccurrences.total > 0) {
                const wordIds = wordOccurrences.documents.map((o: any) => o.word_id);
                // Fetch words details
                // Appwrite limit is usually 100 for equal array
                const wordsList = await databases.listDocuments(
                    DATABASE_ID,
                    WORDS_COLLECTION_ID,
                    [Query.equal('$id', wordIds)]
                );

                const now = new Date();
                
                // Build a map of word text (and all its forms) to word_id
                const wordFormToId = new Map<string, string>();
                for (const word of wordsList.documents) {
                    // Add the lemma
                    wordFormToId.set(word.text.toLowerCase(), word.$id);
                    
                    // Add all word forms from exchange
                    if (word.exchange) {
                        const parts = word.exchange.split('/');
                        for (const part of parts) {
                            const colonIndex = part.indexOf(':');
                            if (colonIndex > 0) {
                                const form = part.substring(colonIndex + 1).trim().toLowerCase();
                                if (form) {
                                    wordFormToId.set(form, word.$id);
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
                    await updateWordStatusOnDictationError(databases, session.user.id, wordId, now);
                }
                
                // Update word statuses for correct words (improve FSRS state)
                for (const wordId of correctWordIds) {
                    await updateWordStatusOnDictationSuccess(databases, session.user.id, wordId, now);
                }
            }
        }

    } catch (e) {
        console.error("Failed to save progress", e);
    }
    
    revalidatePath('/materials');
    revalidatePath(`/study/sentences/${sentenceId}`);
    revalidatePath('/words');

    return {
        success: true,
        score,
        diff,
        target: displayContent
    };

  } catch (error) {
      console.error("evaluateDictation: Error:", error);
      return { error: 'Internal server error' };
  }
}

/**
 * Update word status when user makes an error in dictation
 */
async function updateWordStatusOnDictationError(
  databases: any,
  userId: string,
  wordId: string,
  now: Date
) {
  // Get or create user word status
  const existingStatusList = await databases.listDocuments(
    DATABASE_ID,
    USER_WORD_STATUSES_COLLECTION_ID,
    [
        Query.equal('user_id', userId),
        Query.equal('word_id', wordId),
        Query.limit(1)
    ]
  );

  if (existingStatusList.total > 0) {
    const existingStatus = existingStatusList.documents[0];
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

    await databases.updateDocument(
      DATABASE_ID,
      USER_WORD_STATUSES_COLLECTION_ID,
      existingStatus.$id,
      {
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
        last_error_at: now.toISOString()
      }
    );
  } else {
    // Create new word status with error
    const newCard = createEmptyCard(now);
    const recordLog = f.repeat(newCard, now);
    const afterError = recordLog[Rating.Again].card;

    await databases.createDocument(
      DATABASE_ID,
      USER_WORD_STATUSES_COLLECTION_ID,
      ID.unique(),
      {
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
        last_error_at: now.toISOString()
      }
    );
  }
}

/**
 * Update word status when user correctly types a word in dictation
 */
async function updateWordStatusOnDictationSuccess(
  databases: any,
  userId: string,
  wordId: string,
  now: Date
) {
  // Get or create user word status
  const existingStatusList = await databases.listDocuments(
    DATABASE_ID,
    USER_WORD_STATUSES_COLLECTION_ID,
    [
        Query.equal('user_id', userId),
        Query.equal('word_id', wordId),
        Query.limit(1)
    ]
  );

  if (existingStatusList.total > 0) {
    const existingStatus = existingStatusList.documents[0];
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

    await databases.updateDocument(
      DATABASE_ID,
      USER_WORD_STATUSES_COLLECTION_ID,
      existingStatus.$id,
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
        fsrs_last_review: now.toISOString()
      }
    );
  }
  // If no existing status, don't create one - user needs to explicitly add words to vocabulary
}
