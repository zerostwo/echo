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
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Check, Loader2, PenSquare, PlayCircle, RotateCcw, Trash2, X } from "lucide-react"
import Link from "next/link"
import { useMemo, useRef, useState, type SetStateAction } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { updateSentence, deleteSentence, restoreSentenceContent } from "@/actions/sentence-actions"
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

type SentenceRow = {
  id: string
  order: number
  startTime: number
  endTime: number
  content: string
  originalContent?: string
  editedContent?: string | null
  materialId: string
  practiceAttempts?: number
  practiceScore?: number | null
}

interface SentencesTableProps {
  data: SentenceRow[]
}

function formatTime(seconds: number) {
    if (!Number.isFinite(seconds)) return "-:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

type DraftMap = Record<string, { startTime: string; endTime: string; content: string }>

export function SentencesTable({ data }: SentencesTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [drafts, _setDrafts] = useState<DraftMap>({})
  const draftsRef = useRef(drafts)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const router = useRouter()

  const setDrafts = (updater: SetStateAction<DraftMap>) => {
    _setDrafts(prev => {
      const next = typeof updater === "function" ? (updater as (prev: typeof drafts) => typeof drafts)(prev) : updater
      draftsRef.current = next
      return next
    })
  }

  const startEdit = (row: SentenceRow) => {
    setEditingId(row.id)
    setDrafts(prev => ({
      ...prev,
      [row.id]: {
        startTime: row.startTime.toString(),
        endTime: row.endTime.toString(),
        content: row.content,
      }
    }))
  }

  const updateDraft = (id: string, key: 'startTime' | 'endTime' | 'content', value: string) => {
    const emptyDraft = { startTime: '', endTime: '', content: '' }
    setDrafts(prev => ({
      ...prev,
      [id]: {
        ...(prev[id] ?? emptyDraft),
        [key]: value,
      }
    }))
  }

  const handleSave = async (row: SentenceRow) => {
    // Use ref to avoid stale closure issues
    const currentDrafts = draftsRef.current
    const draft = currentDrafts[row.id] || { startTime: row.startTime.toString(), endTime: row.endTime.toString(), content: row.content }
    setSavingId(row.id)
    const parsedStart = parseFloat(draft.startTime)
    const parsedEnd = parseFloat(draft.endTime)
    const start = Number.isFinite(parsedStart) ? parsedStart : row.startTime
    const end = Number.isFinite(parsedEnd) ? parsedEnd : row.endTime

    try {
      const res = await updateSentence(row.id, { 
        content: draft.content, 
        startTime: start, 
        endTime: end, 
        order: row.order 
      })

      if (res?.error) {
        toast.error(res.error)
        return
      }

      // Clear the draft for this sentence
      setDrafts(prev => {
        const newDrafts = { ...prev }
        delete newDrafts[row.id]
        return newDrafts
      })

      toast.success("Sentence updated")
      setEditingId(null)
      router.refresh()
    } catch (e) {
      console.error(e)
      toast.error("Failed to update sentence")
    } finally {
      setSavingId(null)
    }
  }

  const handleRestoreOriginal = async (row: SentenceRow) => {
    setRestoringId(row.id)
    try {
      const res = await restoreSentenceContent(row.id)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success("Restored original sentence")
      router.refresh()
    } catch (e) {
      console.error(e)
      toast.error("Failed to restore original sentence")
    } finally {
      setRestoringId(null)
    }
  }

  const handleDelete = async (row: SentenceRow) => {
    setConfirmingDeleteId(null)
    setDeletingId(row.id)
    try {
      const res = await deleteSentence(row.id)

      if (res?.error) {
        toast.error(res.error)
        return
      }

      toast.success("Sentence moved to trash")
      if (editingId === row.id) setEditingId(null)
      router.refresh()
    } catch (e) {
      console.error(e)
      toast.error("Failed to delete sentence")
    } finally {
      setDeletingId(null)
    }
  }

  const columns = useMemo<ColumnDef<SentenceRow>[]>(() => [
    {
      accessorKey: "order",
      header: "#",
      cell: ({ row }) => <span className="text-muted-foreground font-mono text-xs">#{row.index + 1}</span>,
      size: 40,
    },
    {
      id: "time",
      header: "Time",
      cell: ({ row }) => {
        const isEditing = editingId === row.original.id
        const draft = draftsRef.current[row.original.id]
        return isEditing ? (
          <div className="flex flex-col gap-1">
            <Input
              value={draft?.startTime ?? row.original.startTime.toString()}
              onChange={(e) => updateDraft(row.original.id, 'startTime', e.target.value)}
              type="text"
              inputMode="decimal"
              step="0.1"
              className="h-8"
            />
            <Input
              value={draft?.endTime ?? row.original.endTime.toString()}
              onChange={(e) => updateDraft(row.original.id, 'endTime', e.target.value)}
              type="text"
              inputMode="decimal"
              step="0.1"
              className="h-8"
            />
          </div>
        ) : (
          <span className="text-xs font-medium bg-secondary px-2 py-1 rounded whitespace-nowrap">
              {formatTime(row.original.startTime)} - {formatTime(row.original.endTime)}
          </span>
        )
      },
      size: 140,
    },
    {
      id: "content",
      header: "Content",
      cell: ({ row }) => {
        const isEditing = editingId === row.original.id
        const draft = draftsRef.current[row.original.id]
        const currentContent = row.original.editedContent ?? row.original.content
        const originalContent = row.original.originalContent ?? row.original.content
        return isEditing ? (
          <div className="space-y-2">
            <Textarea
              value={draft?.content ?? row.original.content}
              onChange={(e) => updateDraft(row.original.id, 'content', e.target.value)}
              className="min-h-[90px]"
            />
            {row.original.editedContent && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => updateDraft(row.original.id, 'content', originalContent)}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                Use original text
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2 max-w-[760px]">
            <div className="flex items-center gap-2">
              {row.original.editedContent ? (
                <Badge variant="outline" className="h-6">
                  Edited
                </Badge>
              ) : null}
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap break-words leading-relaxed">
              {currentContent}
            </p>
            {row.original.editedContent ? (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap break-words leading-snug">
                Original: {originalContent}
              </p>
            ) : null}
          </div>
        )
      },
    },
    {
      id: "practice",
      header: "Practice",
      cell: ({ row }) => {
        const attempts = row.original.practiceAttempts || 0
        const score = row.original.practiceScore
        return (
          <div className="flex flex-col gap-1 text-xs">
            <Badge variant="outline" className="w-fit">Attempts: {attempts}</Badge>
            <span className={score != null ? "text-emerald-600 font-semibold" : "text-muted-foreground"}>
              {score != null ? `${score}% accuracy` : "Not practiced yet"}
            </span>
          </div>
        )
      },
      size: 140,
    },
    {
      id: "actions",
      header: "",
      cell: ({ row }) => {
        const isEditing = editingId === row.original.id
        const isSaving = savingId === row.original.id
        const isDeleting = deletingId === row.original.id
        const isRestoring = restoringId === row.original.id
        return (
          <div className="flex justify-end items-center gap-2">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link href={`/study/sentences/${row.original.id}`}>
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                        <PlayCircle className="h-4 w-4" />
                    </Button>
                  </Link>
                </TooltipTrigger>
                <TooltipContent>Practice</TooltipContent>
              </Tooltip>
              {isEditing ? (
                <>
                  <Button 
                    size="icon" 
                    variant="secondary" 
                    className="h-8 w-8"
                    disabled={isSaving}
                    onClick={() => handleSave(row.original)}
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8"
                    onClick={() => setEditingId(null)}
                    disabled={isSaving}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </>
              ) : (
                <>
                  {row.original.editedContent ? (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button 
                          size="icon" 
                          variant="ghost" 
                          className="h-8 w-8"
                          disabled={isRestoring || isDeleting}
                          onClick={() => handleRestoreOriginal(row.original)}
                        >
                          {isRestoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Restore original text</TooltipContent>
                    </Tooltip>
                  ) : null}
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8"
                    onClick={() => startEdit(row.original)}
                  >
                    <PenSquare className="h-4 w-4" />
                  </Button>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-8 w-8 text-destructive"
                    onClick={() => setConfirmingDeleteId(row.original.id)}
                    disabled={isDeleting}
                  >
                    {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </Button>
                  <AlertDialog
                    open={confirmingDeleteId === row.original.id}
                    onOpenChange={(open) => setConfirmingDeleteId(open ? row.original.id : null)}
                  >
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete this sentence?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This also removes its vocabulary entries and practice progress.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => handleDelete(row.original)}
                          disabled={isDeleting}
                        >
                          {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                          Delete
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </>
              )}
          </div>
      )
    },
    size: 150,
    },
  ], [confirmingDeleteId, editingId, savingId, deletingId, restoringId])

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
    <TooltipProvider>
    <div className="rounded-md border bg-card overflow-x-auto">
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
    </TooltipProvider>
  )
}
