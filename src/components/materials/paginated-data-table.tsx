"use client"

import { useState, useEffect, useCallback, useMemo, useTransition } from "react"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  VisibilityState,
  RowSelectionState,
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
import { 
  Trash, 
  FolderInput, 
  Pencil, 
  X, 
  Loader2, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  Search,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  SlidersHorizontal,
  Trash2
} from "lucide-react"
import { toast } from "sonner"
import { deleteMaterial, moveMaterial, renameMaterial, getMaterialsPaginated, MaterialFilters, PaginatedMaterialResult } from "@/actions/material-actions"
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog"
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
import { Input } from "@/components/ui/input"
import { useRouter } from "next/navigation"
import { useDebounce } from "@/hooks/use-debounce"
import { useUserSettings } from "../user-settings-provider"
import { Checkbox } from "@/components/ui/checkbox"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { formatInTimeZone } from "@/lib/time"
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

interface PaginatedDataTableProps {
  initialData: PaginatedMaterialResult
  folders: any[]
  folderId?: string | null
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

function getDisplayName(filename: string) {
    return filename.replace(/\.[^/.]+$/, "")
}

export function PaginatedDataTable({
  initialData,
  folders = [],
  folderId,
  initialSortBy = 'title',
  initialSortOrder = 'asc'
}: PaginatedDataTableProps) {
  const { timezone, settings, updateSettings } = useUserSettings()
  
  const [data, setData] = useState(initialData.data)
  const [total, setTotal] = useState(initialData.total)
  const [page, setPage] = useState(initialData.page)
  const [pageSize, setPageSize] = useState(initialData.pageSize)
  const [totalPages, setTotalPages] = useState(initialData.totalPages)
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  
  const [search, setSearch] = useState("")
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [sorting, setSorting] = useState<SortingState>([])

  
  // Server-side sorting state
  const [sortBy, setSortBy] = useState<string>(initialSortBy)
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(initialSortOrder)

  const router = useRouter()
  const debouncedSearch = useDebounce(search, 300)

  // Sync state with initialData when folderId changes
  useEffect(() => {
    setData(initialData.data)
    setTotal(initialData.total)
    setPage(initialData.page)
    setTotalPages(initialData.totalPages)
    setSearch("")
    setRowSelection({})
  }, [folderId, initialData])



  const fetchData = useCallback(async (newPage?: number, newPageSize?: number, newSortBy?: string, newSortOrder?: 'asc' | 'desc') => {
    setLoading(true)
    try {
      const filters: MaterialFilters = {
        search: debouncedSearch || undefined,
        folderId: folderId,
      }
      
      const result = await getMaterialsPaginated(
        newPage ?? page,
        newPageSize ?? pageSize,
        filters,
        newSortBy ?? sortBy,
        newSortOrder ?? sortOrder
      )
      
      if ('error' in result) {
        console.error(result.error)
        return
      }
      
      setData(result.data)
      setTotal(result.total)
      setPage(result.page)
      setPageSize(result.pageSize)
      setTotalPages(result.totalPages)
    } catch (error) {
      console.error('Failed to fetch materials:', error)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, debouncedSearch, folderId, sortBy, sortOrder])

  useEffect(() => {
    fetchData(1)
  }, [debouncedSearch])

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    fetchData(newPage)
  }

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    updateSettings({ materialsPageSize: newSize })
    fetchData(1, newSize)
  }

  const handleSort = (column: string, order: 'asc' | 'desc') => {
    setSortBy(column)
    setSortOrder(order)
    updateSettings({ materialsSortBy: column, materialsSortOrder: order })
    fetchData(1, undefined, column, order)
  }

  // Action States
  const [isMoveOpen, setIsMoveOpen] = useState(false)
  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [targetFolderId, setTargetFolderId] = useState<string>("unfiled")
  const [newName, setNewName] = useState("")
  const [selectedMaterial, setSelectedMaterial] = useState<any>(null)

