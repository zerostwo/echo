'use server';

import { auth } from '@/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import * as Diff from 'diff';
import { revalidatePath } from 'next/cache';
import { startOfDay } from 'date-fns';
import { randomUUID } from 'crypto';

export async function evaluateDictation(sentenceId: string, userText: string, duration: number = 0) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };

  const client = supabaseAdmin || supabase;

  if (!supabaseAdmin) {
    console.warn('evaluateDictation: SUPABASE_SERVICE_ROLE_KEY is missing. Using anonymous client, which may fail RLS policies for progress tracking.');
  }

  const { data: sentence, error } = await client
    .from('Sentence')
    .select(`
        *,
        material:Material(*)
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
  
  if (sentence.material.userId !== session.user.id) return { error: 'Unauthorized' };

  // Normalize for comparison
  const normalize = (s: string) => s.trim().toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g,"");
  
  const target = normalize(sentence.content);
  const attempt = normalize(userText);

  const diff = Diff.diffWords(target, attempt);
  
  let matchCount = 0;
  const totalWords = target.split(/\s+/).filter(w => w.length > 0).length;
  const attemptWords = attempt.split(/\s+/).filter(w => w.length > 0).length;
  
  diff.forEach(part => {
      if (!part.added && !part.removed) {
          const words = part.value.trim().split(/\s+/).filter(w => w.length > 0);
          matchCount += words.length;
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
        .from('PracticeProgress')
        .select('*')
        .eq('userId', session.user.id)
        .eq('sentenceId', sentenceId)
        .maybeSingle();

    if (progressFetchError) {
        console.error("Error fetching practice progress:", progressFetchError);
    }

    if (existingProgress) {
        const { error: updateError } = await client
            .from('PracticeProgress')
            .update({
                score: score,
                attempts: existingProgress.attempts + 1,
                duration: existingProgress.duration + duration,
                updatedAt: new Date().toISOString()
            })
            .eq('id', existingProgress.id);
            
        if (updateError) {
            console.error("Error updating practice progress:", updateError);
        }
    } else {
        const { error: insertError } = await client
            .from('PracticeProgress')
            .insert({
                id: randomUUID(),
                userId: session.user.id,
                sentenceId: sentenceId,
                score: score,
                attempts: 1,
                duration: duration,
                updatedAt: new Date().toISOString()
            });
            
        if (insertError) {
            console.error("Error inserting practice progress:", insertError);
        }
    }

    // Update daily stats
    const today = startOfDay(new Date()).toISOString();
    const { data: existingStat, error: statFetchError } = await client
        .from('DailyStudyStat')
        .select('*')
        .eq('userId', session.user.id)
        .eq('date', today)
        .maybeSingle();
    
    if (statFetchError) {
        console.error("Error fetching daily stat:", statFetchError);
    }

    if (existingStat) {
        const { error: updateError } = await client
            .from('DailyStudyStat')
            .update({ 
                studyDuration: existingStat.studyDuration + duration,
                updatedAt: new Date().toISOString()
            })
            .eq('id', existingStat.id);
        
        if (updateError) {
            console.error("Error updating daily stat:", updateError);
        }
    } else {
        const { error: insertError } = await client
            .from('DailyStudyStat')
            .insert({
                id: randomUUID(),
                userId: session.user.id,
                date: today,
                studyDuration: duration,
                updatedAt: new Date().toISOString()
            });
        
        if (insertError) {
            console.error("Error inserting daily stat:", insertError);
        }
    }

  } catch (e) {
      console.error("Failed to save progress", e);
      // Don't fail the whole request, but log it.
      // In a real app we might want to return a warning.
  }
  
  revalidatePath('/materials'); // Revalidate materials list to show updated practice stats
  revalidatePath(`/listening/${sentenceId}`); // Revalidate current page just in case

  return {
      success: true,
      score,
      diff,
      target: sentence.content
  };
}
