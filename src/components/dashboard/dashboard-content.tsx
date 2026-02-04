'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ActivityHeatmap } from './activity-heatmap';
import { TodayTasksCard } from './today-tasks-card';
import { VocabSnapshotCard } from './vocab-snapshot-card';
import { SentenceSnapshotCard } from './sentence-snapshot-card';
import { HardestWordsCard } from './hardest-words-card';
import { SummaryRow } from './summary-row';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { HeaderPortal } from '@/components/header-portal';
import { NotificationsDialog } from '@/components/notifications-dialog';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';
import { fetchJson } from '@/lib/api-client';
import { getUnreadCount } from '@/actions/notification-actions';

interface DashboardStats {
  heatmapData: Array<{ date: string; duration: number }>;
  wordsDueToday: number;
  wordsMasteredTodayCount: number;
  sentencesPracticedTodayCount: number;
  dailyGoals: {
    words: number;
    sentences: number;
  };
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
  totalWords: number;
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
    <div className="flex flex-1 flex-col gap-3 pb-4 pt-0">
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
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const {
    data: stats,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: () => fetchJson<DashboardStats>('/api/dashboard/stats', { cache: 'no-store' }),
  });

  const {
    data: unreadData,
    refetch: refetchUnread,
  } = useQuery({
    queryKey: ['notifications', 'unread'],
    queryFn: () => getUnreadCount(),
    refetchInterval: 30000,
  });

  useEffect(() => {
    if (!notificationsOpen) {
      refetchUnread();
    }
  }, [notificationsOpen, refetchUnread]);

  const unreadCount = unreadData?.count ?? 0;

  if (isLoading) {
    return <DashboardSkeleton />;
  }

  if (error || !stats) {
    return (
      <div className="flex flex-1 items-center justify-center p-4">
        <div className="text-center">
          <p className="text-muted-foreground">Failed to load dashboard</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-2 pt-0">
      <HeaderPortal>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => setNotificationsOpen(true)} className="relative">
            <Bell className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-[18px] text-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Button>
          <NotificationsDialog open={notificationsOpen} onOpenChange={setNotificationsOpen} />
        </div>
      </HeaderPortal>

      {/* Row 1: Summary Cards */}
      <SummaryRow
        totalMaterials={stats.totalMaterials}
        totalSentences={stats.totalSentences}
        totalWords={stats.totalWords}
      />

      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {/* Row 2: Today's Tasks (Col 1) + Heatmap (Col 2-3) */}
        <div className="col-span-1">
            <TodayTasksCard
            wordsReviewed={stats.wordsMasteredTodayCount}
            sentencesPracticed={stats.sentencesPracticedTodayCount}
            dailyGoals={stats.dailyGoals}
            />
        </div>
        <div className="col-span-1 lg:col-span-2">
             <ActivityHeatmap data={stats.heatmapData} />
        </div>

        {/* Row 3 */}
        {/* Col 1: Sentences */}
        <SentenceSnapshotCard
          newCount={stats.sentenceSnapshot.new}
          practicedCount={stats.sentenceSnapshot.practiced}
          masteredCount={stats.sentenceSnapshot.mastered}
        />
        
        {/* Col 2: Words */}
        <VocabSnapshotCard
          newCount={stats.vocabSnapshot.new}
          learningCount={stats.vocabSnapshot.learning}
          masteredCount={stats.vocabSnapshot.mastered}
        />

        {/* Col 3: Hardest Words */}
        <HardestWordsCard words={stats.hardestWords} />
      </div>
    </div>
  );
}