  async function handleBulkDelete() {
      setIsDeleteOpen(false);
      const toastId = toast.loading(`Deleting ${selectedCount} items...`);
      let successCount = 0;
      for (const row of selectedRows) {
          // @ts-ignore
          const res = await deleteMaterial(row.original.id);
          if (res.success) successCount++;
      }
      
      if (successCount > 0) {
          toast.success(`Deleted ${successCount} items`, { id: toastId });
          setRowSelection({});
          fetchData(page);
      } else {
          toast.error("Failed to delete items", { id: toastId });
      }
  }

  async function handleBulkMove() {
      const targetId = targetFolderId === "unfiled" ? null : targetFolderId;
      const toastId = toast.loading(`Moving ${selectedCount} items...`);
      
      let successCount = 0;
      for (const row of selectedRows) {
          // @ts-ignore
          const res = await moveMaterial(row.original.id, targetId);
          if (res.success) successCount++;
      }

      if (successCount > 0) {
          toast.success(`Moved ${successCount} items`, { id: toastId });
          setRowSelection({});
          setIsMoveOpen(false);
          fetchData(page);
      } else {
          toast.error("Failed to move items", { id: toastId });
      }
  }

  async function handleRename() {
      if (!selectedMaterial && selectedCount !== 1) return;
      if (!newName.trim()) return;
      
      const toastId = toast.loading("Renaming...");
      // @ts-ignore
      const id = selectedMaterial ? selectedMaterial.id : selectedRows[0].original.id;
      const res = await renameMaterial(id, newName);
      
      if (res.success) {
          toast.success("Renamed successfully", { id: toastId });
          setIsRenameOpen(false);
          setRowSelection({});
          setSelectedMaterial(null);
          fetchData(page);
      } else {
          toast.error("Failed to rename", { id: toastId });
      }
  }

  function openRename(material?: any) {
      const target = material || (selectedCount === 1 ? selectedRows[0].original : null);
      if (target) {
          setSelectedMaterial(target);
          setNewName(target.title);
          setIsRenameOpen(true);
      }
  }

  // Context menu actions
  const handleContextDelete = async (id: string) => {
    const toastId = toast.loading("Deleting material...");
    const res = await deleteMaterial(id);
    if (res.success) {
        toast.success("Material deleted", { id: toastId });
        fetchData(page);
    } else {
        toast.error("Failed to delete material", { id: toastId });
    }
  }

  const handleContextMove = (material: any) => {
      setSelectedMaterial(material);
      // Pre-select current folder if possible, or default to unfiled
      setTargetFolderId(material.folder_id || "unfiled");
      setIsMoveOpen(true);
  }

