import { auth } from '@/auth';
import { supabase } from '@/lib/supabase';
import { VocabTable, vocabColumns } from './vocab-table';
import { AnkiExportButton } from './anki-export';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Trophy, Activity, Calendar, Filter } from "lucide-react";
import { HeaderPortal } from '@/components/header-portal';
import { Badge } from "@/components/ui/badge";
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

export default async function VocabPage({ searchParams }: { searchParams: Promise<{ materialId?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return <div>Unauthorized</div>;

  const { materialId } = await searchParams;

  // Fetch words
  const { data: userWords } = await supabase
    .from('UserWordStatus')
    .select(`
        *,
        word:Word(
            *,
            occurrences:WordOccurrence(
                sentence:Sentence(
                    *,
                    material:Material(deletedAt, title)
                )
            )
        )
    `)
    .eq('userId', session.user.id)
    .order('updatedAt', { ascending: false });

  // Fetch practice stats
  const { data: practices } = await supabase
    .from('PracticeProgress')
    .select('attempts')
    .eq('userId', session.user.id);

  // Process data
  // Filter words to exclude those from deleted materials AND apply materialId filter if present
  let filteredMaterialTitle = '';

  const filteredUserWords = (userWords || []).map((uw: any) => {
      const activeOccurrences = uw.word?.occurrences?.filter((occ: any) => {
          const isNotDeleted = occ.sentence?.material?.deletedAt === null;
          const matchesMaterial = !materialId || occ.sentence?.materialId === materialId;
          
          if (materialId && matchesMaterial && !filteredMaterialTitle) {
              filteredMaterialTitle = occ.sentence?.material?.title;
          }

          return isNotDeleted && matchesMaterial;
      });

      if (!activeOccurrences || activeOccurrences.length === 0) {
          return null;
      }

      // Return a new object with filtered occurrences
      return {
          ...uw,
          word: {
              ...uw.word,
              occurrences: activeOccurrences
          }
      };
  }).filter(Boolean);

  // Transform for table
  const data = filteredUserWords.map((uw: any) => {
      const word = uw.word;
      // We limit to 1 occurrence for the table display
      const displayOccurrences = word.occurrences.length > 1 
          ? word.occurrences.slice(0, 1) 
          : word.occurrences;
          
      return { 
          ...word, 
          occurrences: displayOccurrences,
          status: uw.status 
      };
  });

  // Calculate stats based on filtered words
  const totalWords = filteredUserWords.length;
  const masteredWords = filteredUserWords.filter((w: any) => w.status === "MASTERED").length;
  const practiceSessions = practices?.reduce((acc, p) => acc + p.attempts, 0) || 0;
  
  // Trends
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const newWords = filteredUserWords.filter((w: any) => w.createdAt > oneDayAgo).length;
  const newMastered = filteredUserWords.filter((w: any) => w.status === "MASTERED" && w.updatedAt > oneDayAgo).length;
  
  const dueTomorrow = 18; 

  return (
    <div className="flex-1 space-y-8 p-8 pt-6">
      <HeaderPortal>
        <div className="flex items-center gap-2">
            {materialId && (
                <div className="flex items-center gap-2 mr-4">
                    <Badge variant="secondary" className="h-8 px-3 text-sm gap-2">
                        <Filter className="h-3.5 w-3.5" />
                        Filtered by: {filteredMaterialTitle || 'Material'}
                    </Badge>
                    <Link href="/vocab">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <X className="h-4 w-4" />
                        </Button>
                    </Link>
                </div>
            )}
            <AnkiExportButton words={filteredUserWords} />
        </div>
      </HeaderPortal>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Words
            </CardTitle>
            <BookOpen className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalWords.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              <span className="text-green-500 font-medium">+{newWords}</span> since yesterday
            </p>
            <p className="text-xs text-muted-foreground mt-1">
                New words added in the last 24 hours
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Mastered Words
            </CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{masteredWords.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
               <span className="text-green-500 font-medium">+{newMastered}</span> mastered since yesterday
            </p>
             <p className="text-xs text-muted-foreground mt-1">
                Overall learning progress
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Practice Sessions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{practiceSessions.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              Consistent practice maintained ↗
            </p>
             <p className="text-xs text-muted-foreground mt-1">
                Total exercises completed
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Next Review
            </CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{dueTomorrow} words</div>
            <p className="text-xs text-muted-foreground">
              Scheduled for tomorrow →
            </p>
             <p className="text-xs text-muted-foreground mt-1">
                Words due for spaced repetition
            </p>
          </CardContent>
        </Card>
      </div>

      <VocabTable columns={vocabColumns} data={data} />
    </div>
  );
}
