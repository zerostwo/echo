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
import { getHardestWords } from '@/actions/word-actions';
import Link from 'next/link';
import { parsePos, TRANS_PREFIX_MAP } from '@/lib/vocab-utils';

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

function getDisplayContent(text: string, posString: string | null) {
  if (!text) return { tag: null, content: '' };

  // Parse POS probabilities
  const posStats = parsePos(posString);
  // Sort by percentage descending
  posStats.sort((a, b) => {
      const pa = parseInt(a.percentage) || 0;
      const pb = parseInt(b.percentage) || 0;
      return pb - pa;
  });
  
  // Split by common parts of speech markers
  const parts = text.split(/(?=\b(?:n|a|adj|s|v|vt|vi|adv|r|prep|conj|pron|num|int|interj|art|aux|pl)\.)/g);
  
  // Filter out empty parts
  const validParts = parts.map(p => p.trim()).filter(p => p.length > 0);
  
  if (validParts.length === 0) return {
    tag: null,
    content: text.replace(/\[[^\]]+\]/g, '')
  };

  let selectedPart = validParts[0];
  
  if (posStats.length > 0) {
      // Try to find the part matching the highest probability POS
      for (const stat of posStats) {
          const match = validParts.find(p => {
              if (p.startsWith(stat.label)) return true;
              // Handle vi. and vt. as v.
              if (stat.label === 'v.' && (p.startsWith('vi.') || p.startsWith('vt.'))) return true;
              return false;
          });
          if (match) {
              selectedPart = match;
              break;
          }
      }
  }

  // Italicize POS tags
  const posTagRegex = /^((?:n|a|adj|s|v|vt|vi|adv|r|prep|conj|pron|num|int|interj|art|aux|pl)\.)\s*/;
  const match = selectedPart.match(posTagRegex);
  
  if (match) {
      const tag = match[1];
      const rest = selectedPart.substring(match[0].length);
      const normalizedTag = TRANS_PREFIX_MAP[tag] || tag;
      const cleanRest = rest.replace(/\[[^\]]+\]/g, '');

      return {
        tag: normalizedTag,
        content: cleanRest
      };
  }

  return {
    tag: null,
    content: selectedPart.replace(/\[[^\]]+\]/g, '')
  };
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
              {words.slice(0, 4).map((word, index) => {
                const displayContent = getDisplayContent(word.translation || word.definition || '', word.pos || null);
                return (
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
                        {(displayContent.content || displayContent.tag) && (
                          <p className="truncate text-xs text-muted-foreground mt-0.5">
                            {displayContent.tag && <span className="italic font-serif mr-1">{displayContent.tag}</span>}
                            {displayContent.content}
                          </p>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
                      {word.errorCount} errors
                    </span>
                  </div>
                );
              })}
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
        <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Hardest Words</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-4">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="space-y-2 py-2">
                {allHardestWords.map((word, index) => {
                  const displayContent = getDisplayContent(word.translation || word.definition || '', word.pos || null);
                  return (
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
                          {(displayContent.content || displayContent.tag) && (
                            <p className="truncate text-xs text-muted-foreground mt-0.5">
                              {displayContent.tag && <span className="italic font-serif mr-1">{displayContent.tag}</span>}
                              {displayContent.content}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="shrink-0 rounded-md bg-red-100 px-2 py-1 text-xs font-medium text-red-600 dark:bg-red-900/20 dark:text-red-400">
                        {word.errorCount} errors
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
