'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface VocabSnapshotCardProps {
  newCount: number;
  learningCount: number;
  masteredCount: number;
}

export function VocabSnapshotCard({ newCount, learningCount, masteredCount }: VocabSnapshotCardProps) {
  const total = newCount + learningCount + masteredCount;
  
  // Calculate percentages
  const newPercent = total > 0 ? (newCount / total) * 100 : 0;
  const learningPercent = total > 0 ? (learningCount / total) * 100 : 0;
  const masteredPercent = total > 0 ? (masteredCount / total) * 100 : 0;

  // SVG Circle properties
  const size = 120;
  const strokeWidth = 16;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  // Calculate stroke-dasharray and offsets
  // Order: New (Blue), Learning (Yellow), Mastered (Green)
  // We want them to start from top (rotate -90deg)
  
  const newOffset = 0;
  const learningOffset = -((newPercent / 100) * circumference);
  const masteredOffset = -(((newPercent + learningPercent) / 100) * circumference);

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="py-2 pb-2">
        <CardTitle className="text-base font-semibold">Words Snapshot</CardTitle>
      </CardHeader>
      <CardContent className="pb-2 flex-1 flex items-center justify-between gap-4">
        {/* Donut Chart */}
        <div className="relative h-24 w-24 flex-shrink-0">
          <svg width="100%" height="100%" viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
            {/* Background circle */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              className="text-muted/20"
            />
            
            {/* Segments */}
            {/* Mastered (Green) */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeDasharray={`${(masteredPercent / 100) * circumference} ${circumference}`}
              strokeDashoffset={masteredOffset}
              className="text-emerald-500"
            />
            {/* Learning (Yellow) */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeDasharray={`${(learningPercent / 100) * circumference} ${circumference}`}
              strokeDashoffset={learningOffset}
              className="text-amber-400"
            />
            {/* New (Blue) */}
            <circle
              cx={center}
              cy={center}
              r={radius}
              fill="transparent"
              stroke="currentColor"
              strokeWidth={strokeWidth}
              strokeDasharray={`${(newPercent / 100) * circumference} ${circumference}`}
              strokeDashoffset={newOffset}
              className="text-blue-500"
            />
          </svg>
          {/* Center Text */}
          <div className="absolute inset-0 flex items-center justify-center flex-col">
            <span className="text-xl font-bold">{Math.round(masteredPercent)}%</span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-blue-500" />
              <span className="font-medium">New</span>
            </div>
            <span className="font-bold">{newCount.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-amber-400" />
              <span className="font-medium">Learning</span>
            </div>
            <span className="font-bold">{learningCount.toLocaleString()}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm bg-emerald-500" />
              <span className="font-medium">Mastered</span>
            </div>
            <span className="font-bold">{masteredCount.toLocaleString()}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
