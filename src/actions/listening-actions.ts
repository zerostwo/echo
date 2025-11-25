'use server';

import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import * as Diff from 'diff';
import { revalidatePath } from 'next/cache';
import { startOfDay } from 'date-fns';

export async function evaluateDictation(sentenceId: string, userText: string, duration: number = 0) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Unauthorized' };

  const sentence = await prisma.sentence.findUnique({
    where: { id: sentenceId },
    include: { material: true }
  });

  if (!sentence) return { error: 'Sentence not found' };
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
    await prisma.$transaction(async (tx) => {
        await tx.practiceProgress.upsert({
            where: {
                userId_sentenceId: {
                    userId: session.user.id!,
                    sentenceId: sentenceId
                }
            },
            update: {
                score: score, 
                attempts: { increment: 1 },
                duration: { increment: duration }
            },
            create: {
                userId: session.user.id!,
                sentenceId: sentenceId,
                score: score,
                attempts: 1,
                duration: duration
            }
        });

        // Update daily stats
        const today = startOfDay(new Date());
        await tx.dailyStudyStat.upsert({
            where: {
                userId_date: {
                    userId: session.user.id!,
                    date: today
                }
            },
            update: {
                studyDuration: { increment: duration }
            },
            create: {
                userId: session.user.id!,
                date: today,
                studyDuration: duration
            }
        });
    });

  } catch (e) {
      console.error("Failed to save progress", e);
  }
  
  revalidatePath('/materials'); // Revalidate materials list to show updated practice stats

  return {
      success: true,
      score,
      diff,
      target: sentence.content
  };
}
