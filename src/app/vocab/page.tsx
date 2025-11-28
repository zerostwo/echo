import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { VocabTable, vocabColumns } from './vocab-table';
import { AnkiExportButton } from './anki-export';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Trophy, Activity, Calendar, Filter } from "lucide-react";
import { HeaderPortal } from '@/components/header-portal';
import { Badge } from "@/components/ui/badge";
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { redirect } from 'next/navigation';

export default async function VocabPage({ searchParams }: { searchParams: Promise<{ materialId?: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const client = supabaseAdmin || supabase;

  const { materialId } = await searchParams;

  // Fetch user settings
  const { data: userData } = await client
    .from('users')
    .select('settings')
    .eq('id', session.user.id)
    .single();

  let userSettings: any = {};
  if (userData?.settings) {
    try {
      userSettings = JSON.parse(userData.settings);
    } catch (e) {
      console.error("Failed to parse user settings", e);
    }
  }

  // Fetch sentences (optionally filtered by material) to scope vocabulary to user's materials
  let sentenceQuery = client
    .from('sentences')
    .select(`
      id,
      content,
      deleted_at,
      material:materials!inner(id, title, user_id, deleted_at)
    `)
    .eq('material.user_id', session.user.id)
    .is('deleted_at', null)
    .is('material.deleted_at', null);

  if (materialId) {
    sentenceQuery = sentenceQuery.eq('material.id', materialId);
  }

  const { data: sentences } = await sentenceQuery;
  const sentenceMap = new Map<string, any>();
  const sentenceIds: string[] = [];
  (sentences || []).forEach((s: any) => {
    sentenceMap.set(s.id, s);
    sentenceIds.push(s.id);
  });

  let filteredMaterialTitle = '';
  if (materialId && sentences?.length) {
    const firstMaterial = sentences[0].material as any;
    const material = Array.isArray(firstMaterial) ? firstMaterial[0] : firstMaterial;
    filteredMaterialTitle = material?.title ?? '';
  }

  // Pull occurrences for these sentences and group them by word (with word metadata)
  const wordMap = new Map<string, { word: any; occurrences: any[] }>();
  const frequencyMap = new Map<string, number>();

  let occurrencesQuery = client
    .from('word_occurrences')
    .select(`
      word_id,
      sentence_id,
      word:words(*),
      sentence:sentences!inner(
        id,
        content,
        deleted_at,
        material_id,
        material:materials!inner(id, title, user_id, deleted_at)
      )
    `)
    .eq('sentence.material.user_id', session.user.id)
    .is('sentence.deleted_at', null)
    .is('sentence.material.deleted_at', null);

  if (materialId) {
    occurrencesQuery = occurrencesQuery.eq('sentence.material_id', materialId);
  }

  const { data: occurrences } = await occurrencesQuery;

  (occurrences || []).forEach((occ: any) => {
    if (!occ.word || occ.word.deleted_at) return;

    if (!wordMap.has(occ.word_id)) {
      wordMap.set(occ.word_id, { word: occ.word, occurrences: [] });
    }

    const sentence = occ.sentence || sentenceMap.get(occ.sentence_id);

    wordMap.get(occ.word_id)!.occurrences.push({
      word_id: occ.word_id,
      sentence_id: occ.sentence_id,
      sentence,
    });

    frequencyMap.set(occ.word_id, (frequencyMap.get(occ.word_id) || 0) + 1);
  });

  const wordIds = Array.from(wordMap.keys());

  // Fetch statuses for the words we found; default to NEW if missing so vocabulary still shows up
  const { data: statuses } = wordIds.length > 0
    ? await client
        .from('user_word_statuses')
        .select('*')
        .eq('user_id', session.user.id)
        .in('word_id', wordIds)
    : { data: [] as any[] };

  const statusMap = new Map<string, any>();
  (statuses || []).forEach((s: any) => statusMap.set(s.word_id, s));

  // Also pull user word statuses so we can fall back when occurrences aren't loaded
  const { data: userWords } = await client
    .from('user_word_statuses')
    .select(`
        *,
        word:words(*)
    `)
    .eq('user_id', session.user.id)
    .order('updated_at', { ascending: false });

  // Merge occurrences + statuses so vocab shows up even if occurrences query fails/empties
  const mergedWords = new Map<string, any>();

  (userWords || []).forEach((uw: any) => {
      if (!uw.word || uw.word.deleted_at) return;
      mergedWords.set(uw.word_id, {
          ...uw,
          word: {
              ...uw.word,
              occurrences: []
          }
      });
  });

  wordMap.forEach(({ word, occurrences }, wordId) => {
      const existing = mergedWords.get(wordId);
      if (existing) {
          mergedWords.set(wordId, {
              ...existing,
              word: {
                  ...existing.word,
                  ...word,
                  occurrences
              }
          });
      } else {
          const status = statusMap.get(wordId);
          mergedWords.set(wordId, {
              ...status,
              word_id: wordId,
              status: status?.status ?? "NEW",
              created_at: status?.created_at ?? word.created_at ?? null,
              updated_at: status?.updated_at ?? word.updated_at ?? null,
              word: {
                  ...word,
                  occurrences
              }
          });
      }
  });

  // Only keep words that have valid occurrences (exist in non-deleted materials/sentences)
  const filteredUserWords = Array.from(mergedWords.values())
      .filter((w: any) => (w.word.occurrences?.length ?? 0) > 0)
      .sort((a: any, b: any) => {
          const timeA = a.updated_at ? new Date(a.updated_at).getTime() : 0;
          const timeB = b.updated_at ? new Date(b.updated_at).getTime() : 0;
          return timeB - timeA;
      });

  // Fetch practice stats
  const { data: practices } = await client
    .from('practice_progress')
    .select('attempts')
    .eq('user_id', session.user.id);

  // Transform for table - keep all occurrences for frequency calculation
  const data = filteredUserWords.map((uw: any) => {
      const word = uw.word;
      const wordId = uw.word_id || word.id;
      const frequency = frequencyMap.get(wordId) ?? word.occurrences?.length ?? 0;
      return { 
          ...word,
          id: word.id || wordId,
          frequency,
          occurrences: word.occurrences || [],
          status: uw.status 
      };
  });

  // Calculate stats based on filtered words
  const totalWords = filteredUserWords.length;
  const masteredWords = filteredUserWords.filter((w: any) => w.status === "MASTERED").length;
  const practiceSessions = practices?.reduce((acc, p) => acc + p.attempts, 0) || 0;
  
  // Trends
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const newWords = filteredUserWords.filter((w: any) => w.created_at > oneDayAgo).length;
  const newMastered = filteredUserWords.filter((w: any) => w.status === "MASTERED" && w.updated_at > oneDayAgo).length;
  
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

      <VocabTable columns={vocabColumns} data={data} settings={userSettings} />
    </div>
  );
}
