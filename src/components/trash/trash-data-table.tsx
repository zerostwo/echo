"use client"

import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  RowSelectionState,
  ColumnDef,
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
import { useEffect, useMemo, useState } from "react"
import { RefreshCw, Trash2, X, ArrowUpDown } from "lucide-react"
import { toast } from "sonner"
import { restoreMaterial, permanentlyDeleteMaterial } from "@/actions/material-actions"
import { restoreSentence, permanentlyDeleteSentence } from "@/actions/sentence-actions"
import { restoreWord, permanentlyDeleteWord } from "@/actions/word-actions"
import { restoreDictionary, permanentlyDeleteDictionary } from "@/actions/dictionary-actions"
import { useRouter } from "next/navigation"
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
import { TrashItem } from "./columns"
import { useUserSettings } from "../user-settings-provider"
import { Checkbox } from "@/components/ui/checkbox"
import { formatInTimeZone } from "@/lib/time"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

interface TrashDataTableProps {
  data: TrashItem[]
}

export function TrashDataTable({
  data,
}: TrashDataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  const [typeFilter, setTypeFilter] = useState<'all' | 'material' | 'sentence' | 'word' | 'dictionary'>('all')
  const router = useRouter()
  const { timezone } = useUserSettings()

  useEffect(() => {
    setRowSelection({})
  }, [typeFilter])

  const filteredData = useMemo(() => {
    if (typeFilter === 'all') return data
    return data.filter((item) => item.type === typeFilter)
  }, [data, typeFilter])

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
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="-ml-4"
            >
              Type
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
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
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="-ml-4"
            >
              Title
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => (
          <div className="max-w-[400px] truncate font-medium" title={row.getValue("title") as string}>
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
        header: ({ column }) => {
          return (
            <Button
              variant="ghost"
              onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
              className="-ml-4"
            >
              Deleted At
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          )
        },
        cell: ({ row }) => {
            return formatInTimeZone(row.getValue("deleted_at") as string | null, tz)
        }
      },
    ]
  }, [timezone])

  const table = useReactTable({
    data: filteredData,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onRowSelectionChange: setRowSelection,
    state: {
      sorting,
      rowSelection,
    },
  })

  const emptyColSpan = table.getVisibleFlatColumns().length || 1

  const selectedRows = table.getFilteredSelectedRowModel().rows
  const selectedCount = selectedRows.length

  async function handleBulkRestore() {
    setIsRestoring(true)
    const toastId = toast.loading(`Restoring ${selectedCount} items...`)
    
    let successCount = 0
    for (const row of selectedRows) {
      const item = row.original as TrashItem
      const res = item.type === 'material'
        ? await restoreMaterial(item.id)
        : item.type === 'sentence'
          ? await restoreSentence(item.id)
          : item.type === 'dictionary'
            ? await restoreDictionary(item.id)
            : await restoreWord(item.id)
      if (res.success) successCount++
    }
    
    if (successCount > 0) {
      toast.success(`Restored ${successCount} items`, { id: toastId })
      setRowSelection({})
      router.refresh()
    } else {
      toast.error("Failed to restore items", { id: toastId })
    }
    setIsRestoring(false)
  }

  async function handleBulkDelete() {
    setIsDeleting(true)
    const toastId = toast.loading(`Permanently deleting ${selectedCount} items...`)
    
    let successCount = 0
    for (const row of selectedRows) {
      const item = row.original as TrashItem
      const res = item.type === 'material'
        ? await permanentlyDeleteMaterial(item.id)
        : item.type === 'sentence'
          ? await permanentlyDeleteSentence(item.id)
          : item.type === 'dictionary'
            ? await permanentlyDeleteDictionary(item.id)
            : await permanentlyDeleteWord(item.id)
      if ('success' in res && res.success) successCount++
    }
    
    if (successCount > 0) {
      toast.success(`Deleted ${successCount} items permanently`, { id: toastId })
      setRowSelection({})
      router.refresh()
    } else {
      toast.error("Failed to delete items", { id: toastId })
    }
    setIsDeleting(false)
    setIsDeleteDialogOpen(false)
  }

  // Context menu handlers
  const handleContextRestore = async (item: TrashItem) => {
    const toastId = toast.loading("Restoring item...")
    const res = item.type === 'material'
      ? await restoreMaterial(item.id)
      : item.type === 'sentence'
        ? await restoreSentence(item.id)
        : item.type === 'dictionary'
          ? await restoreDictionary(item.id)
          : await restoreWord(item.id)
    
    if (res.success) {
      toast.success("Item restored", { id: toastId })
      router.refresh()
    } else {
      toast.error("Failed to restore item", { id: toastId })
    }
  }

  const handleContextDelete = async (item: TrashItem) => {
    const toastId = toast.loading("Deleting item permanently...")
    const res = item.type === 'material'
      ? await permanentlyDeleteMaterial(item.id)
      : item.type === 'sentence'
        ? await permanentlyDeleteSentence(item.id)
        : item.type === 'dictionary'
          ? await permanentlyDeleteDictionary(item.id)
          : await permanentlyDeleteWord(item.id)
    
    if ('success' in res && res.success) {
      toast.success("Item deleted permanently", { id: toastId })
      router.refresh()
    } else {
      toast.error("Failed to delete item", { id: toastId })
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filter by:</span>
          <div className="flex items-center gap-2">
            {(['all', 'material', 'sentence', 'word', 'dictionary'] as const).map((type) => (
              <Button
                key={type}
                variant={typeFilter === type ? "default" : "outline"}
                size="sm"
                className="h-8"
                onClick={() => setTypeFilter(type)}
              >
                {type === 'all' ? 'All' : type.charAt(0).toUpperCase() + type.slice(1)}
              </Button>
            ))}
          </div>
        </div>
      </div>
      {selectedCount > 0 && (
        <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-md mb-2 animate-in fade-in slide-in-from-top-1">
          <span className="text-sm font-medium ml-2">{selectedCount} selected</span>
          <div className="h-4 w-[1px] bg-border mx-2" />
          
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleBulkRestore}
            disabled={isRestoring}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Restore
          </Button>
          
          <Button 
            variant="ghost" 
            size="sm" 
            className="text-red-600 hover:text-red-700 hover:bg-red-50" 
            onClick={() => setIsDeleteDialogOpen(true)}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Forever
          </Button>

          <div className="flex-1" />
          <Button variant="ghost" size="icon" onClick={() => setRowSelection({})}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="rounded-md border overflow-x-auto">
        <Table className="table-fixed w-full">
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
                        className="cursor-pointer hover:bg-muted/50"
                        >
                        {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                        ))}
                        </TableRow>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48">
                        <ContextMenuItem onClick={() => handleContextRestore(row.original)}>
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Restore
                        </ContextMenuItem>
                        <ContextMenuSeparator />
                        <ContextMenuItem 
                            onClick={() => handleContextDelete(row.original)}
                            className="text-destructive focus:text-destructive"
                        >
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete Forever
                        </ContextMenuItem>
                    </ContextMenuContent>
                </ContextMenu>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={emptyColSpan} className="h-24 text-center">
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

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedCount} item{selectedCount > 1 ? 's' : ''} permanently?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. These items will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleBulkDelete} 
              className="bg-red-600 hover:bg-red-700"
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete Forever"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
