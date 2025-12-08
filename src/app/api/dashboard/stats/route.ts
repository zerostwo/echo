'use server';

import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';

export interface DashboardStats {
  // Heatmap data (past year of daily study duration - combined sentence practice + word learning)
  heatmapData: Array<{
    date: string;
    duration: number; // seconds
  }>;

  // Today's tasks
  wordsDueToday: number;
  wordsReviewedTodayCount: number;
  sentencesPracticedTodayCount: number;
  dailyGoals: {
    words: number;
    sentences: number;
  };

  // Vocabulary snapshot
  vocabSnapshot: {
    new: number;
    learning: number;
    mastered: number;
  };

  // Sentence snapshot
  sentenceSnapshot: {
    new: number;
    practiced: number;
    mastered: number;
  };

  // Hardest words (top 5 by error count)
  hardestWords: Array<{
    id: string;
    text: string;
    errorCount: number;
    translation: string | null;
    phonetic: string | null;
    pos: string | null;
    definition: string | null;
    tag: string | null;
    exchange: string | null;
  }>;

  // Summary stats
  totalMaterials: number;
  totalSentences: number;
  totalWords: number;
  totalPractices: number;
  averageScore: number;

  // Last learning positions for "continue where you left off"
  lastWord?: {
    id: string;
    text: string;
    materialId?: string;
    materialTitle?: string;
  } | null;
  lastSentence?: {
    id: string;
    content: string;
    materialId: string;
    materialTitle: string;
  } | null;
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const client = supabaseAdmin || supabase;
  const userId = session.user.id;
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

