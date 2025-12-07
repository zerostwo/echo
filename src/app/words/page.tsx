import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
import { VocabClient } from './vocab-client';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BookOpen, Trophy, Activity, Clock, GraduationCap, TrendingUp, AlertCircle } from "lucide-react";
import { HeaderPortal } from '@/components/header-portal';
import { Badge } from "@/components/ui/badge";
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { redirect } from 'next/navigation';
import { getVocabPaginated, PaginatedVocabResult } from '@/actions/vocab-actions';

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

  // Get initial paginated data with user's saved page size
  const pageSize = userSettings.vocabPageSize || 10;
  const sortBy = userSettings.vocabSortBy || 'updated_at';
  const sortOrder = userSettings.vocabSortOrder || 'desc';
  
  const filters: any = { 
    materialId,
    showMastered: userSettings.vocabShowMastered ?? false
  };
  
  const initialResult = await getVocabPaginated(1, pageSize, filters, sortBy, sortOrder);
  
  if ('error' in initialResult) {
    return <div className="p-8">Error loading vocabulary: {initialResult.error}</div>;
  }

  // Get material title if filtered
  let filteredMaterialTitle = '';
  if (materialId) {
    const { data: material } = await client
      .from('materials')
      .select('title')
      .eq('id', materialId)
      .eq('user_id', session.user.id)
      .single();
    
    filteredMaterialTitle = material?.title || '';
  }

  // Fetch all materials for the filter dropdown
  const { data: materialsList } = await client
    .from('materials')
    .select('id, title')
    .eq('user_id', session.user.id)
    .is('deleted_at', null)
    .order('title', { ascending: true });

  const materials = materialsList?.map(m => ({ id: m.id, title: m.title })) || [];

  const { stats, data } = initialResult;
  
  // Build learning URL with material filter
  const learnUrl = materialId ? `/study/words?materialId=${materialId}` : '/study/words';

  return (
    <div className="flex-1 space-y-8 p-8">
      <HeaderPortal>
        <div className="flex items-center gap-2">
            {materialId && (
                <div className="flex items-center gap-2 mr-4">
                    <Badge variant="secondary" className="h-8 px-3 text-sm gap-2">
                        <BookOpen className="h-3.5 w-3.5" />
                        Filtered by: {filteredMaterialTitle || 'Material'}
                    </Badge>
                    <Link href="/words">
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                            <X className="h-4 w-4" />
                        </Button>
                    </Link>
                </div>
            )}
            <Link href={learnUrl}>
              <Button>
                <GraduationCap className="mr-2 h-4 w-4" />
                Start Learning
              </Button>
            </Link>
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
            <div className="text-2xl font-bold">{stats.totalWords.toLocaleString()}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground">
                {stats.newWords.toLocaleString()} new
              </span>
              <span className="text-xs text-muted-foreground">•</span>
              <span className="text-xs text-muted-foreground">
                {stats.learningWords.toLocaleString()} learning
              </span>
            </div>
            {stats.newWords24h > 0 && (
              <p className="text-xs text-green-500 mt-1">
                +{stats.newWords24h} added today
              </p>
            )}
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
            <div className="text-2xl font-bold">{stats.masteredWords.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">
              {stats.totalWords > 0 ? Math.round((stats.masteredWords / stats.totalWords) * 100) : 0}% of total vocabulary
            </p>
            {stats.masteredWords24h > 0 && (
              <p className="text-xs text-green-500 mt-1">
                +{stats.masteredWords24h} mastered today
              </p>
            )}
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Due for Review</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(stats.dueToday + stats.overdueWords).toLocaleString()}</div>
            <div className="flex items-center gap-2 mt-1">
              {stats.overdueWords > 0 && (
                <>
                  <span className="text-xs text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {stats.overdueWords} overdue
                  </span>
                  <span className="text-xs text-muted-foreground">•</span>
                </>
              )}
              <span className="text-xs text-muted-foreground">
                {stats.dueToday} due today
              </span>
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Retention Rate
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.averageRetention}%</div>
            <p className="text-xs text-muted-foreground">
              Average retention across reviewed words
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Based on FSRS algorithm
            </p>
          </CardContent>
        </Card>
      </div>

      <VocabClient 
        initialData={initialResult} 
        materialId={materialId} 
        settings={userSettings}
        materials={materials}
      />
    </div>
  );
}
