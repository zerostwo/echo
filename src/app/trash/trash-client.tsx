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
  RotateCcw,
  FileText,
  Book,
  Type,
  Languages
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
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { useDebounce } from "@/hooks/use-debounce"
import { 
    getTrashItemsPaginated, 
    PaginatedTrashResult, 
    restoreItem,
    permanentlyDeleteItem,
    emptyTrash,
    TrashItem
} from "@/actions/trash-actions"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { formatBytes } from "@/lib/utils"
import { formatInTimeZone } from "@/lib/time"
import { useUserSettings } from "@/components/user-settings-provider"
import { HeaderPortal } from "@/components/header-portal"

interface TrashClientProps {
  initialData: PaginatedTrashResult
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

export function TrashClient({ 
  initialData,
  initialSortBy = 'deleted_at',
  initialSortOrder = 'desc'
}: TrashClientProps) {
  const { timezone, settings, updateSettings } = useUserSettings()
  const [data, setData] = useState<TrashItem[]>(initialData.data || [])
  const [total, setTotal] = useState(initialData.total)
  const [page, setPage] = useState(initialData.page)
  const [pageSize, setPageSize] = useState(initialData.pageSize)
  const [totalPages, setTotalPages] = useState(initialData.totalPages)
  const [loading, setLoading] = useState(false)
  
  // Row selection
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  
  // Search
  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 300)
  
  // Sorting
  const [sortBy, setSortBy] = useState<string>(initialSortBy)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(initialSortOrder)
  
