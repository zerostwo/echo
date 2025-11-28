"use client"

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
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
import { useState } from "react"
import { Trash, FolderInput, Pencil, X } from "lucide-react"
import { toast } from "sonner"
import { deleteMaterial, moveMaterial, renameMaterial } from "@/actions/material-actions"
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

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[]
  data: TData[]
  folders?: any[]
}

export function DataTable<TData, TValue>({
  columns,
  data,
  folders = [],
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const router = useRouter()

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
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
          router.refresh();
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
          router.refresh();
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
          router.refresh();
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
            Page {table.getState().pagination.pageIndex + 1} of{" "}
            {table.getPageCount()}
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
