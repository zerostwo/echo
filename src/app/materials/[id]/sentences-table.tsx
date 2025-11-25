"use client"

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { PlayCircle } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { Sentence } from "@prisma/client"

interface SentencesTableProps {
  data: Sentence[]
}

export const columns: ColumnDef<Sentence>[] = [
  {
    accessorKey: "order",
    header: "#",
    cell: ({ row }) => <span className="text-muted-foreground font-mono text-xs">#{row.index + 1}</span>,
    size: 50,
  },
  {
    accessorKey: "startTime",
    header: "Time",
    cell: ({ row }) => {
        const start = row.original.startTime;
        const end = row.original.endTime;
        return (
            <span className="text-xs font-medium bg-secondary px-2 py-1 rounded whitespace-nowrap">
                {formatTime(start)} - {formatTime(end)}
            </span>
        )
    },
    size: 120,
  },
  {
    accessorKey: "content",
    header: "Content",
    cell: ({ row }) => (
      <p className="text-sm text-foreground max-w-2xl truncate" title={row.getValue("content")}>
        {row.getValue("content")}
      </p>
    ),
  },
  {
    id: "actions",
    cell: ({ row }) => {
      return (
        <div className="flex justify-end">
             <Link href={`/listening/${row.original.id}`}>
                <Button size="sm" variant="ghost" className="h-8">
                    <PlayCircle className="mr-2 h-4 w-4" /> Practice
                </Button>
            </Link>
        </div>
      )
    },
    size: 100,
  },
]

function formatTime(seconds: number) {
    if (!Number.isFinite(seconds)) return "-:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function SentencesTable({ data }: SentencesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    state: {
      sorting,
    },
    initialState: {
        pagination: {
            pageSize: 50,
        }
    }
  })

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </TableHead>
                )
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows?.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow
                key={row.id}
                data-state={row.getIsSelected() && "selected"}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No sentences found.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      
       <div className="flex items-center justify-end space-x-2 py-4 px-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Next
        </Button>
      </div>
    </div>
  )
}

