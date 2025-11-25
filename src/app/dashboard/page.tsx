import { auth } from "@/auth"
import { DailyActivityChart } from "@/components/dashboard/daily-activity-chart"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import prisma from "@/lib/prisma"

export default async function DashboardPage() {
  const session = await auth()
  if (!session?.user?.id) return null

  // Fetch stats
  const stats = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      materials: {
        where: { deletedAt: null },
        select: {
          _count: {
            select: { sentences: true }
          }
        }
      },
      practices: {
        select: {
          id: true,
          score: true,
          updatedAt: true
        }
      },
      dailyStats: {
        orderBy: { date: "desc" },
        take: 7,
        select: {
          date: true,
          studyDuration: true,
          wordsAdded: true,
          sentencesAdded: true
        }
      }
    }
  })

  const totalMaterials = stats?.materials.length || 0
  const totalSentences = stats?.materials.reduce((acc, m) => acc + m._count.sentences, 0) || 0
  const totalPractices = stats?.practices.length || 0
  const avgScore = totalPractices > 0 
    ? Math.round(stats?.practices.reduce((acc, p) => acc + p.score, 0)! / totalPractices) 
    : 0

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
            <DailyActivityChart data={stats?.dailyStats || []} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
