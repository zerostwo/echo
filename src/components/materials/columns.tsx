"use client"

import { ColumnDef } from "@tanstack/react-table"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { ArrowUpDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

// Determine the shape of our data.
export type Material = {
  id: string
  title: string
  createdAt: Date
  _count: {
    sentences: number
  }
  folderId: string | null
  stats: {
      practicedCount: number
      totalSentences: number
      avgScore: number
      vocabCount: number
      duration: number
      attempts: number
  }
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}

function getDisplayName(filename: string) {
    return filename.replace(/\.[^/.]+$/, "")
}

export const columns = (folders: any[]): ColumnDef<Material>[] => [
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
    header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Title
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
    },
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
    header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Sentences
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
    },
    cell: ({ row }) => {
        // Use the pre-calculated stats if available, otherwise fallback
        return row.original.stats?.totalSentences || 0
    }
  },
  {
    id: "progress",
    accessorFn: (row) => row.stats.practicedCount,
    header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Progress
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
    },
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
    header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Score
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
    },
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
    id: "time",
    accessorFn: (row) => row.stats.duration,
    header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Time
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
    },
    cell: ({ row }) => {
        const stats = row.original.stats
        if (stats.practicedCount === 0) return <span className="text-muted-foreground">-</span>
        const durationMins = Math.round(stats.duration / 60)
        return <span>{durationMins}m</span>
    }
  },
  {
    id: "attempts",
    accessorFn: (row) => row.stats.attempts,
    header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Attempts
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
    },
    cell: ({ row }) => {
        const stats = row.original.stats
        if (stats.practicedCount === 0) return <span className="text-muted-foreground">-</span>
        return <span>{stats.attempts}</span>
    }
  },
  {
    id: "vocab",
    accessorFn: (row) => row.stats.vocabCount,
    header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Vocabulary
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
    },
    cell: ({ row }) => {
        const count = row.original.stats.vocabCount
        return (
            <Link href={`/vocab?materialId=${row.original.id}`} className="text-sm font-medium text-blue-600 hover:underline">
                {count}
            </Link>
        )
    }
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Uploaded
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
    },
    cell: ({ row }) => {
        return formatDate(new Date(row.getValue("createdAt")))
    }
  }
]
