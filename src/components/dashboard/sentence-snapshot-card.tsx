'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AudioLines } from 'lucide-react';

interface SentenceSnapshotCardProps {
  newCount: number;
  practicedCount: number;
  masteredCount: number;
}

export function SentenceSnapshotCard({ newCount, practicedCount, masteredCount }: SentenceSnapshotCardProps) {
  const total = newCount + practicedCount + masteredCount;
  
  const segments = [
    { label: 'New', count: newCount, color: 'bg-purple-500', textColor: 'text-purple-500' },
    { label: 'Practiced', count: practicedCount, color: 'bg-amber-500', textColor: 'text-amber-500' },
    { label: 'Mastered', count: masteredCount, color: 'bg-green-500', textColor: 'text-green-500' },
  ];

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-3 pb-2">
        <CardTitle className="text-sm font-medium">Sentence Progress</CardTitle>
        <AudioLines className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="pb-3 flex-1 flex flex-col justify-center">
        {/* Progress bar visualization */}
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-muted mb-3">
          {total > 0 ? (
            segments.map((segment) => {
              const width = (segment.count / total) * 100;
              if (width === 0) return null;
              return (
                <div
                  key={segment.label}
                  className={`${segment.color} transition-all`}
                  style={{ width: `${width}%` }}
                />
              );
            })
          ) : (
            <div className="w-full bg-muted" />
          )}
        </div>

        {/* Legend */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          {segments.map((segment) => (
            <div key={segment.label} className="text-center">
              <div className={`font-bold ${segment.textColor}`}>{segment.count}</div>
              <div className="text-muted-foreground">{segment.label}</div>
            </div>
          ))}
        </div>

        {/* Total */}
        <div className="border-t pt-2 mt-2 text-center text-xs text-muted-foreground">
          {total} total sentences
        </div>
      </CardContent>
    </Card>
  );
}
