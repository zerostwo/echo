import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getAdminClient, APPWRITE_DATABASE_ID, Query } from '@/lib/appwrite';
import { withQueryLogging } from '@/lib/query-logger';

export interface DashboardStats {
  heatmapData: Array<{
    date: string;
    duration: number;
  }>;
  wordsDueToday: number;
  wordsMasteredTodayCount: number;
  sentencesPracticedTodayCount: number;
  dailyGoals: {
    words: number;
    sentences: number;
  };
  vocabSnapshot: {
    new: number;
    learning: number;
    mastered: number;
  };
  sentenceSnapshot: {
    new: number;
    practiced: number;
    mastered: number;
  };
  hardestWords: Array<{
    id: string;
    text: string;
    errorCount: number;
    translation: string | null;
    phonetic: string | null;
    pos: string | null;
    definition: string | null;
    tag: string | null;
    exchange: string | null;
  }>;
  totalMaterials: number;
  totalSentences: number;
  totalWords: number;
  totalPractices: number;
  averageScore: number;
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
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userId = session.user.id;
  
  try {
    const stats = await withQueryLogging('getDashboardStats', async () => {
      const admin = getAdminClient();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000 - 1);
      const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

      const [
        materialsResult,
        practicesResult,
        dailyStatsResult,
        wordStatusesResult,
        user,
        dictionariesResult,
      ] = await Promise.all([
        admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'materials',
          [
            Query.equal('user_id', userId),
            Query.isNull('deleted_at')
          ]
        ),
        admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'practice_progress',
          [Query.equal('user_id', userId)]
        ),
        admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'daily_study_stats',
          [
            Query.equal('user_id', userId),
            Query.greaterThanEqual('date', yearStart),
            Query.orderAsc('date')
          ]
        ),
        admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'user_word_statuses',
          [
            Query.equal('user_id', userId),
            Query.isNull('deleted_at'),
            Query.limit(5000)
          ]
        ),
        admin.databases.getDocument(APPWRITE_DATABASE_ID, 'users', userId),
        admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'dictionaries',
          [
            Query.equal('user_id', userId),
            Query.isNull('deleted_at')
          ]
        ),
      ]);

      const materials = materialsResult.documents;
      const practices = practicesResult.documents;
      const dailyStats = dailyStatsResult.documents;
      const wordStatuses = wordStatusesResult.documents;
      const dictionaries = dictionariesResult.documents;

    // 4. Today's Reviews
    // Reviews don't have user_id directly usually, but we can try to filter by time and then check ownership?
    // Or if we added user_id to reviews (which we should have for performance).
    // Assuming we can't easily query reviews by user_id directly without a join or if we didn't add it.
    // But wait, in import-service we saw reviews have user_word_status_id.
    // We can fetch reviews created today, but that's global.
    // Better: Fetch user's statuses, then reviews? Too many.
    // If we don't have user_id on reviews, this is hard.
    // Let's assume we can fetch reviews by time and filter in memory if volume is low, 
    // OR we rely on daily_study_stats for counts?
    // daily_study_stats has words_reviewed count!
    
    // Let's use daily_study_stats for today's counts if available.
    // If we need exact reviews for some reason (e.g. response time), we might need a better way.
    // But for dashboard stats, maybe we can skip detailed review fetching if we just need count.
    // The original code fetched reviews to count them.
    
    // Let's try to fetch reviews if we can.
    // If we can't filter by user, we can't efficiently get today's reviews.
    // BUT, we can get today's updated statuses?
    // Let's stick to what we can get.
    
    // 6. Hardest Words - will be filtered later after we know which words are in user's materials
    // Keeping candidates for now
    const hardestWordsCandidates = wordStatuses
        .filter((s: any) => s.error_count > 0)
        .sort((a: any, b: any) => b.error_count - a.error_count);

    // 8. Sentences Practiced Today
    const sentencesPracticedToday = practices.filter((p: any) => {
        const pDate = new Date(p.$updatedAt);
        return pDate >= todayStart && pDate <= todayEnd;
    });

    // Process Data
    
    // Materials & Sentences
    const totalMaterials = materials.length;
    // We need total sentences count.
    // We can fetch all sentences for these materials.
    // Or use aggregation if available (Appwrite doesn't support count aggregation easily).
    // We'll fetch all sentences IDs for user's materials.
    const materialIds = materials.map(m => m.$id);
    let totalSentences = 0;
    if (materialIds.length > 0) {
        // Batch count
        for (let i = 0; i < materialIds.length; i += 100) {
             const batch = materialIds.slice(i, i + 100);
             const { total } = await admin.databases.listDocuments(
                 APPWRITE_DATABASE_ID,
                 'sentences',
                 [
                     Query.equal('material_id', batch),
                     Query.limit(1) // We just want total
                 ]
             );
             totalSentences += total;
        }
    }

    // Practices
    const totalPractices = practices.length;
    const averageScore = totalPractices > 0
        ? Math.round(practices.reduce((acc: number, p: any) => acc + (p.score || 0), 0) / totalPractices)
        : 0;

    // Heatmap
    const heatmapData = dailyStats.map((stat: any) => ({
        date: stat.date.split('T')[0],
        duration: stat.study_duration || 0,
    }));

    // Get unique word IDs from user's materials (via word_occurrences)
    const wordIdsInMaterials = new Set<string>();
    if (materialIds.length > 0) {
        // Get all sentences for user's materials
        const allSentenceIds: string[] = [];
        for (let i = 0; i < materialIds.length; i += 100) {
            const batch = materialIds.slice(i, i + 100);
            const { documents: sentencesDocs } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'sentences',
                [
                    Query.equal('material_id', batch),
                    Query.isNull('deleted_at'),
                    Query.limit(5000)
                ]
            );
            allSentenceIds.push(...sentencesDocs.map((s: any) => s.$id));
        }
        
        // Get word occurrences for these sentences
        if (allSentenceIds.length > 0) {
            for (let i = 0; i < allSentenceIds.length; i += 100) {
                const batch = allSentenceIds.slice(i, i + 100);
                const { documents: occurrences } = await admin.databases.listDocuments(
                    APPWRITE_DATABASE_ID,
                    'word_occurrences',
                    [
                        Query.equal('sentence_id', batch),
                        Query.limit(5000)
                    ]
                );
                occurrences.forEach((o: any) => wordIdsInMaterials.add(o.word_id));
            }
        }
    }

    // Also add words from user's dictionaries
    if (dictionaries.length > 0) {
        const dictIds = dictionaries.map((d: any) => d.$id);
        for (let i = 0; i < dictIds.length; i += 100) {
            const batch = dictIds.slice(i, i + 100);
            const { documents: dictWords } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'dictionary_words',
                [Query.equal('dictionary_id', batch)]
            );
            dictWords.forEach((dw: any) => wordIdsInMaterials.add(dw.word_id));
        }
    }

    // Filter word statuses to only include words in user's materials/dictionaries
    const relevantWordStatusMap = new Map<string, any>();
    for (const ws of wordStatuses) {
        if (!wordIdsInMaterials.has(ws.word_id)) continue;
        const existing = relevantWordStatusMap.get(ws.word_id);
        if (!existing) {
            relevantWordStatusMap.set(ws.word_id, ws);
            continue;
        }
        const existingTime = new Date(existing.$updatedAt || existing.$createdAt || 0).getTime();
        const nextTime = new Date(ws.$updatedAt || ws.$createdAt || 0).getTime();
        if (nextTime >= existingTime) {
            relevantWordStatusMap.set(ws.word_id, ws);
        }
    }
    const relevantWordStatuses = Array.from(relevantWordStatusMap.values());

    // Vocab Snapshot - only count words in user's materials/dictionaries
    const vocabSnapshot = relevantWordStatuses.reduce(
      (acc: { new: number; learning: number; mastered: number }, ws: any) => {
        const normalizedStatus = !ws.status || ws.status === 'UNKNOWN' ? 'NEW' : ws.status;
        if (normalizedStatus === 'NEW') acc.new++;
        else if (normalizedStatus === 'LEARNING') acc.learning++;
        else if (normalizedStatus === 'MASTERED') acc.mastered++;
        return acc;
      },
      { new: 0, learning: 0, mastered: 0 }
    );
    const missingWordCount = Math.max(0, wordIdsInMaterials.size - relevantWordStatusMap.size);
    vocabSnapshot.new += missingWordCount;
    const totalWords = wordIdsInMaterials.size;

    // Words Due Today - only count words in user's materials/dictionaries
    const wordsDueToday = relevantWordStatuses.filter((ws: any) => {
        if (ws.status !== 'NEW' && ws.status !== 'LEARNING') return false;
        if (!ws.fsrs_due) return true;
        return new Date(ws.fsrs_due) <= todayEnd;
    }).length + missingWordCount;

    // Words Mastered Today (unique words, not review count)
    const wordsMasteredTodayCount = relevantWordStatuses.filter((ws: any) => {
        if (ws.status !== 'MASTERED') return false;
        if (!ws.fsrs_last_review) return false;
        const reviewedAt = new Date(ws.fsrs_last_review);
        return reviewedAt >= todayStart && reviewedAt <= todayEnd;
    }).length;

    // Hardest Words - filter to only include words in user's materials/dictionaries
    const hardestWordsList = hardestWordsCandidates
        .filter((s: any) => wordIdsInMaterials.has(s.word_id))
        .slice(0, 5);
    
    // Fetch word details for hardest words
    const hardestWordsDetails: any[] = [];
    if (hardestWordsList.length > 0) {
        const { documents: hwDocs } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'words',
            [Query.equal('$id', hardestWordsList.map((s: any) => s.word_id))]
        );
        
        for (const status of hardestWordsList) {
            const word = hwDocs.find((w: any) => w.$id === status.word_id);
            if (word) {
                hardestWordsDetails.push({
                    id: word.$id,
                    text: word.text,
                    errorCount: status.error_count,
                    translation: word.translation,
                    phonetic: word.phonetic,
                    pos: word.pos,
                    definition: word.definition,
                    tag: word.tag,
                    exchange: word.exchange,
                });
            }
        }
    }

    // Sentence Snapshot
    const practicedIds = new Set(practices.map((p: any) => p.sentence_id));
    const masteredCount = practices.filter((p: any) => p.score >= 90).length;
    const practicedCount = practices.filter((p: any) => p.score < 90).length;
    const newSentences = Math.max(0, totalSentences - practices.length); // Approx

    const sentenceSnapshot = {
        new: newSentences,
        practiced: practicedCount,
        mastered: masteredCount
    };

    // Last Word Reviewed - only from words in user's materials/dictionaries
    const lastUpdatedStatus = relevantWordStatuses.sort((a: any, b: any) => 
        new Date(b.$updatedAt).getTime() - new Date(a.$updatedAt).getTime()
    )[0];
    
    let lastWord = null;
    if (lastUpdatedStatus) {
        try {
            const word = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'words', lastUpdatedStatus.word_id);
            lastWord = {
                id: word.$id,
                text: word.text
            };
        } catch (e) {
            // Word might have been deleted
        }
    }

    // Last Sentence Practiced
    const lastPractice = practices.sort((a: any, b: any) => 
        new Date(b.$updatedAt).getTime() - new Date(a.$updatedAt).getTime()
    )[0];
    
    let lastSentence = null;
    if (lastPractice) {
        try {
            const sentence = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'sentences', lastPractice.sentence_id);
            const material = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'materials', sentence.material_id);
            lastSentence = {
                id: sentence.$id,
                content: sentence.content.substring(0, 50) + (sentence.content.length > 50 ? '...' : ''),
                materialId: sentence.material_id,
                materialTitle: material.title || 'Unknown',
            };
        } catch (e) {}
    }

    // Settings
    let dailyGoals = { words: 20, sentences: 10 };
    if (user.settings) {
      try {
        const settings = typeof user.settings === 'string' ? JSON.parse(user.settings) : user.settings;
        if (settings.dailyGoals) {
          dailyGoals = settings.dailyGoals;
        }
      } catch (e) {}
    }

      const resultStats: DashboardStats = {
        heatmapData,
        wordsDueToday,
        wordsMasteredTodayCount,
        sentencesPracticedTodayCount: sentencesPracticedToday.length,
        dailyGoals,
        vocabSnapshot,
        sentenceSnapshot,
        hardestWords: hardestWordsDetails,
        totalMaterials,
        totalSentences,
        totalWords,
        totalPractices,
        averageScore,
        lastWord,
        lastSentence,
      };

      return resultStats;
        }, { user_id: userId });

    return NextResponse.json(stats, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error) {
    console.error('[getDashboardStats] Error:', error);
    return NextResponse.json({ error: 'Failed to fetch dashboard stats' }, { status: 500 });
  }
}
