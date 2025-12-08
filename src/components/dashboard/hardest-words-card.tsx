'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, Loader2, PlayCircle } from 'lucide-react';
import { useState } from 'react';
import { WordDetailSheet } from '@/app/words/word-detail-sheet';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { getHardestWords } from '@/actions/word-actions';
import Link from 'next/link';

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
  const [dialogOpen, setDialogOpen] = useState(false);
  const [allHardestWords, setAllHardestWords] = useState<HardWord[]>([]);
  const [loading, setLoading] = useState(false);

  const handleWordClick = (word: HardWord) => {
    setSelectedWord(word);
    setSheetOpen(true);
  };

  const handleViewAll = async () => {
    setDialogOpen(true);
    if (allHardestWords.length === 0) {
      setLoading(true);
      try {
        const result = await getHardestWords(50);
        if (result.words) {
          setAllHardestWords(result.words);
        }
      } catch (error) {
        console.error('Failed to fetch hardest words', error);
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <>
      <Card className="h-full flex flex-col">
        <CardHeader className="flex flex-row items-center justify-between py-2 pb-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <CardTitle className="text-base font-semibold">Hardest Words</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" asChild className="h-6 w-6 text-muted-foreground hover:text-primary" title="Study Hardest Words">
              <Link href="/study/words?hardest=true">
                <PlayCircle className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="link" className="h-auto p-0 text-sm text-blue-600" onClick={handleViewAll}>
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pb-2 flex-1 flex flex-col">
          {words.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <p className="text-sm text-muted-foreground">
                No difficult words yet. Keep practicing!
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {words.slice(0, 4).map((word, index) => (
                <div
                  key={word.id}
                  className="flex items-start justify-between gap-4 cursor-pointer group"
                  onClick={() => handleWordClick(word)}
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground mt-0.5">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-sm group-hover:text-primary transition-colors">{word.text}</p>
                      {(word.translation || word.pos) && (
                        <p className="truncate text-xs text-muted-foreground mt-0.5">
                          {word.pos && <span className="italic mr-1">{word.pos}.</span>}
                          {word.translation}
                        </p>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
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

      {/* View All Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Hardest Words</DialogTitle>
          </DialogHeader>
          <ScrollArea className="flex-1 pr-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-4 py-2">
                {allHardestWords.map((word, index) => (
                  <div
                    key={word.id}
                    className="flex items-start justify-between gap-4 cursor-pointer group hover:bg-muted/50 p-2 rounded-lg transition-colors"
                    onClick={() => {
                      handleWordClick(word);
                    }}
                  >
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground mt-0.5">
                        {index + 1}
                      </span>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm group-hover:text-primary transition-colors">{word.text}</p>
                        {(word.translation || word.pos) && (
                          <p className="truncate text-xs text-muted-foreground mt-0.5">
                            {word.pos && <span className="italic mr-1">{word.pos}.</span>}
                            {word.translation}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
                      {word.errorCount} errors
                    </span>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </>
  );
}
