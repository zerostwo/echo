"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { ArrowUpDown } from "lucide-react"
import Link from "next/link"
import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
import { DictionaryActionsMenu } from "./dictionary-actions-menu"

export type DictionaryWithStats = {
  id: string
  name: string
  description: string | null
  wordCount: number
  learningProgress: number
  accuracy: number
  createdAt: Date
  updatedAt: Date
}

export const columns: ColumnDef<DictionaryWithStats>[] = [
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
    accessorKey: "name",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Name
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      return (
        <Link 
            href={`/dictionaries/${row.original.id}`}
            className="font-medium hover:underline"
        >
            {row.getValue("name")}
        </Link>
      )
    },
  },
  {
    accessorKey: "wordCount",
    header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Words
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
      },
    cell: ({ row }) => <div className="pl-4">{row.getValue("wordCount")}</div>,
  },
  {
    accessorKey: "learningProgress",
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
      const progress = row.getValue("learningProgress") as number
      return (
        <div className="flex items-center gap-2 w-[100px]">
          <Progress value={progress} className="h-2" />
          <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
        </div>
      )
    },
  },
  {
    accessorKey: "accuracy",
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Accuracy
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
        const accuracy = row.getValue("accuracy") as number
        return (
            <div className="font-medium">
                {Math.round(accuracy)}%
            </div>
        )
    },
  },
]
