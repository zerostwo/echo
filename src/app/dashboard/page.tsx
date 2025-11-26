import { auth } from "@/auth"
import { DailyActivityChart } from "@/components/dashboard/daily-activity-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { supabase, supabaseAdmin } from "@/lib/supabase"
import { redirect } from "next/navigation"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) redirect("/login")

  const client = supabaseAdmin || supabase;

  // Fetch materials count
  // In Supabase, getting counts usually requires { count: 'exact', head: true } if we don't want data
  // But here we need to aggregate sentence counts too.
  
  // 1. Fetch Materials with sentence count
  const { data: materials } = await client
    .from('materials')
    .select('id, sentences:sentences(count)')
    .eq('user_id', session.user.id)
    .is('deleted_at', null);

  const totalMaterials = materials?.length || 0;
  const totalSentences = materials?.reduce((acc, m: any) => acc + (m.sentences?.[0]?.count || 0), 0) || 0;

  // 2. Fetch Practices (for average score)
  // Practices are linked to Sentences, which are linked to Materials.
  // Or we can fetch PracticeProgress directly by userId
  const { data: practices } = await client
    .from('practice_progress')
    .select('score')
    .eq('user_id', session.user.id);

  const totalPractices = practices?.length || 0;
  const avgScore = totalPractices > 0
    ? Math.round(practices!.reduce((acc, p) => acc + p.score, 0) / totalPractices)
    : 0;

  // 3. Fetch Daily Stats
  const { data: dailyStats } = await client
    .from('daily_study_stats')
    .select('date, study_duration, words_added, sentences_added')
    .eq('user_id', session.user.id)
    .order('date', { ascending: false })
    .limit(7);

  const formattedDailyStats = dailyStats?.map(stat => ({
    date: stat.date,
    studyDuration: stat.study_duration,
    wordsAdded: stat.words_added,
    sentencesAdded: stat.sentences_added
  })) || [];

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Materials</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalMaterials}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Sentences</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSentences}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Practices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalPractices}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Average Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{avgScore}%</div>
          </CardContent>
        </Card>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4">
          <CardHeader>
            <CardTitle>Overview</CardTitle>
          </CardHeader>
          <CardContent className="pl-2">
            <DailyActivityChart data={formattedDailyStats} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
