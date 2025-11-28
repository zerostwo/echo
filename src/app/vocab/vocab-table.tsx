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
import { ArrowUpDown, SlidersHorizontal, Filter } from "lucide-react"
import { WordDetailSheet } from "./word-detail-sheet"
import { Badge } from "@/components/ui/badge"
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
  const [selectedWord, setSelectedWord] = useState<any>(null)

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
    // By default, show all columns
    columns.forEach((col: any) => {
      const colId = col.id || col.accessorKey
      const settingKey = Object.entries(columnMapping).find(([, v]) => v === colId)?.[0]
      if (settingKey) {
        visibility[colId] = visibleCols.includes(settingKey)
      } else {
        visibility[colId] = true // Show columns not in mapping
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
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
    },
  })

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
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setSelectedWord(row.original)}
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
            {table.getFilteredRowModel().rows.length} word(s)
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
    cell: ({ row }) => {
      const phonetic = row.getValue("phonetic") as string | null;
      if (!phonetic) return <span className="text-muted-foreground">-</span>;
      return (
        <span className="inline-flex items-center rounded-full bg-muted px-2 py-1 font-serif text-sm tracking-tight text-foreground/80">
          /{phonetic}/
        </span>
      );
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
    accessorKey: "frequency",
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
      const freq = (row.getValue("frequency") as number) ?? 0;
      return (
        <span className="font-medium text-center">
          {freq}
        </span>
      );
    },
    sortingFn: (rowA, rowB) => {
      const freqA = (rowA.getValue("frequency") as number) ?? 0;
      const freqB = (rowB.getValue("frequency") as number) ?? 0;
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
]
