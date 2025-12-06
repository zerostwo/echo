'use server';

import { auth } from '@/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import { randomUUID } from 'crypto';

export type SessionType = 'WORD' | 'SENTENCE';

export interface LearningSessionData {
  sessionType: SessionType;
  materialId?: string;
  lastItemId?: string;
  lastItemType?: 'word' | 'sentence';
}

/**
 * Start a new learning session
 */
export async function startLearningSession(data: LearningSessionData) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized' };
  }

  const client = supabaseAdmin || supabase;

  try {
    const { data: learningSession, error } = await client
      .from('learning_sessions')
      .insert({
        id: randomUUID(),
        user_id: session.user.id,
        session_type: data.sessionType,
        started_at: new Date().toISOString(),
        material_id: data.materialId || null,
        last_item_id: data.lastItemId || null,
        last_item_type: data.lastItemType || null,
      })
      .select()
      .single();

    if (error) {
      console.error('Error starting learning session:', error);
      return { error: 'Failed to start learning session' };
    }

    return { session: learningSession };
  } catch (err) {
    console.error('Error in startLearningSession:', err);
    return { error: 'An error occurred' };
  }
}

/**
 * Update an existing learning session
 */
export async function updateLearningSession(
  sessionId: string,
  updates: {
    itemsStudied?: number;
    correctCount?: number;
    incorrectCount?: number;
    lastItemId?: string;
    lastItemType?: 'word' | 'sentence';
  }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized' };
  }

  const client = supabaseAdmin || supabase;

  try {
    const { error } = await client
      .from('learning_sessions')
      .update({
        items_studied: updates.itemsStudied,
        correct_count: updates.correctCount,
        incorrect_count: updates.incorrectCount,
        last_item_id: updates.lastItemId,
        last_item_type: updates.lastItemType,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId)
      .eq('user_id', session.user.id);

    if (error) {
      console.error('Error updating learning session:', error);
      return { error: 'Failed to update learning session' };
    }

    return { success: true };
  } catch (err) {
    console.error('Error in updateLearningSession:', err);
    return { error: 'An error occurred' };
  }
}

/**
 * End a learning session
 */
export async function endLearningSession(
  sessionId: string,
  finalStats?: {
    itemsStudied?: number;
    correctCount?: number;
    incorrectCount?: number;
  }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return { error: 'Unauthorized' };
  }

  const client = supabaseAdmin || supabase;

  try {
    const updateData: Record<string, unknown> = {
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    if (finalStats?.itemsStudied !== undefined) {
      updateData.items_studied = finalStats.itemsStudied;
    }
    if (finalStats?.correctCount !== undefined) {
      updateData.correct_count = finalStats.correctCount;
    }
    if (finalStats?.incorrectCount !== undefined) {
      updateData.incorrect_count = finalStats.incorrectCount;
    }

    const { error } = await client
      .from('learning_sessions')
      .update(updateData)
      .eq('id', sessionId)
      .eq('user_id', session.user.id);

    if (error) {
      console.error('Error ending learning session:', error);
      return { error: 'Failed to end learning session' };
    }

    return { success: true };
  } catch (err) {
    console.error('Error in endLearningSession:', err);
    return { error: 'An error occurred' };
  }
}

/**
 * Get the latest learning sessions for the user
 */
export async function getLatestLearningSessions(limit: number = 10) {
  const session = await auth();
  if (!session?.user?.id) {
    return { sessions: [], error: 'Unauthorized' };
  }

  const client = supabaseAdmin || supabase;

  try {
    const { data: sessions, error } = await client
      .from('learning_sessions')
      .select('*')
      .eq('user_id', session.user.id)
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Error fetching learning sessions:', error);
      return { sessions: [], error: 'Failed to fetch learning sessions' };
    }

    return { sessions: sessions || [] };
  } catch (err) {
    console.error('Error in getLatestLearningSessions:', err);
    return { sessions: [], error: 'An error occurred' };
  }
}

/**
 * Get learning session analytics for a time period
 */
export async function getLearningAnalytics(days: number = 30) {
  const session = await auth();
  if (!session?.user?.id) {
    return { analytics: null, error: 'Unauthorized' };
  }

  const client = supabaseAdmin || supabase;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  try {
    const { data: sessions, error } = await client
      .from('learning_sessions')
      .select('*')
      .eq('user_id', session.user.id)
      .gte('started_at', startDate.toISOString())
      .order('started_at', { ascending: true });

    if (error) {
      console.error('Error fetching learning analytics:', error);
      return { analytics: null, error: 'Failed to fetch analytics' };
    }

    // Calculate analytics
    const completedSessions = (sessions || []).filter(s => s.ended_at);
    
    // Group by hour of day
    const hourlyDistribution: Record<number, number> = {};
    completedSessions.forEach(s => {
      const hour = new Date(s.started_at).getHours();
      hourlyDistribution[hour] = (hourlyDistribution[hour] || 0) + 1;
    });

    // Calculate total study time
    let totalStudyTime = 0;
    completedSessions.forEach(s => {
      if (s.ended_at) {
        const duration = new Date(s.ended_at).getTime() - new Date(s.started_at).getTime();
        totalStudyTime += duration;
      }
    });

    // Find peak study hours
    const peakHours = Object.entries(hourlyDistribution)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => parseInt(hour));

    const analytics = {
      totalSessions: completedSessions.length,
      totalStudyTimeMs: totalStudyTime,
      avgSessionDurationMs: completedSessions.length > 0 
        ? totalStudyTime / completedSessions.length 
        : 0,
      hourlyDistribution,
      peakHours,
      wordSessions: completedSessions.filter(s => s.session_type === 'WORD').length,
      sentenceSessions: completedSessions.filter(s => s.session_type === 'SENTENCE').length,
    };

    return { analytics };
  } catch (err) {
    console.error('Error in getLearningAnalytics:', err);
    return { analytics: null, error: 'An error occurred' };
  }
}
