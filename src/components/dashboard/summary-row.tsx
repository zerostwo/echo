'use client';

import { Card, CardContent } from "@/components/ui/card"
import { AlignLeft, Library, Languages } from 'lucide-react';

interface SummaryRowProps {
  totalMaterials: number;
  totalSentences: number;
  totalWords: number;
}

export function SummaryRow({
  totalMaterials,
  totalSentences,
  totalWords,
}: SummaryRowProps) {
  const stats = [
    {
      label: 'Total Materials',
      value: totalMaterials,
      icon: Library,
      color: 'bg-blue-500',
      extra: '',
      extraColor: '',
    },
    {
      label: 'Total Sentences',
      value: totalSentences.toLocaleString(),
      icon: AlignLeft,
      color: 'bg-indigo-500',
      extra: '',
      extraColor: '',
    },
    {
      label: 'Total Words',
      value: totalWords.toLocaleString(),
      icon: Languages,
      color: 'bg-emerald-500',
      extra: '',
      extraColor: '',
    },
  ];

  return (
    <div className="grid gap-2 md:grid-cols-3">
      {stats.map((stat) => (
        <Card key={stat.label} className="overflow-hidden">
          <CardContent className="p-3 flex items-center gap-4">
            <div className={`${stat.color} p-3 rounded-lg`}>
              <stat.icon className="h-6 w-6 text-white" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </p>
              <div className="flex items-baseline justify-between">
                <h2 className="text-2xl font-bold">{stat.value}</h2>
                <span className={`text-xs font-medium ${stat.extraColor}`}>
                  {stat.extra}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