  const columns = useMemo<ColumnDef<any>[]>(() => {
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
        cell: ({ row }) => {
            const displayName = getDisplayName(row.getValue("title"))
            return (
                <Link href={`/materials/${row.original.id}`} className="font-medium hover:underline">
                    {displayName}
                </Link>
            )
        }
      },
      {
        accessorKey: "_count.sentences",
        header: () => (
          <SortableColumnHeader 
            column="sentences" 
            label="Sentences" 
            sortBy={sortBy} 
            sortOrder={sortOrder} 
            onSort={handleSort} 
          />
        ),
        cell: ({ row }) => {
            return <div className="pl-4">{row.original.stats?.totalSentences || 0}</div>
        }
      },
      {
        id: "vocab",
        accessorFn: (row) => row.stats.vocabCount,
        header: () => (
          <SortableColumnHeader 
            column="vocab" 
            label="Words" 
            sortBy={sortBy} 
            sortOrder={sortOrder} 
            onSort={handleSort} 
          />
        ),
        cell: ({ row }) => {
            const count = row.original.stats.vocabCount
            return (
                <Link href={`/words?materialId=${row.original.id}`} className="text-sm font-medium text-blue-600 hover:underline pl-4 block">
                    {count}
                </Link>
            )
        }
      },
      {
        id: "progress",
        accessorFn: (row) => row.stats.practicedCount,
        header: () => (
          <SortableColumnHeader 
            column="progress" 
            label="Progress" 
            sortBy={sortBy} 
            sortOrder={sortOrder} 
            onSort={handleSort} 
          />
        ),
        cell: ({ row }) => {
            const stats = row.original.stats
            const progress = stats.totalSentences > 0 ? (stats.practicedCount / stats.totalSentences) * 100 : 0
            
            return (
                <div className="flex items-center gap-2 w-[100px]">
                    <Progress value={progress} className="h-2" />
                    <span className="text-xs text-muted-foreground">{Math.round(progress)}%</span>
                </div>
            )
        }
      },
      {
        id: "score",
        accessorFn: (row) => row.stats.avgScore,
        header: () => (
          <SortableColumnHeader 
            column="score" 
            label="Score" 
            sortBy={sortBy} 
            sortOrder={sortOrder} 
            onSort={handleSort} 
          />
        ),
        cell: ({ row }) => {
            const stats = row.original.stats
            if (stats.practicedCount === 0) return <span className="text-muted-foreground pl-4">-</span>
            return (
                <span className={`pl-4 ${stats.avgScore >= 80 ? "text-green-600 font-medium" : "text-amber-600 font-medium"}`}>
                    {stats.avgScore}%
                </span>
            )
        }
      },
      {
        id: "attempts",
        accessorFn: (row) => row.stats.attempts,
        header: () => (
          <SortableColumnHeader 
            column="attempts" 
            label="Attempts" 
            sortBy={sortBy} 
            sortOrder={sortOrder} 
            onSort={handleSort} 
          />
        ),
        cell: ({ row }) => {
            const stats = row.original.stats
            if (stats.practicedCount === 0) return <span className="text-muted-foreground pl-4">-</span>
            return <span className="pl-4">{stats.attempts}</span>
        }
      },
      {
        id: "time",
        accessorFn: (row) => row.stats.duration,
        header: () => (
          <SortableColumnHeader 
            column="time" 
            label="Time" 
            sortBy={sortBy} 
            sortOrder={sortOrder} 
            onSort={handleSort} 
          />
        ),
        cell: ({ row }) => {
            const stats = row.original.stats
            if (stats.practicedCount === 0) return <span className="text-muted-foreground pl-4">-</span>
            const durationMins = Math.round(stats.duration / 60)
            return <span className="pl-4">{durationMins}m</span>
        }
      },
      {
        accessorKey: "created_at",
        header: () => (
          <SortableColumnHeader 
            column="created_at" 
            label="Uploaded" 
            sortBy={sortBy} 
            sortOrder={sortOrder} 
            onSort={handleSort} 
          />
        ),
        cell: ({ row }) => {
            return formatInTimeZone(row.getValue("created_at"), tz)
        }
      }
    ]
  }, [sortBy, sortOrder, timezone])

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(() => {
    if (!Array.isArray(settings.materialsColumns)) return {}
    const visibility: VisibilityState = {}
    columns.forEach((col: any) => {
      const colId = col.id || col.accessorKey
      if (colId && !settings.materialsColumns!.includes(colId)) {
        visibility[colId] = false
      }
    })
    return visibility
  })

  // Save column visibility when it changes
  useEffect(() => {
      const timer = setTimeout(() => {
          const currentVisibleCols = columns
              .map((col: any) => col.id || col.accessorKey)
              .filter(id => columnVisibility[id] !== false)
          
          const settingsCols = settings.materialsColumns
          
          const isDifferent = !settingsCols || 
              settingsCols.length !== currentVisibleCols.length ||
              !settingsCols.every(c => currentVisibleCols.includes(c))

          if (isDifferent) {
              updateSettings({ materialsColumns: currentVisibleCols })
          }
      }, 1000);
      return () => clearTimeout(timer);
  }, [columnVisibility, updateSettings, settings.materialsColumns, columns])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
    onRowSelectionChange: setRowSelection,
    onSortingChange: setSorting,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      rowSelection,
      sorting,
      columnVisibility,
    },
  })

  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedCount = selectedRows.length

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
            <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
                placeholder="Search material..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-9"
            />
            </div>
            {selectedCount > 0 && (
                <div className="flex items-center gap-2 ml-4">
                    <span className="text-sm text-muted-foreground whitespace-nowrap h-9 flex items-center">{selectedCount} selected</span>
                    
                    {selectedCount === 1 && (
                        <Button variant="outline" size="sm" onClick={() => openRename()} className="h-9">
                            <Pencil className="h-4 w-4 mr-2" />
                            Rename
                        </Button>
                    )}
                    
                    <Button variant="outline" size="sm" onClick={() => setIsMoveOpen(true)} className="h-9">
                        <FolderInput className="h-4 w-4 mr-2" />
                        Move
                    </Button>
                    
                    <Button variant="outline" size="sm" className="text-destructive hover:text-destructive h-9" onClick={() => setIsDeleteOpen(true)}>
                        <Trash className="h-4 w-4 mr-2" />
                        Delete
                    </Button>

                    <Button variant="ghost" size="icon" onClick={() => setRowSelection({})} className="h-9 w-9">
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            )}
        </div>
        <div className="flex gap-2 h-9">
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-9">
                    <SlidersHorizontal className="mr-2 h-4 w-4" />
                    View
                </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
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
                        onCheckedChange={(value) => column.toggleVisibility(!!value)}
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
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                        ))}
                        </TableRow>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48">
                        <ContextMenuItem onClick={() => openRename(row.original)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            Rename
                        </ContextMenuItem>
                        <ContextMenuItem onClick={() => handleContextMove(row.original)}>
                            <FolderInput className="mr-2 h-4 w-4" />
                            Move to Folder
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
                <TableCell colSpan={columns.length} className="h-24 text-center">
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
          <span>{total} Material</span>
          <span>•</span>
          <span>Page {page} of {totalPages || 1}</span>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => {
              setPageSize(Number(value))
              fetchData(1, Number(value))
            }}
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

      {/* Dialogs */}
      <Dialog open={isMoveOpen} onOpenChange={setIsMoveOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Move {selectedMaterial ? 'Material' : `${selectedCount} Items`}</DialogTitle>
            </DialogHeader>
            <div className="py-4">
                <Select value={targetFolderId} onValueChange={setTargetFolderId}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select folder" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="unfiled">Unfiled</SelectItem>
                        {folders.map((folder) => (
                            <SelectItem key={folder.id} value={folder.id}>
                                {folder.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => {
                    setIsMoveOpen(false)
                    setSelectedMaterial(null)
                }}>Cancel</Button>
                <Button onClick={() => {
                    if (selectedMaterial) {
                        // Single move via context menu
                        startTransition(async () => {
                            const targetId = targetFolderId === "unfiled" ? null : targetFolderId;
                            const res = await moveMaterial(selectedMaterial.id, targetId);
                            if (res.success) {
                                toast.success("Moved successfully");
                                setIsMoveOpen(false);
                                setSelectedMaterial(null);
                                fetchData(page);
                            } else {
                                toast.error("Failed to move");
                            }
                        });
                    } else {
                        // Bulk move
                        handleBulkMove();
                    }
                }}>Move</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Rename Material</DialogTitle>
            </DialogHeader>
            <div className="py-4">
                <Input 
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="New title"
                />
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => {
                    setIsRenameOpen(false)
                    setSelectedMaterial(null)
                }}>Cancel</Button>
                <Button onClick={handleRename}>Save</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
            <AlertDialogHeader>
                <AlertDialogTitle>Delete {selectedCount} item{selectedCount > 1 ? 's' : ''}?</AlertDialogTitle>
                <AlertDialogDescription>
                    This will move the selected item{selectedCount > 1 ? 's' : ''} to trash. You can restore them later from the trash.
                </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleBulkDelete} className="bg-red-600 hover:bg-red-700">
                    Delete
                </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
