"use client"

import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
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
import { Check, Loader2, PenSquare, PlayCircle, RotateCcw, Trash2, X, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Search, Split, Merge } from "lucide-react"
import Link from "next/link"
import { useMemo, useRef, useState, useEffect, useCallback, type SetStateAction } from "react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { updateSentence, deleteSentence, restoreSentenceContent, getSentencesPaginated, mergeSentences, splitSentence, SentenceFilters, PaginatedSentenceResult } from "@/actions/sentence-actions"
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
import { Checkbox } from "@/components/ui/checkbox"
import { useDebounce } from "@/hooks/use-debounce"
import { SplitSentenceDialog } from "@/components/materials/split-sentence-dialog"

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

interface PaginatedSentencesTableProps {
  materialId: string
  initialData: PaginatedSentenceResult
}

function formatTime(seconds: number) {
    if (!Number.isFinite(seconds)) return "-:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

type DraftMap = Record<string, { startTime: string; endTime: string; content: string }>

export function PaginatedSentencesTable({ materialId, initialData }: PaginatedSentencesTableProps) {
  const [data, setData] = useState<SentenceRow[]>(initialData.data)
  const [total, setTotal] = useState(initialData.total)
  const [page, setPage] = useState(initialData.page)
  const [pageSize, setPageSize] = useState(initialData.pageSize)
  const [totalPages, setTotalPages] = useState(initialData.totalPages)
  const [loading, setLoading] = useState(false)

  const [search, setSearch] = useState("")
  const debouncedSearch = useDebounce(search, 300)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [drafts, _setDrafts] = useState<DraftMap>({})
  const draftsRef = useRef(drafts)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [restoringId, setRestoringId] = useState<string | null>(null)
  
  // New state for selection and split
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [merging, setMerging] = useState(false)
  const [splittingSentence, setSplittingSentence] = useState<SentenceRow | null>(null)
  
  const router = useRouter()

  const setDrafts = (updater: SetStateAction<DraftMap>) => {
    _setDrafts(prev => {
      const next = typeof updater === "function" ? (updater as (prev: typeof drafts) => typeof drafts)(prev) : updater
      draftsRef.current = next
      return next
    })
  }

  const fetchData = useCallback(async (newPage?: number) => {
    setLoading(true)
    try {
      const filters: SentenceFilters = {
        search: debouncedSearch || undefined,
      }
      
      const result = await getSentencesPaginated(
        materialId,
        newPage ?? page,
        pageSize,
        filters,
        'order',
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
      setSelectedIds(new Set()) // Clear selection on page change/refresh
    } catch (error) {
      console.error('Failed to fetch sentences:', error)
    } finally {
      setLoading(false)
    }
  }, [page, pageSize, debouncedSearch, materialId])

  useEffect(() => {
    fetchData(1)
  }, [debouncedSearch])

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
    fetchData(newPage)
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

      setDrafts(prev => {
        const newDrafts = { ...prev }
        delete newDrafts[row.id]
        return newDrafts
      })

      toast.success("Sentence updated")
      setEditingId(null)
      fetchData(page)
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
      fetchData(page)
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
      fetchData(page)
    } catch (e) {
      console.error(e)
      toast.error("Failed to delete sentence")
    } finally {
      setDeletingId(null)
    }
  }

  const handleMerge = async () => {
    if (selectedIds.size < 2) return
    setMerging(true)
    try {
      const res = await mergeSentences(Array.from(selectedIds))
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success("Sentences merged")
      setSelectedIds(new Set())
      fetchData(page)
    } catch (e) {
      console.error(e)
      toast.error("Failed to merge sentences")
    } finally {
      setMerging(false)
    }
  }

  const handleSplit = async (index: number) => {
    if (!splittingSentence) return
    try {
      const res = await splitSentence(splittingSentence.id, index)
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success("Sentence split")
      setSplittingSentence(null)
      fetchData(page)
    } catch (e) {
      console.error(e)
      toast.error("Failed to split sentence")
    }
  }

  const toggleSelection = (id: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedIds(newSelected)
  }

  const toggleAll = () => {
    if (selectedIds.size === data.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(data.map(d => d.id)))
    }
  }

  const columns = useMemo<ColumnDef<SentenceRow>[]>(() => [
    {
      id: "select",
      header: ({ table }) => (
        <Checkbox
          checked={data.length > 0 && selectedIds.size === data.length}
          onCheckedChange={toggleAll}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={selectedIds.has(row.original.id)}
          onCheckedChange={() => toggleSelection(row.original.id)}
          aria-label="Select row"
        />
      ),
      size: 30,
    },
    {
      accessorKey: "order",
      header: "#",
      cell: ({ row }) => {
        const index = (page - 1) * pageSize + row.index + 1
        return <span className="text-muted-foreground font-mono text-xs">#{index}</span>
      },
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
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="h-8 w-8"
                        onClick={() => setSplittingSentence(row.original)}
                      >
                        <Split className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Split sentence</TooltipContent>
                  </Tooltip>
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
  ], [confirmingDeleteId, editingId, savingId, deletingId, restoringId, selectedIds, data])

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: totalPages,
  })

  return (
    <TooltipProvider>
    <div className="space-y-4">
      {/* Search and Actions */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search sentences..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        {selectedIds.size > 1 && (
          <Button 
            variant="secondary" 
            onClick={handleMerge}
            disabled={merging}
          >
            {merging ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Merge className="mr-2 h-4 w-4" />}
            Merge {selectedIds.size} Sentences
          </Button>
        )}
      </div>

      <div className="rounded-md border bg-card overflow-x-auto relative">
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
                  No sentences found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      
      {/* Pagination */}
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{total} sentence(s)</span>
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

      {splittingSentence && (
        <SplitSentenceDialog
          open={!!splittingSentence}
          onOpenChange={(open) => !open && setSplittingSentence(null)}
          content={splittingSentence.editedContent ?? splittingSentence.content}
          onSplit={handleSplit}
        />
      )}
    </div>
    </TooltipProvider>
  )
}
