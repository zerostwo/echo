'use client';

import { BookOpen, FileText, Mic, Trophy } from 'lucide-react';

interface SummaryRowProps {
  totalMaterials: number;
  totalSentences: number;
  totalPractices: number;
  averageScore: number;
}

export function SummaryRow({
  totalMaterials,
  totalSentences,
  totalPractices,
  averageScore,
}: SummaryRowProps) {
  const stats = [
    {
      label: 'Materials',
      value: totalMaterials,
      icon: FileText,
    },
    {
      label: 'Sentences',
      value: totalSentences,
      icon: Mic,
    },
    {
      label: 'Practices',
      value: totalPractices,
      icon: BookOpen,
    },
    {
      label: 'Avg Score',
      value: `${averageScore}%`,
      icon: Trophy,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="flex items-center gap-2">
          <stat.icon className="h-4 w-4 text-muted-foreground" />
          <div>
            <p className="text-xs text-muted-foreground">{stat.label}</p>
            <p className="text-sm font-semibold">{stat.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
