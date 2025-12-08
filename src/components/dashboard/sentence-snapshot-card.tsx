'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface SentenceSnapshotCardProps {
  newCount: number;
  practicedCount: number;
  masteredCount: number;
}

export function SentenceSnapshotCard({ newCount, practicedCount, masteredCount }: SentenceSnapshotCardProps) {
  const total = newCount + practicedCount + masteredCount;
  const masteryPercentage = total > 0 ? (masteredCount / total) * 100 : 0;
  
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="py-2 pb-2">
        <CardTitle className="text-base font-semibold">Sentence Progress</CardTitle>
      </CardHeader>
      <CardContent className="pb-2 flex-1 flex flex-col gap-3">
        <div className="space-y-2">
          <div className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80">
            Mastery {masteryPercentage.toFixed(2)}%
          </div>
          <Progress value={masteryPercentage} className="h-2 bg-blue-100 [&>div]:bg-blue-600 dark:bg-blue-900/20 dark:[&>div]:bg-blue-400" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-blue-100 p-3 dark:bg-blue-900/20">
            <div className="text-xs font-medium text-muted-foreground mb-1">New</div>
            <div className="text-xl font-bold text-blue-700 dark:text-blue-400">{newCount.toLocaleString()}</div>
          </div>
          <div className="rounded-lg bg-orange-100 p-3 dark:bg-orange-900/20">
            <div className="text-xs font-medium text-muted-foreground mb-1">Studying</div>
            <div className="text-xl font-bold text-orange-700 dark:text-orange-400">{practicedCount.toLocaleString()}</div>
          </div>
          <div className="rounded-lg bg-green-100 p-3 dark:bg-green-900/20">
            <div className="text-xs font-medium text-muted-foreground mb-1">Mastered</div>
            <div className="text-xl font-bold text-green-700 dark:text-green-400">{masteredCount.toLocaleString()}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