  try {
    // Parallel fetch for performance
    const [
      materialsResult,
      practicesResult,
      dailyStatsResult,
      todayReviewsResult,
      wordStatusesResult,
      hardestWordsResult,
      userSettingsResult,
      sentencesPracticedTodayResult,
    ] = await Promise.all([
      // Materials with sentence count
      client
        .from('materials')
        .select('id, sentences:sentences(count)')
        .eq('user_id', userId)
        .is('deleted_at', null),

      // Practice progress for total practices and average score (also includes duration)
      client
        .from('practice_progress')
        .select('score, duration, created_at')
        .eq('user_id', userId),

      // Daily stats for current year (for heatmap) - this tracks study_duration from daily_study_stats
      client
        .from('daily_study_stats')
        .select('date, study_duration')
        .eq('user_id', userId)
        .gte('date', new Date(now.getFullYear(), 0, 1).toISOString()) // From Jan 1 of current year
        .order('date', { ascending: true }),

      // Today's word reviews with response time
      client
        .from('word_reviews')
        .select(`
          id,
          was_correct,
          response_time_ms,
          created_at,
          user_word_status:user_word_status_id (
            user_id
          )
        `)
        .gte('created_at', todayStart.toISOString())
        .lte('created_at', todayEnd.toISOString()),

      // Word statuses for vocabulary snapshot
      client
        .from('user_word_statuses')
        .select('status')
        .eq('user_id', userId),

      // Hardest words (top 5 by error count)
      client
        .from('user_word_statuses')
        .select(`
          id,
          error_count,
          words:word_id (
            id,
            text,
            translation,
            phonetic,
            pos,
            definition,
            tag,
            exchange
          )
        `)
        .eq('user_id', userId)
        .gt('error_count', 0)
        .order('error_count', { ascending: false })
        .limit(5),

      // User settings for daily goals
      client
        .from('users')
        .select('settings')
        .eq('id', userId)
        .single(),

      // Sentences practiced today
      client
        .from('practice_progress')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('updated_at', todayStart.toISOString())
        .lte('updated_at', todayEnd.toISOString()),
    ]);

    // Process materials
    const materials = materialsResult.data || [];
    const totalMaterials = materials.length;
    const totalSentences = materials.reduce(
      (acc, m: Record<string, unknown>) => acc + ((m.sentences as { count?: number }[])?.[0]?.count || 0),
      0
    );

    // Process practices
    const practices = practicesResult.data || [];
    const totalPractices = practices.length;
    const averageScore =
      totalPractices > 0
        ? Math.round(practices.reduce((acc, p) => acc + p.score, 0) / totalPractices)
        : 0;

    // Process daily stats for heatmap
    // The study_duration in daily_study_stats should already include combined time
    // from sentence practice + word learning
    const dailyStats = dailyStatsResult.data || [];
    const heatmapData = dailyStats.map((stat) => ({
      date: stat.date.split('T')[0],
      duration: stat.study_duration || 0,
    }));

    // Process today's reviews - filter by user_id
    const allTodayReviews = todayReviewsResult.data || [];
    const todayReviews = allTodayReviews.filter(
      (r: Record<string, unknown>) => (r.user_word_status as { user_id?: string } | null)?.user_id === userId
    );
    const wordsReviewedToday = todayReviews.length;

    // Process word statuses for vocabulary snapshot
    const wordStatuses = wordStatusesResult.data || [];
    const totalWords = wordStatuses.length;
    const vocabSnapshot = wordStatuses.reduce(
      (acc: { new: number; learning: number; mastered: number }, ws: { status: string }) => {
        if (ws.status === 'NEW') acc.new++;
        else if (ws.status === 'LEARNING') acc.learning++;
        else if (ws.status === 'MASTERED') acc.mastered++;
        return acc;
      },
      { new: 0, learning: 0, mastered: 0 }
    );

    // Get words due today
    const { count: wordsDueToday } = await client
      .from('user_word_statuses')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('status', ['NEW', 'LEARNING'])
      .or(`fsrs_due.is.null,fsrs_due.lte.${todayEnd.toISOString()}`);

    // Process hardest words
    const hardestWords = (hardestWordsResult.data || []).map((ws: Record<string, unknown>) => {
      const word = ws.words as { 
        id?: string; 
        text?: string; 
        translation?: string;
        phonetic?: string;
        pos?: string;
        definition?: string;
        tag?: string;
        exchange?: string;
      } | null;
      return {
        id: word?.id || (ws.id as string),
        text: word?.text || '',
        errorCount: ws.error_count as number || 0,
        translation: word?.translation || null,
        phonetic: word?.phonetic || null,
        pos: word?.pos || null,
        definition: word?.definition || null,
        tag: word?.tag || null,
        exchange: word?.exchange || null,
      };
    });

    // Get sentence snapshot - count sentences by practice status
    const [allSentencesResult, practicedSentencesResult] = await Promise.all([
      // Total sentences for user
      client
        .from('sentences')
        .select('id, material:materials!inner(user_id)', { count: 'exact', head: true })
        .eq('material.user_id', userId)
        .is('deleted_at', null),
      
      // Practiced sentences with scores
      client
        .from('practice_progress')
        .select('id, score')
        .eq('user_id', userId),
    ]);

    const totalUserSentences = allSentencesResult.count || 0;
    const practicedSentences = practicedSentencesResult.data || [];
    const masteredSentences = practicedSentences.filter(p => p.score >= 90).length;
    const inProgressSentences = practicedSentences.filter(p => p.score < 90).length;
    const newSentences = totalUserSentences - practicedSentences.length;

    const sentenceSnapshot = {
      new: Math.max(0, newSentences),
      practiced: inProgressSentences,
      mastered: masteredSentences,
    };

    // Get last learning positions
    // Last word reviewed
    const { data: lastWordReview } = await client
      .from('word_reviews')
      .select(`
        id,
        created_at,
        user_word_status:user_word_status_id (
          user_id,
          words:word_id (
            id,
            text
          )
        )
      `)
      .order('created_at', { ascending: false })
      .limit(20);

    const userLastWordReview = (lastWordReview || []).find(
      (r: Record<string, unknown>) => 
        (r.user_word_status as { user_id?: string } | null)?.user_id === userId
    );
    
    let lastWord = null;
    if (userLastWordReview) {
      const uws = userLastWordReview.user_word_status as { words?: { id: string; text: string } } | null;
      if (uws?.words) {
        lastWord = {
          id: uws.words.id,
          text: uws.words.text,
        };
      }
    }

    // Last sentence practiced
    const { data: lastPractice } = await client
      .from('practice_progress')
      .select(`
        sentence_id,
        updated_at,
        sentences:sentence_id (
          id,
          content,
          material_id,
          materials:material_id (
            id,
            title
          )
        )
      `)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    let lastSentence = null;
    if (lastPractice?.sentences) {
      const sentenceData = lastPractice.sentences as unknown;
      // Handle both array and single object cases from Supabase
      const sentence = Array.isArray(sentenceData) 
        ? sentenceData[0] as { id: string; content: string; material_id: string; materials?: { id: string; title: string }[] | { id: string; title: string } }
        : sentenceData as { id: string; content: string; material_id: string; materials?: { id: string; title: string }[] | { id: string; title: string } };
      
      if (sentence) {
        const materialsData = sentence.materials;
        const material = Array.isArray(materialsData) ? materialsData[0] : materialsData;
        lastSentence = {
          id: sentence.id,
          content: sentence.content.substring(0, 50) + (sentence.content.length > 50 ? '...' : ''),
          materialId: sentence.material_id,
          materialTitle: material?.title || 'Unknown',
        };
      }
    }

    // Parse user settings
    let dailyGoals = { words: 20, sentences: 10 };
    if (userSettingsResult.data?.settings) {
      try {
        const settings = JSON.parse(userSettingsResult.data.settings);
        if (settings.dailyGoals) {
          dailyGoals = settings.dailyGoals;
        }
      } catch (e) {
        console.error('Failed to parse user settings:', e);
      }
    }

    const stats: DashboardStats = {
      heatmapData,
      wordsDueToday: wordsDueToday || 0,
      wordsReviewedTodayCount: wordsReviewedToday,
      sentencesPracticedTodayCount: sentencesPracticedTodayResult.count || 0,
      dailyGoals,
      vocabSnapshot,
      sentenceSnapshot,
      hardestWords,
      totalMaterials,
      totalSentences,
      totalWords,
      totalPractices,
      averageScore,
      lastWord,
      lastSentence,
    };

    return NextResponse.json(stats);
  } catch (error) {
    console.error('Dashboard stats error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch dashboard stats' },
      { status: 500 }
    );
  }
}
