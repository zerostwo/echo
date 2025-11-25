"use client"

import { ColumnDef } from "@tanstack/react-table"
import { TrashActionsMenu } from "./trash-actions-menu"

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