  // Dialog states
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [isEmptyTrashOpen, setIsEmptyTrashOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TrashItem | null>(null)
  
  const router = useRouter()

  const fetchData = useCallback(async (newPage?: number, newPageSize?: number, newSortBy?: string, newSortOrder?: 'asc' | 'desc') => {
    setLoading(true)
    try {
      const result = await getTrashItemsPaginated(
        newPage ?? page,
        newPageSize ?? pageSize,
        debouncedSearch,
        newSortBy ?? sortBy,
        newSortOrder ?? sortOrder
      )
      
      if ('error' in result) {
        toast.error('Failed to load trash items')
        return
      }
      
      setData(result.data || [])
      setTotal(result.total)
      setPage(result.page)
      setPageSize(result.pageSize)
      setTotalPages(result.totalPages)
      setRowSelection({})
    } catch (error) {
      console.error('Failed to fetch trash items:', error)
      toast.error('Failed to load trash items')
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
    updateSettings({ trashPageSize: newSize })
    fetchData(1, newSize)
  }

  const handleSort = (column: string, order: 'asc' | 'desc') => {
    setSortBy(column)
    setSortOrder(order)
    updateSettings({ trashSortBy: column, trashSortOrder: order })
    fetchData(1, undefined, column, order)
  }

  const handleRestore = async (item?: TrashItem) => {
      const itemsToRestore = item ? [item] : Object.keys(rowSelection).map(idx => data[parseInt(idx)]).filter(Boolean)
      
      if (itemsToRestore.length === 0) return

      const toastId = toast.loading(`Restoring ${itemsToRestore.length} item(s)...`)
      
      let successCount = 0
      for (const item of itemsToRestore) {
          const res = await restoreItem(item.id, item.type)
          if (res.success) successCount++
      }

      if (successCount > 0) {
          toast.success(`Restored ${successCount} items`, { id: toastId })
          setRowSelection({})
          fetchData(page)
          router.refresh()
      } else {
          toast.error("Failed to restore items", { id: toastId })
      }
  }

  const handleDelete = async () => {
      setIsDeleting(true)
      const itemsToDelete = deleteTarget ? [deleteTarget] : Object.keys(rowSelection).map(idx => data[parseInt(idx)]).filter(Boolean)
      
      if (itemsToDelete.length === 0) {
          setIsDeleting(false)
          setIsDeleteOpen(false)
          setDeleteTarget(null)
          return
      }

      const toastId = toast.loading(`Permanently deleting ${itemsToDelete.length} item(s)...`)
      
      let successCount = 0
      for (const item of itemsToDelete) {
          const res = await permanentlyDeleteItem(item.id, item.type)
          if (res.success) successCount++
      }

      if (successCount > 0) {
          toast.success(`Deleted ${successCount} items permanently`, { id: toastId })
          setRowSelection({})
          fetchData(page)
          router.refresh()
      } else {
          toast.error("Failed to delete items", { id: toastId })
      }
      setIsDeleting(false)
      setIsDeleteOpen(false)
      setDeleteTarget(null)
  }

  const handleEmptyTrash = async () => {
      setIsDeleting(true)
      const toastId = toast.loading("Emptying trash...")
      
      const res = await emptyTrash()
      
      if (res.success) {
          toast.success("Trash emptied", { id: toastId })
          fetchData(1)
          router.refresh()
      } else {
          toast.error("Failed to empty trash", { id: toastId })
      }
      setIsDeleting(false)
      setIsEmptyTrashOpen(false)
  }

  const columns = useMemo<ColumnDef<TrashItem>[]>(() => {
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
      accessorKey: "type",
      header: () => (
        <SortableColumnHeader 
          column="type" 
          label="Type" 
          sortBy={sortBy} 
          sortOrder={sortOrder} 
          onSort={handleSort} 
        />
      ),
      cell: ({ row }) => {
          const type = row.original.type
          switch (type) {
              case 'material': return <FileText className="h-4 w-4 text-blue-500" />
              case 'dictionary': return <Book className="h-4 w-4 text-green-500" />
              case 'sentence': return <Type className="h-4 w-4 text-orange-500" />
              case 'word': return <Languages className="h-4 w-4 text-purple-500" />
              default: return null
          }
      }
    },
    {
      accessorKey: "title",
      header: () => (
        <SortableColumnHeader 
          column="title" 
          label="Title" 
          sortBy={sortBy} 
          sortOrder={sortOrder} 
          onSort={handleSort} 
        />
      ),
      cell: ({ row }) => (
        <div className="font-medium truncate max-w-[300px]" title={row.getValue("title")}>
            {row.getValue("title")}
        </div>
      ),
    },
    {
      accessorKey: "location",
      header: () => (
        <SortableColumnHeader 
          column="location" 
          label="Location" 
          sortBy={sortBy} 
          sortOrder={sortOrder} 
          onSort={handleSort} 
        />
      ),
      cell: ({ row }) => <div className="text-muted-foreground text-sm">{row.getValue("location")}</div>,
    },
    {
      accessorKey: "size",
      header: () => (
        <SortableColumnHeader 
          column="size" 
          label="Size" 
          sortBy={sortBy} 
          sortOrder={sortOrder} 
          onSort={handleSort} 
        />
      ),
      cell: ({ row }) => {
          const size = row.getValue("size") as string | null
          return <div className="text-muted-foreground text-sm">{size ? formatBytes(parseInt(size)) : '-'}</div>
      },
    },
    {
        accessorKey: "deleted_at",
        header: () => (
            <SortableColumnHeader 
              column="deleted_at" 
              label="Deleted At" 
              sortBy={sortBy} 
              sortOrder={sortOrder} 
              onSort={handleSort} 
            />
        ),
        cell: ({ row }) => {
            return <div className="text-muted-foreground text-sm">{formatInTimeZone(row.getValue("deleted_at"), tz)}</div>
        }
    }
  ]
  }, [sortBy, sortOrder, timezone])

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    if (!settings.trashColumns) return {}
    const visibility: VisibilityState = {}
    columns.forEach((col: any) => {
      const colId = col.id || col.accessorKey
      if (colId && !settings.trashColumns!.includes(colId)) {
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
          
          const settingsCols = settings.trashColumns
          
          const isDifferent = !settingsCols || 
              settingsCols.length !== currentVisibleCols.length ||
              !settingsCols.every(c => currentVisibleCols.includes(c))

          if (isDifferent) {
              updateSettings({ trashColumns: currentVisibleCols })
          }
      }, 1000);
      return () => clearTimeout(timer);
  }, [columnVisibility, updateSettings, settings.trashColumns, columns])

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
      <HeaderPortal>
        <Button 
            variant="outline" 
            className="text-destructive hover:text-destructive"
            onClick={() => setIsEmptyTrashOpen(true)}
        >
            <Trash2 className="mr-2 h-4 w-4" />
            Empty Trash
        </Button>
      </HeaderPortal>

      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
            <Input
            placeholder="Search trash..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm"
            />
            {selectedCount > 0 && (
                <>
                    <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => handleRestore()}
                    >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Restore ({selectedCount})
                    </Button>
                    <Button 
                        variant="destructive" 
                        size="sm" 
                        onClick={() => setIsDeleteOpen(true)}
                    >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete ({selectedCount})
                    </Button>
                </>
            )}
        </div>
        
        <div className="flex items-center gap-2">
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
                        <ContextMenuItem onClick={() => handleRestore(row.original)}>
                            <RotateCcw className="mr-2 h-4 w-4" />
                            Restore
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem 
                            onClick={() => {
                                setDeleteTarget(row.original)
                                setIsDeleteOpen(true)
                            }}
                            className="text-destructive focus:text-destructive"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Permanently
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
                  No trash items found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between py-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{total} item(s)</span>
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

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently delete?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the selected {deleteTarget || selectedCount === 1 ? 'item' : 'items'} and remove them from our servers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => {
                setIsDeleteOpen(false)
                setDeleteTarget(null)
            }}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete Permanently
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isEmptyTrashOpen} onOpenChange={setIsEmptyTrashOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Empty Trash?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete ALL items in the trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleEmptyTrash} className="bg-red-600 hover:bg-red-700">
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Empty Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
