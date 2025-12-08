'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Zap, Settings } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateSettings } from '@/actions/user-actions';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface TodayTasksCardProps {
  wordsReviewed: number;
  sentencesPracticed: number;
  dailyGoals: {
    words: number;
    sentences: number;
  };
}

export function TodayTasksCard({ wordsReviewed, sentencesPracticed, dailyGoals }: TodayTasksCardProps) {
  const [goals, setGoals] = useState(dailyGoals);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const router = useRouter();

  const wordProgress = Math.min((wordsReviewed / goals.words) * 100, 100);
  const sentenceProgress = Math.min((sentencesPracticed / goals.sentences) * 100, 100);

  const handleSaveGoals = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateSettings({ dailyGoals: goals });
      setIsDialogOpen(false);
      router.refresh();
    } catch (error) {
      console.error('Failed to save goals', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between py-2 pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Zap className="h-5 w-5 fill-current" />
          Today&apos;s Tasks
        </CardTitle>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
              <Settings className="h-4 w-4" />
              <span className="sr-only">Set Goals</span>
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Set Daily Goals</DialogTitle>
              <DialogDescription>
                Adjust your daily learning targets.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSaveGoals}>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="words-goal" className="text-right">
                    Words
                  </Label>
                  <Input
                    id="words-goal"
                    type="number"
                    value={goals.words}
                    onChange={(e) => setGoals({ ...goals, words: parseInt(e.target.value) || 0 })}
                    className="col-span-3"
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="sentences-goal" className="text-right">
                    Sentences
                  </Label>
                  <Input
                    id="sentences-goal"
                    type="number"
                    value={goals.sentences}
                    onChange={(e) => setGoals({ ...goals, sentences: parseInt(e.target.value) || 0 })}
                    className="col-span-3"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save changes'}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent className="pb-2 flex-1 flex flex-col justify-center gap-4">
        {/* Words Section */}
        <div className="space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="font-medium">Words</span>
            <span className="text-sm text-muted-foreground">{wordsReviewed}/{goals.words}</span>
          </div>
          <div className="flex items-center gap-4">
            <Progress value={wordProgress} className="h-2 flex-1 bg-emerald-100 [&>div]:bg-emerald-600" />
            <Button asChild size="sm" className="w-28 bg-emerald-600 hover:bg-emerald-700 text-white">
              <Link href="/study/words">
                {wordsReviewed > 0 ? 'Resume' : 'Start'}
              </Link>
            </Button>
          </div>
        </div>

        {/* Sentences Section */}
        <div className="space-y-2">
          <div className="flex justify-between items-baseline">
            <span className="font-medium">Sentences</span>
            <span className="text-sm text-muted-foreground">{sentencesPracticed}/{goals.sentences}</span>
          </div>
          <div className="flex items-center gap-4">
            <Progress value={sentenceProgress} className="h-2 flex-1 bg-indigo-100 [&>div]:bg-indigo-600" />
            <Button asChild size="sm" className="w-28 bg-indigo-600 hover:bg-indigo-700 text-white">
              <Link href="/study/sentences">
                {sentencesPracticed > 0 ? 'Resume' : 'Start Study'}
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
