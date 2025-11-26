"use client"

import { ColumnDef } from "@tanstack/react-table"
import { TrashActionsMenu } from "./trash-actions-menu"
import { Checkbox } from "@/components/ui/checkbox"

export type TrashItem = {
  id: string
  title: string
  deletedAt: Date
  size: number
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

export const columns: ColumnDef<TrashItem>[] = [
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
  },
  {
    accessorKey: "size",
    header: "Size",
    cell: ({ row }) => {
        return (row.getValue("size") as number / 1024 / 1024).toFixed(2) + " MB"
    }
  },
  {
    accessorKey: "deletedAt",
    header: "Deleted At",
    cell: ({ row }) => {
        return formatDate(new Date(row.getValue("deletedAt")))
    }
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const material = row.original
      return <TrashActionsMenu material={material} />
    },
  },
]

