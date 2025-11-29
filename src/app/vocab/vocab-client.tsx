"use client"

import { useState, useEffect, useCallback, useMemo, useTransition } from "react"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
  VisibilityState,
  RowSelectionState,
  getFilteredRowModel,
  getPaginationRowModel,
  ColumnFiltersState,
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
import { ArrowUpDown, SlidersHorizontal, Filter, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Check, CheckCircle } from "lucide-react"
import { WordDetailSheet } from "./word-detail-sheet"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getVocabPaginated, VocabFilters, PaginatedVocabResult } from "@/actions/vocab-actions"
import { updateWordsStatus } from "@/actions/word-actions"
import { useDebounce } from "@/hooks/use-debounce"
import { toast } from "sonner"

interface VocabClientProps {
  initialData: PaginatedVocabResult
  materialId?: string
  settings?: {
    vocabColumns?: string[]
    vocabSortBy?: string
    vocabShowMastered?: boolean
  }
}

export function VocabClient({ initialData, materialId, settings }: VocabClientProps) {
  const [data, setData] = useState(initialData.data || [])
  const [total, setTotal] = useState(initialData.total)
  const [stats, setStats] = useState(initialData.stats)
  const [page, setPage] = useState(initialData.page)
  const [pageSize, setPageSize] = useState(initialData.pageSize)
  const [totalPages, setTotalPages] = useState(initialData.totalPages)
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  
  // Row selection
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  
  // Filters
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [collinsFilter, setCollinsFilter] = useState<number[]>([])
  const [oxfordFilter, setOxfordFilter] = useState<boolean | undefined>(undefined)
  
  // Sorting - use local state for client-side sorting
  const [sorting, setSorting] = useState<SortingState>([])
  
  const [selectedWord, setSelectedWord] = useState<any>(null)
  
  const debouncedSearch = useDebounce(search, 300)

  // Apply settings - filter out mastered words if setting is off
  const showMastered = settings?.vocabShowMastered !== false

  // Sync state with initialData when materialId changes
  useEffect(() => {
    setData(initialData.data || [])
    setTotal(initialData.total)
    setStats(initialData.stats)
    setPage(initialData.page)
    setPageSize(initialData.pageSize)
    setTotalPages(initialData.totalPages)
    setSearch("")
    setStatusFilter([])
    setCollinsFilter([])
    setOxfordFilter(undefined)
    setRowSelection({})
  }, [materialId, initialData])

  const fetchData = useCallback(async (newPage?: number, newPageSize?: number) => {
    setLoading(true)
    try {
      const filters: VocabFilters = {
        materialId,
        search: debouncedSearch || undefined,
        status: showMastered 
          ? (statusFilter.length > 0 ? statusFilter : undefined)
          : (statusFilter.length > 0 ? statusFilter.filter(s => s !== 'MASTERED') : ['NEW', 'LEARNING']),
        collins: collinsFilter.length > 0 ? collinsFilter : undefined,
        oxford: oxfordFilter,
      }
      
      const result = await getVocabPaginated(
        newPage ?? page,
        newPageSize ?? pageSize,
        filters,
        'updated_at',
        'desc'
      )
      
      if ('error' in result) {
        console.error(result.error)
        toast.error('Failed to load vocabulary')
        return
      }
      
      setData(result.data || [])
      setTotal(result.total)
      setStats(result.stats)
      setPage(result.page)
      setPageSize(result.pageSize)
      setTotalPages(result.totalPages)
      setRowSelection({}) // Clear selection on page change
    } catch (error) {
      console.error('Failed to fetch vocab:', error)
      toast.error('Failed to load vocabulary')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, debouncedSearch, statusFilter, collinsFilter, oxfordFilter, materialId, showMastered])

  // Fetch when filters change
  useEffect(() => {
    fetchData(1) // Reset to page 1 when filters change
  }, [debouncedSearch, statusFilter, collinsFilter, oxfordFilter, showMastered])

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    fetchData(newPage)
  }

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    fetchData(1, newSize)
  }

  // Handle bulk status update
  const handleBulkStatusUpdate = async (status: string) => {
    const selectedIds = Object.keys(rowSelection).map(idx => data[parseInt(idx)]?.id).filter(Boolean)
    if (selectedIds.length === 0) return

    startTransition(async () => {
      try {
        const result = await updateWordsStatus(selectedIds, status)
        if (result?.error) {
          toast.error(result.error)
          return
        }
        toast.success(`${selectedIds.length} word(s) marked as ${status}`)
        setRowSelection({})
        fetchData(page)
      } catch (error) {
        toast.error('Failed to update word status')
      }
    })
  }

  // Get initial column visibility based on settings
  const getInitialColumnVisibility = () => {
    const visibleCols = settings?.vocabColumns || ["word", "translation", "pronunciation"]
    const visibility: Record<string, boolean> = {}
    const columnMapping: Record<string, string> = {
      word: "text",
      translation: "tag",
      definition: "pos",
      pronunciation: "phonetic",
      example: "collins"
    }
    
    vocabColumns.forEach((col: any) => {
      const colId = col.id || col.accessorKey
      const settingKey = Object.entries(columnMapping).find(([, v]) => v === colId)?.[0]
      if (settingKey) {
        visibility[colId] = visibleCols.includes(settingKey)
      } else {
        visibility[colId] = true
      }
    })
    return visibility
  }

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(getInitialColumnVisibility())

  const table = useReactTable({
    data,
    columns: vocabColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    manualPagination: true,
    pageCount: totalPages,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
    },
  })

  const selectedCount = Object.keys(rowSelection).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Filter words..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
          />
          {selectedCount > 0 && (
            <div className="flex items-center gap-2 ml-4">
              <span className="text-sm text-muted-foreground">{selectedCount} selected</span>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleBulkStatusUpdate('MASTERED')}
                disabled={isPending}
              >
                <CheckCircle className="mr-2 h-4 w-4" />
                Mark Mastered
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleBulkStatusUpdate('LEARNING')}
                disabled={isPending}
              >
                Mark Learning
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleBulkStatusUpdate('NEW')}
                disabled={isPending}
              >
                Mark New
              </Button>
            </div>
          )}
        </div>
        <div className="flex gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-dashed">
                  <Filter className="mr-2 h-4 w-4" />
                  Status
                  {statusFilter.length > 0 && (
                    <Badge variant="secondary" className="ml-2">{statusFilter.length}</Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filter by Status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {["NEW", "LEARNING", "MASTERED"].map((status) => (
                  <DropdownMenuCheckboxItem
                    key={status}
                    checked={statusFilter.includes(status)}
                    onCheckedChange={(checked) => {
                      setStatusFilter(
                        checked
                          ? [...statusFilter, status]
                          : statusFilter.filter((val) => val !== status)
                      )
                    }}
                  >
                    {status}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-dashed">
                  <Filter className="mr-2 h-4 w-4" />
                  Collins
                  {collinsFilter.length > 0 && (
                    <Badge variant="secondary" className="ml-2">{collinsFilter.length}</Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filter by Collins Level</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {[5, 4, 3, 2, 1].map((level) => (
                  <DropdownMenuCheckboxItem
                    key={level}
                    checked={collinsFilter.includes(level)}
                    onCheckedChange={(checked) => {
                      setCollinsFilter(
                        checked
                          ? [...collinsFilter, level]
                          : collinsFilter.filter((val) => val !== level)
                      )
                    }}
                  >
                    <span className="text-yellow-500 mr-2">{"★".repeat(level)}</span>
                    <span className="text-muted-foreground/30">{"★".repeat(5 - level)}</span>
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="border-dashed">
                  <Filter className="mr-2 h-4 w-4" />
                  Oxford
                  {oxfordFilter !== undefined && (
                    <Badge variant="secondary" className="ml-2">1</Badge>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Filter by Oxford 3000</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuCheckboxItem
                  checked={oxfordFilter === true}
                  onCheckedChange={(checked) => {
                    setOxfordFilter(checked ? true : undefined)
                  }}
                >
                  <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 mr-2">Oxford</Badge>
                  Only Oxford 3000
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={oxfordFilter === false}
                  onCheckedChange={(checked) => {
                    setOxfordFilter(checked ? false : undefined)
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

        <div className="rounded-md border relative">
          {loading && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center z-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
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
                  <TableCell colSpan={vocabColumns.length} className="h-24 text-center">
                    No results.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        
        {/* Pagination */}
        <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{total} word(s)</span>
            <span>•</span>
            <span>Page {page} of {totalPages || 1}</span>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={pageSize.toString()}
              onValueChange={(value) => handlePageSizeChange(Number(value))}
            >
              <SelectTrigger className="h-8 w-[70px]">
                <SelectValue placeholder={pageSize} />
              </SelectTrigger>
              <SelectContent side="top">
                {[10, 20, 30, 50, 100].map((size) => (
                  <SelectItem key={size} value={size.toString()}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handlePageChange(1)}
                disabled={page === 1 || loading}
              >
                <ChevronsLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handlePageChange(page - 1)}
                disabled={page === 1 || loading}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handlePageChange(page + 1)}
                disabled={page >= totalPages || loading}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => handlePageChange(totalPages)}
                disabled={page >= totalPages || loading}
              >
                <ChevronsRight className="h-4 w-4" />
              </Button>
            </div>
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

// Column definitions with checkbox selection
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
        onClick={(e) => e.stopPropagation()}
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
            className="pl-0"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Word
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        )
    },
    cell: ({ row }) => <span className="font-medium">{row.getValue("text")}</span>
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
          className="pl-0"
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
  },
  {
    accessorKey: "collins",
    header: "Level",
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
