'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Target } from 'lucide-react';

interface TodayTasksCardProps {
  wordsDueToday: number;
  wordsReviewed: number;
}

export function TodayTasksCard({ wordsDueToday, wordsReviewed }: TodayTasksCardProps) {
  const totalTasks = wordsDueToday;
  const progress = totalTasks > 0 ? Math.min((wordsReviewed / totalTasks) * 100, 100) : 0;
  const remaining = Math.max(totalTasks - wordsReviewed, 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between py-3">
        <CardTitle className="text-sm font-medium">Today&apos;s Tasks</CardTitle>
        <Target className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="pb-3">
        <div className="flex items-baseline gap-2 mb-2">
          <span className="text-2xl font-bold">{wordsDueToday}</span>
          <span className="text-sm text-muted-foreground">words due</span>
        </div>
        <Progress value={progress} className="h-1.5 mb-1.5" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{wordsReviewed} reviewed</span>
          {remaining > 0 ? (
            <span>{remaining} remaining</span>
          ) : progress >= 100 ? (
            <span className="text-green-600 dark:text-green-400">✓ All done!</span>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
