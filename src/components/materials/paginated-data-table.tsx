"use client"

import { useState, useEffect, useCallback } from "react"
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
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
import { Trash, FolderInput, Pencil, X, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search } from "lucide-react"
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
import { columns as createColumns } from "./columns"
import { useUserSettings } from "../user-settings-provider"

interface PaginatedDataTableProps {
  initialData: PaginatedMaterialResult
  folders: any[]
  folderId?: string | null
}

export function PaginatedDataTable({
  initialData,
  folders = [],
  folderId,
}: PaginatedDataTableProps) {
  const { timezone } = useUserSettings()
  const columns = createColumns(folders, timezone)
  
  const [data, setData] = useState(initialData.data)
  const [total, setTotal] = useState(initialData.total)
  const [page, setPage] = useState(initialData.page)
  const [pageSize, setPageSize] = useState(initialData.pageSize)
  const [totalPages, setTotalPages] = useState(initialData.totalPages)
  const [loading, setLoading] = useState(false)
  
  const [search, setSearch] = useState("")
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
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

  const fetchData = useCallback(async (newPage?: number) => {
    setLoading(true)
    try {
      const filters: MaterialFilters = {
        search: debouncedSearch || undefined,
        folderId: folderId,
      }
      
      const result = await getMaterialsPaginated(
        newPage ?? page,
        pageSize,
        filters,
        'title',
        'asc'
      )
      
      if ('error' in result) {
        console.error(result.error)
        return
      }
      
      setData(result.data)
      setTotal(result.total)
      setPage(result.page)
      setTotalPages(result.totalPages)
    } catch (error) {
      console.error('Failed to fetch materials:', error)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, debouncedSearch, folderId])

  useEffect(() => {
    fetchData(1)
  }, [debouncedSearch])

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    fetchData(newPage)
  }

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
    onRowSelectionChange: setRowSelection,
    state: {
      rowSelection,
    },
  })

  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedCount = selectedRows.length

  // Action States
  const [isMoveOpen, setIsMoveOpen] = useState(false)
  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [targetFolderId, setTargetFolderId] = useState<string>("unfiled")
  const [newName, setNewName] = useState("")

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
      if (selectedCount !== 1) return;
      if (!newName.trim()) return;
      
      const toastId = toast.loading("Renaming...");
      // @ts-ignore
      const id = selectedRows[0].original.id;
      const res = await renameMaterial(id, newName);
      
      if (res.success) {
          toast.success("Renamed successfully", { id: toastId });
          setIsRenameOpen(false);
          setRowSelection({});
          fetchData(page);
      } else {
          toast.error("Failed to rename", { id: toastId });
      }
  }

  function openRename() {
      if (selectedCount === 1) {
          // @ts-ignore
          setNewName(selectedRows[0].original.title);
          setIsRenameOpen(true);
      }
  }

  return (
    <div>
      {/* Search */}
      <div className="flex items-center gap-2 py-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search materials..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {selectedCount > 0 && (
          <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md mb-2 animate-in fade-in slide-in-from-top-1">
              <span className="text-sm font-medium ml-2">{selectedCount} selected</span>
              <div className="h-4 w-[1px] bg-border mx-2" />
              
              {selectedCount === 1 && (
                  <Button variant="ghost" size="sm" onClick={openRename}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Rename
                  </Button>
              )}
              
              <Button variant="ghost" size="sm" onClick={() => setIsMoveOpen(true)}>
                  <FolderInput className="h-4 w-4 mr-2" />
                  Move
              </Button>
              
              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => setIsDeleteOpen(true)}>
                  <Trash className="h-4 w-4 mr-2" />
                  Delete
              </Button>

              <div className="flex-1" />
              <Button variant="ghost" size="icon" onClick={() => setRowSelection({})}>
                  <X className="h-4 w-4" />
              </Button>
          </div>
      )}

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
          <span>{total} material(s)</span>
          <span>•</span>
          <span>Page {page} of {totalPages || 1}</span>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={pageSize.toString()}
            onValueChange={(value) => {
              setPageSize(Number(value))
              fetchData(1)
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
                <DialogTitle>Move {selectedCount} Item{selectedCount > 1 ? 's' : ''}</DialogTitle>
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
                <Button variant="outline" onClick={() => setIsMoveOpen(false)}>Cancel</Button>
                <Button onClick={handleBulkMove}>Move</Button>
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
                <Button variant="outline" onClick={() => setIsRenameOpen(false)}>Cancel</Button>
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
