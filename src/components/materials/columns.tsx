"use client"

import { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { formatInTimeZone } from "@/lib/time"

// Determine the shape of our data.
export type Material = {
  id: string
  title: string
  created_at: string
  _count: {
    sentences: number
  }
  folder_id: string | null
  stats: {
      practicedCount: number
      totalSentences: number
      avgScore: number
      vocabCount: number
      duration: number
      attempts: number
  }
}

function getDisplayName(filename: string) {
    return filename.replace(/\.[^/.]+$/, "")
}

export const columns = (folders: any[], timezone: string): ColumnDef<Material>[] => {
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  return [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "title",
    header: "Title",
    enableSorting: false,
    cell: ({ row }) => {
        const displayName = getDisplayName(row.getValue("title"))
        return (
            <Link href={`/materials/${row.original.id}`} className="font-medium hover:underline">
                {displayName}
            </Link>
        )
    }
  },
  {
    accessorKey: "_count.sentences",
    id: "sentences",
    header: "Sentences",
    enableSorting: false,
    cell: ({ row }) => {
        // Use the pre-calculated stats if available, otherwise fallback
        return row.original.stats?.totalSentences || 0
    }
  },
  {
    id: "vocab",
    accessorFn: (row) => row.stats.vocabCount,
    header: "Words",
    enableSorting: false,
    cell: ({ row }) => {
        const count = row.original.stats.vocabCount
        return (
            <Link href={`/words?materialId=${row.original.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                {count}
            </Link>
        )
    }
  },
  {
    id: "progress",
    accessorFn: (row) => row.stats.practicedCount,
    header: "Progress",
    enableSorting: false,
    cell: ({ row }) => {
        const stats = row.original.stats
        const isComplete = stats.practicedCount === stats.totalSentences && stats.totalSentences > 0
        
        return (
            <div className="flex items-center gap-2">
                <span>{stats.practicedCount}/{stats.totalSentences}</span>
                {isComplete && <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 text-[10px] px-1 py-0 h-4">Done</Badge>}
            </div>
        )
    }
  },
  {
    id: "score",
    accessorFn: (row) => row.stats.avgScore,
    header: "Score",
    enableSorting: false,
    cell: ({ row }) => {
        const stats = row.original.stats
        if (stats.practicedCount === 0) return <span className="text-muted-foreground">-</span>
        return (
            <span className={stats.avgScore >= 80 ? "text-green-600 font-medium" : "text-amber-600 font-medium"}>
                {stats.avgScore}%
            </span>
        )
    }
  },
  {
    id: "attempts",
    accessorFn: (row) => row.stats.attempts,
    header: "Attempts",
    enableSorting: false,
    cell: ({ row }) => {
        const stats = row.original.stats
        if (stats.practicedCount === 0) return <span className="text-muted-foreground">-</span>
        return <span>{stats.attempts}</span>
    }
  },
  {
    id: "practice_time",
    accessorFn: (row) => row.stats.duration,
    header: "Practice Time",
    enableSorting: false,
    cell: ({ row }) => {
        const stats = row.original.stats
        if (stats.practicedCount === 0) return <span className="text-muted-foreground">-</span>
        const durationMins = Math.round(stats.duration / 60)
        return <span>{durationMins}m</span>
    }
  },
  {
    accessorKey: "created_at",
    id: "uploaded",
    header: "Uploaded",
    enableSorting: false,
    cell: ({ row }) => {
        return formatInTimeZone(row.getValue("created_at"), tz)
    }
  }
]
}
