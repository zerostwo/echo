"use client"

import { ColumnDef } from "@tanstack/react-table"
import { TrashActionsMenu } from "./trash-actions-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { formatInTimeZone } from "@/lib/time"

export type TrashItem = {
  id: string
  type: 'material' | 'sentence' | 'word' | 'dictionary'
  title: string
  deleted_at: string | null
  size?: number | null
  location?: string
}

export const buildTrashColumns = (timezone: string): ColumnDef<TrashItem>[] => {
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
    accessorKey: "type",
    header: "Type",
    cell: ({ row }) => {
      const type = row.getValue("type") as string;
      if (type === 'material') return 'Material';
      if (type === 'sentence') return 'Sentence';
      if (type === 'dictionary') return 'Dictionary';
      return 'Word';
    },
  },
  {
    accessorKey: "title",
    header: "Title",
    cell: ({ row }) => (
      <div className="max-w-[520px] whitespace-pre-wrap break-words">
        {row.getValue("title") as string}
      </div>
    )
  },
  {
    accessorKey: "location",
    header: "Location",
    cell: ({ row }) => row.getValue("location") || '—',
  },
  {
    accessorKey: "size",
    header: "Size",
    cell: ({ row }) => {
        const size = row.getValue("size") as number | null
        if (!size) return "—"
        return (size / 1024 / 1024).toFixed(2) + " MB"
    }
  },
  {
    accessorKey: "deleted_at",
    header: "Deleted At",
    cell: ({ row }) => {
        return formatInTimeZone(row.getValue("deleted_at") as string | null, tz)
    }
  },
  {
    id: "actions",
    cell: ({ row }) => {
      const item = row.original
      return <TrashActionsMenu item={item} />
    },
  },
]
}
