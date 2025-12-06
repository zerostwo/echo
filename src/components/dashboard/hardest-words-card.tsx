'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle } from 'lucide-react';
import { useState } from 'react';
import { WordDetailSheet } from '@/app/words/word-detail-sheet';

interface HardWord {
  id: string;
  text: string;
  errorCount: number;
  translation: string | null;
  phonetic?: string | null;
  pos?: string | null;
  definition?: string | null;
  tag?: string | null;
  exchange?: string | null;
}

interface HardestWordsCardProps {
  words: HardWord[];
}

export function HardestWordsCard({ words }: HardestWordsCardProps) {
  const [selectedWord, setSelectedWord] = useState<HardWord | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const handleWordClick = (word: HardWord) => {
    setSelectedWord(word);
    setSheetOpen(true);
  };

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between py-3 pb-2">
          <CardTitle className="text-sm font-medium">Hardest Words</CardTitle>
          <AlertTriangle className="h-4 w-4 text-amber-500" />
        </CardHeader>
        <CardContent className="pb-3 flex-1 flex flex-col justify-center">
          {words.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">
              No difficult words yet. Keep practicing!
            </p>
          ) : (
            <div className="space-y-1.5">
              {words.map((word, index) => (
                <div
                  key={word.id}
                  className="flex items-center justify-between gap-2 rounded bg-muted/50 px-2 py-1 cursor-pointer hover:bg-muted transition-colors"
                  onClick={() => handleWordClick(word)}
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-amber-500/10 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-xs">{word.text}</p>
                      {word.translation && (
                        <p className="truncate text-[10px] text-muted-foreground leading-tight">
                          {word.translation}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">
                    {word.errorCount} errors
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Word Detail Sheet */}
      <WordDetailSheet
        word={selectedWord}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </>
  );
}
