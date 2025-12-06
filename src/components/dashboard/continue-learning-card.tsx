'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Play, BookOpen, AudioLines, ArrowRight } from 'lucide-react';
import Link from 'next/link';

interface ContinueLearningCardProps {
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
  wordsDueToday: number;
  sentencesDueToday: number;
}

export function ContinueLearningCard({
  lastWord,
  lastSentence,
  wordsDueToday,
  sentencesDueToday,
}: ContinueLearningCardProps) {
  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-3 pb-2">
        <CardTitle className="text-sm font-medium">Continue Learning</CardTitle>
        <Play className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent className="pb-3 flex-1 flex flex-col gap-3 justify-center">
        {/* Continue Words */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
              <BookOpen className="h-4 w-4 text-blue-500" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Words</span>
              <span className="text-xs text-muted-foreground">
                {wordsDueToday > 0 ? `${wordsDueToday} words due` : 'All caught up!'}
              </span>
            </div>
          </div>
          <Button asChild size="sm" variant="ghost" className="h-8 px-2">
            <Link href={lastWord?.materialId ? `/study/words?materialId=${lastWord.materialId}` : '/study/words'}>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>

        {/* Continue Sentences */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center">
              <AudioLines className="h-4 w-4 text-purple-500" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Sentences</span>
              <span className="text-xs text-muted-foreground truncate max-w-[120px]">
                {lastSentence?.materialTitle || 'Start practicing'}
              </span>
            </div>
          </div>
          <Button asChild size="sm" variant="ghost" className="h-8 px-2">
            <Link href={lastSentence ? `/study/sentences/${lastSentence.id}` : '/materials'}>
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
