import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getWordsForLearning, getLearningStats, LearningFilters } from '@/actions/learning-actions';
import { LearnClient } from './learn-client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from 'lucide-react';
import { supabaseAdmin, supabase } from '@/lib/supabase';

export default async function LearnPage({ 
  searchParams 
}: { 
  searchParams: Promise<{ 
    materialId?: string
    oxford?: string
    collins?: string
  }> 
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/login');

  const params = await searchParams;
  
  // Get user settings for session size
  const client = supabaseAdmin || supabase;
  const { data: user } = await client
    .from('users')
    .select('settings')
    .eq('id', session.user.id)
    .single();

  let sessionSize = 50; // Default
  if (user?.settings) {
    try {
      const settings = JSON.parse(user.settings);
      sessionSize = settings.sessionSize || 50;
    } catch {
      // Use default if parsing fails
    }
  }

  // Build filters from search params
  const filters: LearningFilters = {};
  
  if (params.materialId) {
    filters.materialId = params.materialId;
  }
  
  if (params.oxford === 'true') {
    filters.oxford = true;
  } else if (params.oxford === 'false') {
    filters.oxford = false;
  }
  
  if (params.collins) {
    filters.collins = params.collins.split(',').map(Number).filter(n => !isNaN(n));
  }

  const { words, error } = await getWordsForLearning(sessionSize, Object.keys(filters).length > 0 ? filters : undefined);
  const stats = await getLearningStats(params.materialId);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-destructive">Error loading words</h2>
          <p className="text-muted-foreground mt-2">{error}</p>
          <Link href="/vocab">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Vocabulary
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (words.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <h2 className="text-2xl font-semibold">No words to learn</h2>
          <p className="text-muted-foreground mt-2">
            You don&apos;t have any new or learning words. Add some words to your vocabulary first!
          </p>
          <Link href="/vocab">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Vocabulary
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col">
      <LearnClient initialWords={words} stats={stats} />
    </div>
  );
}
