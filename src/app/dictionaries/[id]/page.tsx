import { getDictionary } from "@/actions/dictionary-actions"
import { Button } from "@/components/ui/button"
import { GraduationCap, BookOpen, Trophy, Clock, TrendingUp, AlertCircle } from "lucide-react"
import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { AddWordDialog } from "@/components/dictionaries/add-word-dialog"
import { DeleteDictionaryButton } from "@/components/dictionaries/delete-dictionary-button"
import { VocabClient } from "@/app/words/vocab-client"
import { HeaderPortal } from "@/components/header-portal"
import { SetBreadcrumbs } from "@/components/set-breadcrumbs"
import { auth } from "@/auth"
import { getAdminClient } from "@/lib/appwrite"
import { DATABASE_ID } from "@/lib/appwrite_client"
import { getVocabPaginated } from "@/actions/vocab-actions"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default async function DictionaryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const dictionary = await getDictionary(id)

  if (!dictionary) {
    notFound()
  }

  // Fetch user settings
  let userSettings: any = {};
  try {
    const { databases } = await getAdminClient();
    const userData = await databases.getDocument(
      DATABASE_ID,
      'users',
      session.user.id
    );

    if (userData?.settings) {
      try {
        userSettings = JSON.parse(userData.settings);
      } catch (e) {
        console.error("Failed to parse user settings", e);
      }
    }
  } catch (e) {
    console.error("Failed to fetch user settings", e);
  }

  const pageSize = userSettings.vocabPageSize || 10;
  const sortBy = userSettings.vocabSortBy || 'updated_at';
  const sortOrder = userSettings.vocabSortOrder || 'desc';
  
  // Initial fetch with dictionaryId
  const initialResult = await getVocabPaginated(1, pageSize, { dictionaryId: id }, sortBy, sortOrder);

  if ('error' in initialResult) {
    return <div className="p-8">Error loading vocabulary: {initialResult.error}</div>;
  }

  const { stats } = initialResult;

  return (
    <div className="h-full flex flex-col space-y-4 py-4">
      <SetBreadcrumbs items={[
        { title: "Dictionary", href: "/dictionaries" },
        { title: dictionary.name, href: `/dictionaries/${dictionary.id}` }
      ]} />

      <HeaderPortal>
        <div className="flex items-center gap-2">
            <Link href={`/study/words?dictionaryId=${dictionary.id}`}>
              <Button size="sm">
                <GraduationCap className="mr-2 h-4 w-4" />
                Start Learning
              </Button>
            </Link>
            <AddWordDialog dictionaryId={dictionary.id} />
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
              {stats.totalWords > 0 ? Math.round((stats.masteredWords / stats.totalWords) * 100) : 0}% of dictionary
            </p>
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
              Average retention
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex-1 overflow-hidden">
         <VocabClient 
            initialData={initialResult} 
            dictionaryId={id}
            settings={userSettings}
         />
      </div>
    </div>
  )
}
