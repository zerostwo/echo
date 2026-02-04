"use client"

import { useState, useEffect, useCallback, useMemo, useTransition } from "react"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  RowSelectionState,
  SortingState,
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
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { 
  Loader2, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Trash2, 
  ChevronDown, 
  ArrowUp, 
  ArrowDown,
  SlidersHorizontal,
  Pencil,
  Play
} from "lucide-react"
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
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import { Checkbox } from "@/components/ui/checkbox"
import { Progress } from "@/components/ui/progress"
import Link from "next/link"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { useDebounce } from "@/hooks/use-debounce"
import { 
    getDictionariesPaginated, 
    PaginatedDictionaryResult, 
    deleteDictionary,
    updateDictionary,
    DictionaryFilters 
} from "@/actions/dictionary-actions"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useUserSettings } from "@/components/user-settings-provider"

interface DictionariesClientProps {
  initialData: PaginatedDictionaryResult
  initialSortBy?: string
  initialSortOrder?: 'asc' | 'desc'
}

// Column header with sort dropdown
function SortableColumnHeader({ 
  column, 
  label, 
  sortBy, 
  sortOrder, 
  onSort 
}: { 
  column: string
  label: string
  sortBy: string
  sortOrder: 'asc' | 'desc'
  onSort: (column: string, order: 'asc' | 'desc') => void
}) {
  const isActive = sortBy === column
  
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 px-2 -ml-2 font-medium text-muted-foreground hover:text-foreground">
          {label}
          <ChevronDown className="ml-1 h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        <DropdownMenuItem onClick={() => onSort(column, 'asc')} className="gap-2">
          <ArrowUp className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="whitespace-nowrap">Sort Ascending</span>
          {isActive && sortOrder === 'asc' && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => onSort(column, 'desc')} className="gap-2">
          <ArrowDown className="h-3.5 w-3.5 flex-shrink-0" />
          <span className="whitespace-nowrap">Sort Descending</span>
          {isActive && sortOrder === 'desc' && <span className="ml-auto text-primary">✓</span>}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DictionariesClient({ 
  initialData,
  initialSortBy = 'createdAt',
  initialSortOrder = 'desc'
}: DictionariesClientProps) {
  const { settings, updateSettings } = useUserSettings()
  const [data, setData] = useState(initialData.data || [])
  const [total, setTotal] = useState(initialData.total)
  const [page, setPage] = useState(initialData.page)
  const [pageSize, setPageSize] = useState(initialData.pageSize)
  const [totalPages, setTotalPages] = useState(initialData.totalPages)
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  
  // Row selection
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  
  // Search
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 300)
  
  // Sorting
  const [sortBy, setSortBy] = useState<string>(initialSortBy)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(initialSortOrder)
  
  // Delete dialog state
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  // Rename dialog state
  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [newName, setNewName] = useState("")
  
  const router = useRouter()

  useEffect(() => {
    setData(initialData.data || [])
    setTotal(initialData.total)
    setPage(initialData.page)
    setPageSize(initialData.pageSize)
    setTotalPages(initialData.totalPages)
    setRowSelection({})
  }, [initialData])

  const fetchData = useCallback(async (newPage?: number, newPageSize?: number, newSortBy?: string, newSortOrder?: 'asc' | 'desc') => {
    setLoading(true)
    try {
      const filters: DictionaryFilters = {
        search: debouncedSearch || undefined,
      }
      
      const result = await getDictionariesPaginated(
        newPage ?? page,
        newPageSize ?? pageSize,
        filters,
        newSortBy ?? sortBy,
        newSortOrder ?? sortOrder
      )
      
      if ('error' in result) {
        toast.error('Failed to load dictionaries')
        return
      }
      
      setData(result.data || [])
      setTotal(result.total)
      setPage(result.page)
      setPageSize(result.pageSize)
      setTotalPages(result.totalPages)
      setRowSelection({})
    } catch (error) {
      console.error('Failed to fetch dictionaries:', error)
      toast.error('Failed to load dictionaries')
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, debouncedSearch, sortBy, sortOrder])

  // Fetch when search changes
  useEffect(() => {
    fetchData(1)
  }, [debouncedSearch])

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    fetchData(newPage)
  }

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    updateSettings({ dictionaryPageSize: newSize })
    fetchData(1, newSize)
  }

  const handleSort = (column: string, order: 'asc' | 'desc') => {
    setSortBy(column)
    setSortOrder(order)
    updateSettings({ dictionarySortBy: column, dictionarySortOrder: order })
    fetchData(1, undefined, column, order)
  }

  const handleBulkDelete = async () => {
    setIsDeleting(true)
    
    // If deleteTargetId is set, we are deleting a single item via context menu
    const idsToDelete = deleteTargetId 
        ? [deleteTargetId] 
        : Object.keys(rowSelection).map(idx => data[parseInt(idx)]?.id).filter(Boolean)
    
    if (idsToDelete.length === 0) {
        setIsDeleting(false)
        setIsDeleteOpen(false)
        setDeleteTargetId(null)
        return
    }

    const toastId = toast.loading(`Moving ${idsToDelete.length} dictionaries to trash...`)
    
    let successCount = 0
    for (const id of idsToDelete) {
      const res = await deleteDictionary(id)
      if (res.success) successCount++
    }
    
    if (successCount > 0) {
      toast.success(`Moved ${successCount} dictionaries to trash`, { id: toastId })
      setRowSelection({})
      fetchData(page)
      router.refresh() // Refresh server components if needed
    } else {
      toast.error("Failed to delete dictionaries", { id: toastId })
    }
    setIsDeleting(false)
    setIsDeleteOpen(false)
    setDeleteTargetId(null)
  }

  const handleContextDelete = (id: string) => {
      setDeleteTargetId(id)
      setIsDeleteOpen(true)
  }

  const handleRename = async () => {
      if (!renameId || !newName.trim()) return

      const toastId = toast.loading("Renaming dictionary...")
      try {
          const res = await updateDictionary(renameId, { name: newName })
          if (res) {
              toast.success("Dictionary renamed", { id: toastId })
              fetchData(page)
              setIsRenameOpen(false)
              setRenameId(null)
              setNewName("")
              router.refresh()
          } else {
              toast.error("Failed to rename dictionary", { id: toastId })
          }
      } catch (error) {
          toast.error("Failed to rename dictionary", { id: toastId })
      }
  }

  const openRename = (dictionary: any) => {
      setRenameId(dictionary.id)
      setNewName(dictionary.name)
      setIsRenameOpen(true)
  }

  const columns = useMemo<ColumnDef<any>[]>(() => [
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
      accessorKey: "name",
      header: () => (
        <SortableColumnHeader 
          column="name" 
          label="Name" 
          sortBy={sortBy} 
          sortOrder={sortOrder} 
          onSort={handleSort} 
        />
      ),
      cell: ({ row }) => (
        <Link 
            href={`/dictionaries/${row.original.id}`}
            className="font-medium hover:underline"
        >
            {row.getValue("name")}
        </Link>
      ),
    },
    {
      accessorKey: "wordCount",
      header: () => (
        <SortableColumnHeader 
          column="wordCount" 
          label="Words" 
          sortBy={sortBy} 
          sortOrder={sortOrder} 
          onSort={handleSort} 
        />
      ),
      cell: ({ row }) => <div className="pl-4">{row.getValue("wordCount")}</div>,
    },
    {
      accessorKey: "learningProgress",
      header: () => (
        <SortableColumnHeader 
          column="learningProgress" 
          label="Progress" 
          sortBy={sortBy} 
          sortOrder={sortOrder} 
          onSort={handleSort} 
        />
      ),
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
      header: () => (
        <SortableColumnHeader 
          column="accuracy" 
          label="Accuracy" 
          sortBy={sortBy} 
          sortOrder={sortOrder} 
          onSort={handleSort} 
        />
      ),
      cell: ({ row }) => {
          const accuracy = row.getValue("accuracy") as number
          return (
              <div className="font-medium">
                  {Math.round(accuracy)}%
              </div>
          )
      },
    },
    {
        accessorKey: "createdAt",
        header: () => (
            <SortableColumnHeader 
              column="createdAt" 
              label="Created" 
              sortBy={sortBy} 
              sortOrder={sortOrder} 
              onSort={handleSort} 
            />
        ),
        cell: ({ row }) => {
            return <div className="text-muted-foreground text-sm">{new Date(row.getValue("createdAt")).toLocaleDateString()}</div>
        }
    }
  ], [sortBy, sortOrder])

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    if (!Array.isArray(settings.dictionaryColumns)) return {}
    const visibility: VisibilityState = {}
    columns.forEach((col: any) => {
      const colId = col.id || col.accessorKey
      if (colId && !settings.dictionaryColumns!.includes(colId)) {
        visibility[colId] = false
      }
    })
    return visibility
  })

  // Save column visibility
  useEffect(() => {
      const timer = setTimeout(() => {
          const currentVisibleCols = columns
              .map((col: any) => col.id || col.accessorKey)
              .filter(id => columnVisibility[id] !== false)
          
          const settingsCols = settings.dictionaryColumns
          
          const isDifferent = !settingsCols || 
              settingsCols.length !== currentVisibleCols.length ||
              !settingsCols.every(c => currentVisibleCols.includes(c))

          if (isDifferent) {
              updateSettings({ dictionaryColumns: currentVisibleCols })
          }
      }, 1000);
      return () => clearTimeout(timer);
  }, [columnVisibility, updateSettings, settings.dictionaryColumns, columns])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    manualPagination: true,
    pageCount: totalPages,
    state: {
      rowSelection,
      columnVisibility,
    },
  })

  const selectedCount = Object.keys(rowSelection).length

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between py-4">
        <Input
          placeholder="Filter dictionaries..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        
        <div className="flex items-center gap-2">
            {selectedCount > 0 && (
                <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={() => setIsDeleteOpen(true)}
                >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete ({selectedCount})
                </Button>
            )}
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                <Button variant="outline" className="ml-auto">
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    View
                </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
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
                <ContextMenu key={row.id}>
                    <ContextMenuTrigger asChild>
                        <TableRow
                        data-state={row.getIsSelected() && "selected"}
                        className="cursor-pointer hover:bg-muted/50 h-12"
                        >
                        {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                            {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                            )}
                            </TableCell>
                        ))}
                        </TableRow>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48">
                        <ContextMenuItem asChild>
                            <Link href={`/study/words?dictionaryId=${row.original.id}`}>
                                <Play className="mr-2 h-4 w-4" />
                                Start Learning
                            </Link>
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => openRename(row.original)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Rename
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem 
                            onClick={() => handleContextDelete(row.original.id)}
                            className="text-destructive focus:text-destructive"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                        </ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{total} dictionary(s)</span>
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
                {[10, 20, 30, 50].map((size) => (
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

      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Rename Dictionary</DialogTitle>
            </DialogHeader>
            <div className="py-4">
                <Input 
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="New name"
                />
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => {
                    setIsRenameOpen(false)
                    setRenameId(null)
                }}>Cancel</Button>
                <Button onClick={handleRename}>Save</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the selected dictionar{deleteTargetId || selectedCount === 1 ? 'y' : 'ies'} to trash. You can restore them later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
                setIsDeleteOpen(false)
                setDeleteTargetId(null)
            }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-700">
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
