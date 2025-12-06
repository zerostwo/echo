'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Target, CheckCircle2 } from 'lucide-react';

interface TodayTasksCardProps {
  wordsDueToday: number;
  wordsReviewed: number;
}

export function TodayTasksCard({ wordsDueToday, wordsReviewed }: TodayTasksCardProps) {
  const totalTasks = wordsDueToday;
  const progress = totalTasks > 0 ? Math.min((wordsReviewed / totalTasks) * 100, 100) : 0;
  const remaining = Math.max(totalTasks - wordsReviewed, 0);
  const isComplete = remaining === 0 && wordsReviewed > 0;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-3 pb-2">
        <CardTitle className="text-sm font-medium">Today&apos;s Tasks</CardTitle>
        {isComplete ? (
          <CheckCircle2 className="h-4 w-4 text-green-500" />
        ) : (
          <Target className="h-4 w-4 text-muted-foreground" />
        )}
      </CardHeader>
      <CardContent className="pb-3 flex-1 flex flex-col justify-center">
        <div className="flex items-baseline gap-2 mb-3">
          <span className="text-3xl font-bold">{wordsDueToday}</span>
          <span className="text-sm text-muted-foreground">words due</span>
        </div>
        <Progress value={progress} className="h-2 mb-2" />
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{wordsReviewed} reviewed</span>
          {remaining > 0 ? (
            <span>{remaining} remaining</span>
          ) : progress >= 100 ? (
            <span className="text-green-600 dark:text-green-400">✓ All done!</span>
          ) : (
            <span>No tasks yet</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
