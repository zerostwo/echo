"use client"

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
  ColumnFiltersState,
  getFilteredRowModel,
  getPaginationRowModel,
  RowSelectionState,
  VisibilityState,
} from "@tanstack/react-table"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { ArrowUpDown, Check, MoreHorizontal, SlidersHorizontal, Plus, Filter } from "lucide-react"
import { WordDetailSheet } from "./word-detail-sheet"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { updateWordsStatus } from "@/actions/word-actions"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  settings?: {
    vocabColumns?: string[]
    vocabSortBy?: string
    vocabShowMastered?: boolean
  }
}

export function VocabTable<TData, TValue>({
  columns,
  data,
  settings,
}: DataTableProps<TData, TValue>) {

  // Get unique Collins levels from data
  const uniqueCollins = useMemo(() => {
    const collinsSet = new Set<number>()
    data.forEach((item: any) => {
      if (item.collins && item.collins > 0) collinsSet.add(item.collins)
    })
    return Array.from(collinsSet).sort((a, b) => b - a) // Sort descending (5 stars first)
  }, [data])

  // Apply settings - filter out mastered words if setting is off
  const filteredData = useMemo(() => {
    if (settings?.vocabShowMastered === false) {
      return (data as any[]).filter((item: any) => item.status !== "MASTERED") as TData[]
    }
    return data
  }, [data, settings?.vocabShowMastered])

  // Determine initial sorting based on settings
  const getInitialSorting = (): SortingState => {
    const sortBy = settings?.vocabSortBy || "date_added"
    switch (sortBy) {
      case "date_added":
        return [] // Default ordering from server (newest first)
      case "date_added_asc":
        return [] // Would need a date column to sort, keeping default for now
      case "alphabetical":
        return [{ id: "text", desc: false }]
      case "alphabetical_desc":
        return [{ id: "text", desc: true }]
      default:
        return []
    }
  }

  const [sorting, setSorting] = useState<SortingState>(getInitialSorting())
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [selectedWord, setSelectedWord] = useState<any>(null)
  const router = useRouter()

  // Get initial column visibility based on settings
  const getInitialColumnVisibility = () => {
    const visibleCols = settings?.vocabColumns || ["word", "translation", "pronunciation"]
    const visibility: Record<string, boolean> = {}
    // Map setting column names to actual column ids
    const columnMapping: Record<string, string> = {
      word: "text",
      translation: "tag", // Using tag as a proxy since we don't have translation column
      definition: "pos",
      pronunciation: "phonetic",
      example: "collins"
    }
    // By default, show all columns, but hide specific ones based on settings
    columns.forEach((col: any) => {
      if (col.id === "select" || col.id === "actions") {
        visibility[col.id || col.accessorKey] = true // Always show select and actions
      } else {
        // Check if this column should be visible based on settings
        const colId = col.id || col.accessorKey
        const settingKey = Object.entries(columnMapping).find(([, v]) => v === colId)?.[0]
        if (settingKey) {
          visibility[colId] = visibleCols.includes(settingKey)
        } else {
          visibility[colId] = true // Show columns not in mapping
        }
      }
    })
    return visibility
  }

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(getInitialColumnVisibility())

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      rowSelection,
      columnVisibility,
    },
  })

  const handleMarkMastered = async () => {
      const selectedIds = table.getFilteredSelectedRowModel().rows.map((row: any) => row.original.id);
      if (selectedIds.length === 0) return;
      
      const res = await updateWordsStatus(selectedIds, "MASTERED");
      if (res.success) {
          toast.success(`Marked ${selectedIds.length} words as mastered`);
          setRowSelection({});
          router.refresh();
      } else {
          toast.error("Failed to update words");
      }
  }

    return (
    <div className="space-y-4">
      <div className="flex items-center justify-between py-4">
        <Input
          placeholder="Filter words..."
          value={(table.getColumn("text")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("text")?.setFilterValue(event.target.value)
          }
          className="max-w-sm"
        />
        <div className="flex gap-2">
            {Object.keys(rowSelection).length > 0 && (
              <Button size="sm" onClick={handleMarkMastered}>
                  <Check className="mr-2 h-4 w-4" />
                  Mark as Mastered
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-dashed">
                  <Filter className="mr-2 h-4 w-4" />
                  Status
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {["NEW", "LEARNING", "MASTERED"].map((status) => {
                  const filterValue = (table.getColumn("status")?.getFilterValue() as string[]) || [];
                  return (
                    <DropdownMenuCheckboxItem
                      key={status}
                      checked={filterValue.includes(status)}
                      onCheckedChange={(checked) => {
                        const newFilterValue = checked
                          ? [...filterValue, status]
                          : filterValue.filter((val) => val !== status);
                        table.getColumn("status")?.setFilterValue(newFilterValue.length ? newFilterValue : undefined);
                      }}
                    >
                      {status}
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-dashed">
                  <Filter className="mr-2 h-4 w-4" />
                  Collins
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filter by Collins Level</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {[5, 4, 3, 2, 1].map((level) => {
                  const filterValue = (table.getColumn("collins")?.getFilterValue() as number[]) || [];
                  return (
                    <DropdownMenuCheckboxItem
                      key={level}
                      checked={filterValue.includes(level)}
                      onCheckedChange={(checked) => {
                        const newFilterValue = checked
                          ? [...filterValue, level]
                          : filterValue.filter((val) => val !== level);
                        table.getColumn("collins")?.setFilterValue(newFilterValue.length ? newFilterValue : undefined);
                      }}
                    >
                      <span className="text-yellow-500 mr-2">{"★".repeat(level)}</span>
                      <span className="text-muted-foreground/30">{"★".repeat(5 - level)}</span>
                    </DropdownMenuCheckboxItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-dashed">
                  <Filter className="mr-2 h-4 w-4" />
                  Oxford
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filter by Oxford 3000</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={table.getColumn("oxford")?.getFilterValue() === true}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      table.getColumn("oxford")?.setFilterValue(true);
                    } else {
                      table.getColumn("oxford")?.setFilterValue(undefined);
                    }
                  }}
                >
                  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 mr-2">Oxford</Badge>
                  Only Oxford 3000
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={table.getColumn("oxford")?.getFilterValue() === false}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      table.getColumn("oxford")?.setFilterValue(false);
                    } else {
                      table.getColumn("oxford")?.setFilterValue(undefined);
                    }
                  }}
                >
                  Exclude Oxford 3000
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="ml-auto">
                  <SlidersHorizontal className="mr-2 h-4 w-4" />
                  View
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {table
                  .getAllColumns()
                  .filter((column) => column.getCanHide())
                  .map((column) => {
                    return (
                      <DropdownMenuCheckboxItem
                        key={column.id}
                        className="capitalize"
                        checked={column.getIsVisible()}
                        onCheckedChange={(value) =>
                          column.toggleVisibility(!!value)
                        }
                      >
                        {column.id}
                      </DropdownMenuCheckboxItem>
                    )
                  })}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="rounded-md border">
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
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={(e) => {
                      // Prevent row click when clicking checkbox
                      if ((e.target as HTMLElement).closest('[role="checkbox"]')) return;
                      setSelectedWord(row.original)
                    }}
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
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="flex items-center justify-end space-x-2 py-4">
          <div className="flex-1 text-sm text-muted-foreground">
            {table.getFilteredSelectedRowModel().rows.length} of{" "}
            {table.getFilteredRowModel().rows.length} row(s) selected.
          </div>
          <div className="space-x-2">
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
        
      {selectedWord && (
          <WordDetailSheet 
              word={selectedWord} 
              open={!!selectedWord} 
              onOpenChange={(open) => !open && setSelectedWord(null)} 
          />
      )}
    </div>
  )
}

export const vocabColumns: ColumnDef<any>[] = [
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
        onClick={(e) => e.stopPropagation()}
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "text",
    header: ({ column }) => {
        return (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Word
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
    },
    cell: ({ row }) => <span className="font-medium pl-4">{row.getValue("text")}</span>
  },
  {
    accessorKey: "phonetic",
    header: "Phonetic",
    cell: ({ row }) => <span className="font-mono text-muted-foreground text-sm">{row.getValue("phonetic") || "-"}</span>
  },
  {
    id: "frequency",
    accessorFn: (row: any) => row.occurrences?.length || 0,
    header: ({ column }) => {
      return (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
        >
          Frequency
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      )
    },
    cell: ({ row }) => {
      const freq = row.original.occurrences?.length || 0;
      return (
        <span className="font-medium text-center pl-4">
          {freq}
        </span>
      );
    },
    sortingFn: (rowA, rowB) => {
      const freqA = rowA.original.occurrences?.length || 0;
      const freqB = rowB.original.occurrences?.length || 0;
      return freqA - freqB;
    }
  },
  {
    accessorKey: "collins",
    header: "Level",
    filterFn: (row, id, value) => {
      const collins = row.getValue(id) as number;
      return value.includes(collins);
    },
    cell: ({ row }) => {
      const stars = row.getValue("collins") as number;
      if (!stars) return <span className="text-muted-foreground text-xs">-</span>;
      return (
        <div className="flex text-yellow-500">
          {"★".repeat(stars)}
          <span className="text-muted-foreground/20">{"★".repeat(5 - stars)}</span>
        </div>
      );
    }
  },
  {
    accessorKey: "oxford",
    header: "Oxford 3000",
    filterFn: (row, id, value) => {
      const oxford = row.getValue(id) as number;
      if (value === true) return oxford === 1;
      if (value === false) return oxford !== 1;
      return true;
    },
    enableHiding: true,
    cell: ({ row }) => {
      const oxford = row.getValue("oxford") as number;
      if (oxford === 1) {
        return <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Oxford</Badge>;
      }
      return null;
    }
  },
  {
    accessorKey: "status",
    header: "Status",
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
    cell: ({ row }) => {
        const status = row.getValue("status") as string;
        let variant: "default" | "secondary" | "destructive" | "outline" = "outline";
        
        if (status === "MASTERED") variant = "default";
        if (status === "NEW") variant = "secondary";
        if (status === "LEARNING") variant = "outline";
        
        return <Badge variant={variant} className="text-xs">{status}</Badge>
    }
  },
  {
    id: "nextReview",
    header: "Next Review",
    cell: ({ row }) => {
      // Placeholder logic for next review
      // Randomly assign "Tomorrow", "In 2 days", "Due today" based on id hash or similar if no real data
      // Since we don't have real schedule data, we'll fake it for UI demo
      const status = row.getValue("status") as string;
      if (status === "MASTERED") return <span className="text-muted-foreground text-xs">In 3 days</span>;
      if (status === "NEW") return <span className="text-orange-500 text-xs font-medium">Due today</span>;
      return <span className="text-muted-foreground text-xs">Tomorrow</span>;
    }
  },
  {
    accessorKey: "tag",
    header: "Tags",
    cell: ({ row }) => {
        const tag = row.getValue("tag") as string;
        if (!tag) return null;
        return <Badge variant="secondary" className="text-xs">{tag}</Badge>
    }
  },
  {
    id: "actions",
    cell: ({ row }) => {
      return (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0">
              <span className="sr-only">Open menu</span>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Actions</DropdownMenuLabel>
            <DropdownMenuItem
              onClick={() => navigator.clipboard.writeText(row.original.text)}
            >
              Copy word
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem>View details</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    },
  },
]
