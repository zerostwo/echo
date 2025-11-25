import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { VocabTable, vocabColumns } from './vocab-table';
import { AnkiExportButton } from './anki-export';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Trophy, Activity, Calendar } from "lucide-react";
import { HeaderPortal } from '@/components/header-portal';

export default async function VocabPage() {
  const session = await auth();
  if (!session?.user?.id) return <div>Unauthorized</div>;

  // Fetch words
  const userWords = await prisma.userWordStatus.findMany({
    where: { userId: session.user.id },
    include: { 
        word: {
            include: {
                occurrences: {
                    take: 1,
                    include: { sentence: true }
                }
            }
        }
    },
    orderBy: { updatedAt: 'desc' }
  });

  // Fetch practice stats
  const practiceStats = await prisma.practiceProgress.aggregate({
    where: { userId: session.user.id },
    _sum: { attempts: true }
  });

  const data = userWords.map(uw => ({ ...uw.word, status: uw.status }));

  // Calculate stats
  const totalWords = userWords.length;
  const masteredWords = userWords.filter(w => w.status === "MASTERED").length;
  const practiceSessions = practiceStats._sum.attempts || 0;
  
  // Trends (calculated based on createdAt/updatedAt)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const newWords = userWords.filter(w => w.createdAt > oneDayAgo).length;
  const newMastered = userWords.filter(w => w.status === "MASTERED" && w.updatedAt > oneDayAgo).length;
  
  // Placeholder for "Scheduled for tomorrow" since we don't have a review schedule yet
  const dueTomorrow = 18; 

  return (
    <div className="flex-1 space-y-8 p-8 pt-6">
      <HeaderPortal>
        <AnkiExportButton words={userWords} />
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
