'use client';

import { useEffect, useState } from 'react';
import { ActivityHeatmap } from './activity-heatmap';
import { TodayTasksCard } from './today-tasks-card';
import { VocabSnapshotCard } from './vocab-snapshot-card';
import { SentenceSnapshotCard } from './sentence-snapshot-card';
import { ContinueLearningCard } from './continue-learning-card';
import { HardestWordsCard } from './hardest-words-card';
import { SummaryRow } from './summary-row';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

interface DashboardStats {
  heatmapData: Array<{ date: string; duration: number }>;
  wordsDueToday: number;
  wordsReviewedTodayCount: number;
  vocabSnapshot: {
    new: number;
    learning: number;
    mastered: number;
  };
  sentenceSnapshot: {
    new: number;
    practiced: number;
    mastered: number;
  };
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
  totalMaterials: number;
  totalSentences: number;
  totalPractices: number;
  averageScore: number;
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

function DashboardSkeleton() {
  return (
    <div className="flex flex-1 flex-col gap-3 p-4 pt-0">
      {/* Summary Row skeleton */}
      <Skeleton className="h-14 w-full rounded-lg" />

      {/* Heatmap skeleton */}
      <Card>
        <CardHeader className="py-3">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="pb-3">
          <Skeleton className="h-[100px] w-full" />
        </CardContent>
      </Card>

      {/* Lower cards skeleton */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Card key={i}>
            <CardHeader className="py-3">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent className="pb-3">
              <Skeleton className="h-24 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function DashboardContent() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/dashboard/stats');
        if (!response.ok) {
          throw new Error('Failed to fetch dashboard stats');
        }
        const data = await response.json();
        setStats(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) {
    return <DashboardSkeleton />;
  }

  if (error || !stats) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="text-center">
          <p className="text-muted-foreground">{error || 'Failed to load dashboard'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 p-4 pt-0">
      {/* Summary Row - full width, compact */}
      <SummaryRow
        totalMaterials={stats.totalMaterials}
        totalSentences={stats.totalSentences}
        totalPractices={stats.totalPractices}
        averageScore={stats.averageScore}
      />

      {/* Activity Heatmap - full width with year tabs */}
      <ActivityHeatmap data={stats.heatmapData} />

      {/* Main content grid - 2x3 layout on large screens */}
      <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        {/* Row 1 */}
        <ContinueLearningCard
          lastWord={stats.lastWord}
          lastSentence={stats.lastSentence}
          wordsDueToday={stats.wordsDueToday}
          sentencesDueToday={stats.sentenceSnapshot.new}
        />
        <TodayTasksCard
          wordsDueToday={stats.wordsDueToday}
          wordsReviewed={stats.wordsReviewedTodayCount}
        />
        <HardestWordsCard words={stats.hardestWords} />
        
        {/* Row 2 */}
        <VocabSnapshotCard
          newCount={stats.vocabSnapshot.new}
          learningCount={stats.vocabSnapshot.learning}
          masteredCount={stats.vocabSnapshot.mastered}
        />
        <SentenceSnapshotCard
          newCount={stats.sentenceSnapshot.new}
          practicedCount={stats.sentenceSnapshot.practiced}
          masteredCount={stats.sentenceSnapshot.mastered}
        />
      </div>
    </div>
  );
}
