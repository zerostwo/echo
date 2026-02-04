"use client"

import { useState, useEffect, useCallback, useMemo, useTransition, useRef } from "react"
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
import { SlidersHorizontal, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Trash2, ChevronDown, ArrowUp, ArrowDown, ArrowUpDown, Pencil, Trophy, Link2, BookMinus } from "lucide-react"
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
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { getVocabPaginated, VocabFilters, PaginatedVocabResult } from "@/actions/vocab-actions"
import { updateWordsStatus, deleteWords, editWord, addWordRelation } from "@/actions/word-actions"
import { addWordToDictionaryByText, getDictionaries, removeWordsFromDictionary } from "@/actions/dictionary-actions"
import { useDebounce } from "@/hooks/use-debounce"
import { toast } from "sonner"
import { VocabFilterDrawer, FilterChips, VocabFilterState } from "./vocab-filter-drawer"
import { SaveAsDictionaryDialog } from "@/components/dictionaries/save-as-dictionary-dialog"
import { useUserSettings } from "@/components/user-settings-provider"
import { BookPlus } from "lucide-react"

interface VocabClientProps {
  initialData: PaginatedVocabResult
  materialId?: string
  dictionaryId?: string
  settings?: {
    vocabColumns?: string[]
    vocabSortBy?: string
    vocabSortOrder?: 'asc' | 'desc'
    vocabPageSize?: number
    vocabShowMastered?: boolean
  }
  materials?: { id: string; title: string }[]
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

export function VocabClient({ initialData, materialId, dictionaryId, settings, materials = [] }: VocabClientProps) {
  const { updateSettings } = useUserSettings()
  
  const [data, setData] = useState(initialData.data || [])
  const [total, setTotal] = useState(initialData.total)
  const [stats, setStats] = useState(initialData.stats)
  const [page, setPage] = useState(initialData.page)
  const [pageSize, setPageSize] = useState(settings?.vocabPageSize ?? initialData.pageSize)
  const [totalPages, setTotalPages] = useState(initialData.totalPages)
  const [loading, setLoading] = useState(false)
  const [isPending, startTransition] = useTransition()
  
  // Row selection
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({})
  
  // Filters - unified state
  const [filters, setFilters] = useState<VocabFilterState>({
    statusFilter: [],
    collinsFilter: [],
    oxfordFilter: undefined,
    frequencyRange: undefined, // undefined means no filter
    materialFilter: materialId || undefined,
    materialFilters: materialId ? [materialId] : [],
    learningStateFilter: [],
    dueFilter: undefined,
    domainFilter: [],
    posFilter: [],
  })
  
  // Search
  const [search, setSearch] = useState("")
  
  // Sorting - server-side sorting with persistence
  const [sortBy, setSortBy] = useState<string>(settings?.vocabSortBy || 'updated_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(settings?.vocabSortOrder || 'desc')
  
  // Client-side sorting state for table display
  const [sorting, setSorting] = useState<SortingState>([])
  
  const [selectedWord, setSelectedWord] = useState<any>(null)
  
  // Edit word dialog state
  const [editingWord, setEditingWord] = useState<{ id: string; text: string } | null>(null)
  const [editWordText, setEditWordText] = useState("")
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false)

  // Add to dictionary dialog state
  const [addToDictionaryWord, setAddToDictionaryWord] = useState<{ id: string; text: string } | null>(null)
  const [isAddToDictionaryOpen, setIsAddToDictionaryOpen] = useState(false)
  const [availableDictionaries, setAvailableDictionaries] = useState<{ id: string; name: string }[]>([])
  const [selectedDictionaryId, setSelectedDictionaryId] = useState<string>("")
  
  // Add synonym dialog state
  const [addSynonymWord, setAddSynonymWord] = useState<{ id: string; text: string } | null>(null)
  const [isAddSynonymOpen, setIsAddSynonymOpen] = useState(false)
  const [newSynonymText, setNewSynonymText] = useState("")
  
  const debouncedSearch = useDebounce(search, 300)

  // Max frequency for slider - only use when data is loaded
  const maxFrequency = useMemo(() => {
    if (data.length === 0) return 1000
    const max = Math.max(...(data.map(d => d.frequency || 0)), 100)
    return Math.ceil(max / 10) * 10 // Round up to nearest 10
  }, [data])

  // Track previous materialId to detect real changes
  const prevMaterialIdRef = useRef<string | undefined>(materialId)
  const dataRef = useRef<any[]>(data)
  
  // Track if initial data has been loaded to avoid double fetches
  const initializedRef = useRef(false)
  
  // Initialize data from initialData on first render only
  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true
      setData(initialData.data || [])
      setTotal(initialData.total)
      setStats(initialData.stats)
      setPage(initialData.page)
      setTotalPages(initialData.totalPages)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Only run once on mount

  useEffect(() => {
    dataRef.current = data
  }, [data])

  const applyStatusChange = useCallback((ids: string[], status: string) => {
    if (ids.length === 0) return
    setData(prev => prev.map(word => ids.includes(word.id) ? { ...word, status } : word))
    setStats(prev => {
      if (!prev) return prev
      const next = { ...prev }
      for (const id of ids) {
        const existing = dataRef.current.find((w: any) => w.id === id)
        if (!existing) continue
        const oldStatus = existing.status
        if (oldStatus === status) continue

        if (oldStatus === 'NEW') next.newWords = Math.max(0, next.newWords - 1)
        if (oldStatus === 'LEARNING') next.learningWords = Math.max(0, next.learningWords - 1)
        if (oldStatus === 'MASTERED') {
          next.masteredWords = Math.max(0, next.masteredWords - 1)
          next.masteredWords24h = Math.max(0, (next.masteredWords24h || 0) - 1)
        }

        if (status === 'NEW') next.newWords += 1
        if (status === 'LEARNING') next.learningWords += 1
        if (status === 'MASTERED') {
          next.masteredWords += 1
          next.masteredWords24h = (next.masteredWords24h || 0) + 1
        }
      }
      return next
    })
  }, [])

  // Sync server refreshed data for dictionary pages
  useEffect(() => {
    if (!dictionaryId) return
    if (!initializedRef.current) return
    setData(initialData.data || [])
    setTotal(initialData.total)
    setStats(initialData.stats)
    setPage(initialData.page)
    setPageSize(initialData.pageSize)
    setTotalPages(initialData.totalPages)
    setRowSelection({})
  }, [dictionaryId, initialData])

  // Reset filters and state only when materialId actually changes
  useEffect(() => {
    // Skip if materialId hasn't actually changed
    if (prevMaterialIdRef.current === materialId) return
    
    prevMaterialIdRef.current = materialId
    
    // materialId changed, reset state
    setData(initialData.data || [])
    setTotal(initialData.total)
    setStats(initialData.stats)
    setPage(initialData.page)
    setTotalPages(initialData.totalPages)
    setSearch("")
    setFilters({
      statusFilter: [],
      collinsFilter: [],
      oxfordFilter: undefined,
      frequencyRange: undefined,
      materialFilter: materialId || undefined,
      materialFilters: materialId ? [materialId] : [],
      learningStateFilter: [],
      dueFilter: undefined,
    })
    setRowSelection({})
  }, [materialId, initialData])

  const fetchData = useCallback(async (newPage?: number, newPageSize?: number, newSortBy?: string, newSortOrder?: 'asc' | 'desc') => {
    setLoading(true)
    try {
      // Determine which material IDs to filter by
      const materialIds = filters.materialFilters && filters.materialFilters.length > 0 
        ? filters.materialFilters 
        : (filters.materialFilter ? [filters.materialFilter] : undefined)
      
      const apiFilters: VocabFilters = {
        dictionaryId: dictionaryId,
        materialId: materialIds && materialIds.length === 1 ? materialIds[0] : undefined,
        materialIds: materialIds && materialIds.length > 1 ? materialIds : undefined,
        search: debouncedSearch || undefined,
        status: filters.statusFilter.length > 0 ? filters.statusFilter : undefined,
        collins: filters.collinsFilter.length > 0 ? filters.collinsFilter : undefined,
        oxford: filters.oxfordFilter,
        minFrequency: filters.frequencyRange ? filters.frequencyRange[0] : undefined,
        maxFrequency: filters.frequencyRange ? filters.frequencyRange[1] : undefined,
        learningState: (filters.learningStateFilter && filters.learningStateFilter.length > 0) ? filters.learningStateFilter : undefined,
        dueFilter: filters.dueFilter,
        domain: (filters.domainFilter?.length ?? 0) > 0 ? filters.domainFilter : undefined,
        pos: (filters.posFilter?.length ?? 0) > 0 ? filters.posFilter : undefined,
        showMastered: settings?.vocabShowMastered ?? false,
      }
      
      const result = await getVocabPaginated(
        newPage ?? page,
        newPageSize ?? pageSize,
        apiFilters,
        newSortBy ?? sortBy,
        newSortOrder ?? sortOrder
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
  }, [debouncedSearch, filters, sortBy, sortOrder, dictionaryId])

  // Fetch when filters change (but not on initial mount)
  const filterChangeRef = useRef(false)
  useEffect(() => {
    // Skip the first render since we have initialData
    if (!filterChangeRef.current) {
      filterChangeRef.current = true
      return
    }
    fetchData(1) // Reset to page 1 when filters change
  }, [debouncedSearch, filters, settings?.vocabShowMastered, fetchData])

  // Fetch when pagination or sort changes (after initial load)
  const pagingChangeRef = useRef(false)
  useEffect(() => {
    if (!pagingChangeRef.current) {
      pagingChangeRef.current = true
      return
    }
    fetchData(page, pageSize, sortBy, sortOrder)
  }, [page, pageSize, sortBy, sortOrder, fetchData])

  const handlePageChange = (newPage: number) => {
    setPage(newPage)
  }

  const handlePageSizeChange = async (newSize: number) => {
    setPageSize(newSize)
    setPage(1)
    // Persist page size preference
    await updateSettings({ vocabPageSize: newSize })
  }

  // Handle server-side sorting with persistence
  const handleSort = async (column: string, order: 'asc' | 'desc') => {
    setSortBy(column)
    setSortOrder(order)
    setPage(1)
    // Persist sort preference
    await updateSettings({ vocabSortBy: column, vocabSortOrder: order })
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
        applyStatusChange(selectedIds, status)
        toast.success(`${selectedIds.length} word(s) marked as ${status}`)
        setRowSelection({})
        fetchData(page)
      } catch (error) {
        toast.error('Failed to update word status')
      }
    })
  }

  // Handle single word status update
  const handleSingleStatusUpdate = async (wordId: string, status: string) => {
    startTransition(async () => {
      try {
        const result = await updateWordsStatus([wordId], status)
        if (result?.error) {
          toast.error(result.error)
          return
        }
        // Update local state immediately for better UX
        applyStatusChange([wordId], status)
        toast.success(`Word marked as ${status}`)
        fetchData(page)
      } catch (error) {
        toast.error('Failed to update word status')
      }
    })
  }

  // Handle filter removal
  const handleRemoveFilter = (type: string, value?: string | number) => {
    setFilters(prev => {
      const newFilters = { ...prev }
      switch (type) {
        case 'status':
          newFilters.statusFilter = prev.statusFilter.filter(s => s !== value)
          break
        case 'collins':
          newFilters.collinsFilter = prev.collinsFilter.filter(c => c !== value)
          break
        case 'oxford':
          newFilters.oxfordFilter = undefined
          break
        case 'frequency':
          newFilters.frequencyRange = undefined
          break
        case 'material':
          // Support removing individual materials from multi-select
          if (value && newFilters.materialFilters) {
            newFilters.materialFilters = newFilters.materialFilters.filter(id => id !== value)
            // Update materialFilter for backward compatibility
            newFilters.materialFilter = newFilters.materialFilters.length > 0 ? newFilters.materialFilters[0] : undefined
          } else {
            newFilters.materialFilter = undefined
            newFilters.materialFilters = []
          }
          break
        case 'learningState':
          newFilters.learningStateFilter = prev.learningStateFilter?.filter(s => s !== value) || []
          break
        case 'due':
          newFilters.dueFilter = undefined
          break
        case 'domain':
          newFilters.domainFilter = prev.domainFilter?.filter(d => d !== value) || []
          break
        case 'pos':
          newFilters.posFilter = prev.posFilter?.filter(p => p !== value) || []
          break
      }
      return newFilters
    })
  }

  // Handle bulk delete
  const handleBulkDelete = async () => {
    const selectedIds = Object.keys(rowSelection).map(idx => data[parseInt(idx)]?.id).filter(Boolean)
    if (selectedIds.length === 0) return

    startTransition(async () => {
      try {
        const result = await deleteWords(selectedIds)
        if (result?.error) {
          toast.error(result.error)
          return
        }
        toast.success(`${selectedIds.length} word(s) deleted`)
        setRowSelection({})
        fetchData(page)
      } catch (error) {
        toast.error('Failed to delete words')
      }
    })
  }

  // Handle context menu - delete single word
  const handleContextDelete = async (wordId: string) => {
    startTransition(async () => {
      try {
        const result = await deleteWords([wordId])
        if (result?.error) {
          toast.error(result.error)
          return
        }
        toast.success('Word deleted')
        fetchData(page)
      } catch (error) {
        toast.error('Failed to delete word')
      }
    })
  }

  // Handle context menu - remove from dictionary
  const handleContextRemoveFromDictionary = async (wordId: string) => {
    if (!dictionaryId) return

    startTransition(async () => {
      try {
        const result = await removeWordsFromDictionary(dictionaryId, [wordId])
        if (result?.success) {
          toast.success('Word removed from dictionary')
          fetchData(page)
        } else {
          toast.error('Failed to remove word from dictionary')
        }
      } catch (error) {
        toast.error('Failed to remove word from dictionary')
      }
    })
  }

  // Handle context menu - mark as mastered
  const handleContextMaster = async (wordId: string) => {
    startTransition(async () => {
      try {
        const result = await updateWordsStatus([wordId], 'MASTERED')
        if (result?.error) {
          toast.error(result.error)
          return
        }
        applyStatusChange([wordId], 'MASTERED')
        toast.success('Word marked as mastered')
        fetchData(page)
      } catch (error) {
        toast.error('Failed to update word status')
      }
    })
  }

  // Handle context menu - open edit dialog
  const handleContextEdit = (word: { id: string; text: string }) => {
    setEditingWord(word)
    setEditWordText(word.text)
    setIsEditDialogOpen(true)
  }

  // Handle edit word submit
  const handleEditWordSubmit = async () => {
    if (!editingWord || !editWordText.trim()) return

    startTransition(async () => {
      try {
        const result = await editWord(editingWord.id, editWordText.trim())
        if (result?.error) {
          toast.error(result.error)
          return
        }
        if (result?.merged) {
          toast.success(`Word merged: "${editingWord.text}" → "${editWordText.trim()}" (context sentences combined)`)
        } else {
          toast.success(`Word updated to "${editWordText.trim()}"`)
        }
        setIsEditDialogOpen(false)
        setEditingWord(null)
        setEditWordText("")
        fetchData(page)
      } catch (error) {
        toast.error('Failed to edit word')
      }
    })
  }

  // Handle context menu - open add to dictionary dialog
  const handleContextAddToDictionary = async (word: { id: string; text: string }) => {
    setAddToDictionaryWord(word)
    setIsAddToDictionaryOpen(true)
    
    // Fetch dictionaries if not already loaded
    if (availableDictionaries.length === 0) {
      try {
        const dicts = await getDictionaries()
        setAvailableDictionaries(dicts.map(d => ({ id: d.id, name: d.name })))
        if (dicts.length > 0) {
          setSelectedDictionaryId(dicts[0].id)
        }
      } catch (error) {
        console.error("Failed to fetch dictionaries", error)
        toast.error("Failed to load dictionaries")
      }
    }
  }

  // Handle add to dictionary submit
  const handleAddToDictionarySubmit = async () => {
    if (!addToDictionaryWord || !selectedDictionaryId) return

    startTransition(async () => {
      try {
        const result = await addWordToDictionaryByText(selectedDictionaryId, addToDictionaryWord.text)
        if (result.success) {
          toast.success(`Added "${addToDictionaryWord.text}" to dictionary`)
          setIsAddToDictionaryOpen(false)
          setAddToDictionaryWord(null)
        } else {
          toast.error(result.error || "Failed to add word to dictionary")
        }
      } catch (error) {
        console.error("Failed to add word to dictionary", error)
        toast.error("Failed to add word to dictionary")
      }
    })
  }

  // Handle context menu - open add synonym dialog
  const handleContextAddSynonym = (word: { id: string; text: string }) => {
    setAddSynonymWord(word)
    setNewSynonymText("")
    setIsAddSynonymOpen(true)
  }

  // Handle add synonym submit
  const handleAddSynonymSubmit = async () => {
    if (!addSynonymWord || !newSynonymText.trim()) return

    startTransition(async () => {
      try {
        const result = await addWordRelation(addSynonymWord.id, newSynonymText.trim(), 'SYNONYM', dictionaryId)
        if (result?.error) {
          toast.error(result.error)
          return
        }
        toast.success(`Added synonym "${newSynonymText.trim()}" to "${addSynonymWord.text}"`)
        setNewSynonymText("") // Clear input to allow adding another
        // Do NOT close dialog to allow adding multiple
        
        // Refresh list to show the new word if it was added
        fetchData(page)
      } catch (error) {
        toast.error('Failed to add synonym')
      }
    })
  }

  // Handle column visibility change with persistence
  const handleColumnVisibilityChange = async (columnId: string, isVisible: boolean) => {
    setColumnVisibility(prev => {
      const newVisibility = { ...prev, [columnId]: isVisible }
      // Persist column visibility
      const visibleColumns = Object.entries(newVisibility)
        .filter(([, visible]) => visible)
        .map(([id]) => id)
      updateSettings({ vocabColumns: visibleColumns })
      return newVisibility
    })
  }

  // Create columns with server-side sorting handlers and status update
  const columns = useMemo(() => getVocabColumns(handleSort, sortBy, sortOrder, handleSingleStatusUpdate, isPending), [sortBy, sortOrder, isPending])

  // Get initial column visibility based on settings
  const getInitialColumnVisibility = () => {
    const defaultVisible = ["select", "text", "phonetic", "status", "frequency", "oxford", "fsrsReps", "fsrsDue"]
    const visibleCols = Array.isArray(settings?.vocabColumns) ? settings!.vocabColumns! : defaultVisible
    const visibility: Record<string, boolean> = {}
    
    columns.forEach((col: any) => {
      const colId = col.id || col.accessorKey
      visibility[colId] = visibleCols.includes(colId)
    })
    return visibility
  }

  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(getInitialColumnVisibility())

  const table = useReactTable({
    data,
    columns,
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

  // Get current filters for learning page
  const currentFilters = useMemo(() => filters, [filters])

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between py-4">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search words..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-sm h-9"
          />
          {selectedCount > 0 && (
            <div className="flex items-center gap-2 ml-4">
              <span className="text-sm text-muted-foreground whitespace-nowrap h-9 flex items-center">{selectedCount} selected</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    Set Status
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem onClick={() => handleBulkStatusUpdate('NEW')} disabled={isPending}>
                    <Badge variant="secondary" className="mr-2 bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">NEW</Badge>
                    Mark as New
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkStatusUpdate('LEARNING')} disabled={isPending}>
                    <Badge variant="outline" className="mr-2 border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-900/30 dark:text-blue-400">LEARNING</Badge>
                    Mark as Learning
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleBulkStatusUpdate('MASTERED')} disabled={isPending}>
                    <Badge variant="default" className="mr-2 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">MASTERED</Badge>
                    Mark as Mastered
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleBulkDelete}
                disabled={isPending}
                className="text-destructive hover:text-destructive h-9"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            </div>
          )}
        </div>
        <div className="flex gap-2 h-9">
          <SaveAsDictionaryDialog filters={currentFilters} />
          <VocabFilterDrawer
            filters={filters}
            onFiltersChange={setFilters}
            maxFrequency={maxFrequency}
            materials={materials}
          />
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
                      onCheckedChange={(value) => handleColumnVisibilityChange(column.id, !!value)}
                    >
                      {column.id === 'text' ? 'Word' :
                       column.id === 'fsrsReps' ? 'Reviews' :
                       column.id === 'fsrsDue' ? 'Next Review' :
                       column.id}
                    </DropdownMenuCheckboxItem>
                  )
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Active Filter Chips */}
      <FilterChips
        filters={filters}
        onRemoveFilter={handleRemoveFilter}
        maxFrequency={maxFrequency}
        materials={materials}
      />

      {/* Table */}
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
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => setSelectedWord(row.original)}
                      >
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </TableCell>
                        ))}
                      </TableRow>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48">
                      <ContextMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          handleContextEdit({ id: row.original.id, text: row.original.text })
                        }}
                        disabled={isPending}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit Word
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          handleContextAddSynonym({ id: row.original.id, text: row.original.text })
                        }}
                        disabled={isPending}
                      >
                        <Link2 className="mr-2 h-4 w-4" />
                        Add Synonym
                      </ContextMenuItem>
                      {dictionaryId && (
                        <ContextMenuItem
                          onClick={(e) => {
                            e.stopPropagation()
                            handleContextRemoveFromDictionary(row.original.id)
                          }}
                          disabled={isPending}
                          className="text-destructive focus:text-destructive"
                        >
                          <BookMinus className="mr-2 h-4 w-4" />
                          Remove from Dictionary
                        </ContextMenuItem>
                      )}
                      <ContextMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          handleContextAddToDictionary({ id: row.original.id, text: row.original.text })
                        }}
                        disabled={isPending}
                      >
                        <BookPlus className="mr-2 h-4 w-4" />
                        Add to Dictionary
                      </ContextMenuItem>
                      <ContextMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          handleContextMaster(row.original.id)
                        }}
                        disabled={isPending || row.original.status === 'MASTERED'}
                      >
                        <Trophy className="mr-2 h-4 w-4" />
                        Mark as Mastered
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        onClick={(e) => {
                          e.stopPropagation()
                          handleContextDelete(row.original.id)
                        }}
                        disabled={isPending}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete Word
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
              dictionaryId={dictionaryId}
              onWordUpdate={(updatedWord) => {
                  setSelectedWord(updatedWord);
                  setData(prev => prev.map(w => w.id === updatedWord.id ? updatedWord : w));
              }}
          />
      )}

      {/* Edit Word Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Word</DialogTitle>
            <DialogDescription>
              Correct the word spelling. The dictionary data will be automatically updated based on the new word.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="original-word" className="text-right">
                Original
              </Label>
              <div className="col-span-3 text-muted-foreground">
                {editingWord?.text}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="new-word" className="text-right">
                New Word
              </Label>
              <Input
                id="new-word"
                value={editWordText}
                onChange={(e) => setEditWordText(e.target.value)}
                className="col-span-3"
                placeholder="Enter the correct word"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleEditWordSubmit()
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditDialogOpen(false)
                setEditingWord(null)
                setEditWordText("")
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button onClick={handleEditWordSubmit} disabled={isPending || !editWordText.trim()}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Save Changes'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Synonym Dialog */}
      <Dialog open={isAddSynonymOpen} onOpenChange={setIsAddSynonymOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Synonym</DialogTitle>
            <DialogDescription>
              Add a synonym for "{addSynonymWord?.text}". This will also add the synonym to your word list.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="synonym-word" className="text-right">
                Synonym
              </Label>
              <Input
                id="synonym-word"
                value={newSynonymText}
                onChange={(e) => setNewSynonymText(e.target.value)}
                className="col-span-3"
                placeholder="Enter synonym"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleAddSynonymSubmit()
                  }
                }}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddSynonymOpen(false)
                setAddSynonymWord(null)
                setNewSynonymText("")
              }}
              disabled={isPending}
            >
              Done
            </Button>
            <Button onClick={handleAddSynonymSubmit} disabled={isPending || !newSynonymText.trim()}>
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add & Keep Open'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add to Dictionary Dialog */}
      <Dialog open={isAddToDictionaryOpen} onOpenChange={setIsAddToDictionaryOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add to Dictionary</DialogTitle>
            <DialogDescription>
              Select a dictionary to add "{addToDictionaryWord?.text}" to.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="dictionary-select" className="text-right">
                Dictionary
              </Label>
              <div className="col-span-3">
                <Select
                  value={selectedDictionaryId}
                  onValueChange={setSelectedDictionaryId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select a dictionary" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDictionaries.length === 0 ? (
                      <SelectItem value="none" disabled>No dictionaries found</SelectItem>
                    ) : (
                      availableDictionaries.map((dict) => (
                        <SelectItem key={dict.id} value={dict.id}>
                          {dict.name}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsAddToDictionaryOpen(false)
                setAddToDictionaryWord(null)
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button 
              onClick={handleAddToDictionarySubmit} 
              disabled={isPending || !selectedDictionaryId || availableDictionaries.length === 0}
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Column definitions factory function with server-side sorting and status update
export const getVocabColumns = (
  handleSort: (column: string, order: 'asc' | 'desc') => void, 
  sortBy: string, 
  sortOrder: 'asc' | 'desc',
  onStatusChange: (wordId: string, status: string) => void,
  isPending: boolean
): ColumnDef<any>[] => [
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
    header: () => (
      <SortableColumnHeader 
        column="text" 
        label="Word" 
        sortBy={sortBy} 
        sortOrder={sortOrder} 
        onSort={handleSort} 
      />
    ),
    cell: ({ row }) => <span className="font-medium">{row.getValue("text")}</span>
  },
  {
    accessorKey: "phonetic",
    header: () => (
      <SortableColumnHeader 
        column="phonetic" 
        label="Phonetic" 
        sortBy={sortBy} 
        sortOrder={sortOrder} 
        onSort={handleSort} 
      />
    ),
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
    header: () => (
      <SortableColumnHeader 
        column="status" 
        label="Status" 
        sortBy={sortBy} 
        sortOrder={sortOrder} 
        onSort={handleSort} 
      />
    ),
    cell: ({ row }) => {
        const status = row.getValue("status") as string;
        const wordId = row.original.id;
        
        const statusConfig = {
          NEW: {
            label: "New",
            className: "bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700",
          },
          LEARNING: {
            label: "Learning",
            className: "bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50",
          },
          MASTERED: {
            label: "Mastered",
            className: "bg-amber-100 text-amber-700 hover:bg-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:hover:bg-amber-900/50",
          },
        };
        
        const currentConfig = statusConfig[status as keyof typeof statusConfig] || statusConfig.NEW;
        
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button 
                className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer ${currentConfig.className}`}
                onClick={(e) => e.stopPropagation()}
                disabled={isPending}
              >
                {currentConfig.label}
                <ChevronDown className="h-3 w-3 opacity-50" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem 
                onClick={() => onStatusChange(wordId, 'NEW')}
                disabled={isPending || status === 'NEW'}
              >
                <span className={`inline-block w-2 h-2 rounded-full mr-2 bg-gray-400`} />
                New
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onStatusChange(wordId, 'LEARNING')}
                disabled={isPending || status === 'LEARNING'}
              >
                <span className={`inline-block w-2 h-2 rounded-full mr-2 bg-blue-500`} />
                Learning
              </DropdownMenuItem>
              <DropdownMenuItem 
                onClick={() => onStatusChange(wordId, 'MASTERED')}
                disabled={isPending || status === 'MASTERED'}
              >
                <span className={`inline-block w-2 h-2 rounded-full mr-2 bg-amber-500`} />
                Mastered
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        );
    }
  },
  {
    accessorKey: "frequency",
    header: () => (
      <SortableColumnHeader 
        column="frequency" 
        label="Frequency" 
        sortBy={sortBy} 
        sortOrder={sortOrder} 
        onSort={handleSort} 
      />
    ),
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
    header: () => (
      <SortableColumnHeader 
        column="collins" 
        label="Level" 
        sortBy={sortBy} 
        sortOrder={sortOrder} 
        onSort={handleSort} 
      />
    ),
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
    header: () => (
      <SortableColumnHeader 
        column="oxford" 
        label="Oxford 3000" 
        sortBy={sortBy} 
        sortOrder={sortOrder} 
        onSort={handleSort} 
      />
    ),
    enableHiding: true,
    cell: ({ row }) => {
      const oxford = row.getValue("oxford") as number;
      if (oxford === 1) {
        return <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">Oxford</Badge>;
      }
      return null;
    }
  },
  {
    accessorKey: "fsrsReps",
    header: () => (
      <SortableColumnHeader 
        column="fsrs_reps" 
        label="Reviews" 
        sortBy={sortBy} 
        sortOrder={sortOrder} 
        onSort={handleSort} 
      />
    ),
    enableHiding: true,
    cell: ({ row }) => {
      const reps = row.getValue("fsrsReps") as number;
      const lapses = row.original.fsrsLapses as number;
      
      return (
        <div className="flex items-center gap-1 text-sm">
          <span>{reps}</span>
          {lapses > 0 && (
            <span className="text-red-500 text-xs">(-{lapses})</span>
          )}
        </div>
      );
    }
  },
  {
    accessorKey: "fsrsDue",
    header: () => (
      <SortableColumnHeader 
        column="fsrs_due" 
        label="Next Review" 
        sortBy={sortBy} 
        sortOrder={sortOrder} 
        onSort={handleSort} 
      />
    ),
    enableHiding: true,
    cell: ({ row }) => {
      const fsrsDue = row.getValue("fsrsDue") as string | null;
      const fsrsState = row.original.fsrsState as number;
      
      // State: 0=New, 1=Learning, 2=Review, 3=Relearning
      if (fsrsState === 0 || !fsrsDue) {
        return <span className="text-muted-foreground text-xs">Not started</span>;
      }
      
      const dueDate = new Date(fsrsDue);
      const now = new Date();
      const diffMs = dueDate.getTime() - now.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      let displayText = '';
      let colorClass = '';
      
      if (diffMs < 0) {
        // Overdue
        const overdueDays = Math.abs(diffDays);
        displayText = overdueDays === 0 ? 'Due now' : `${overdueDays} d overdue`;
        colorClass = 'text-red-600 dark:text-red-400';
      } else if (diffDays === 0) {
        displayText = 'Today';
        colorClass = 'text-orange-600 dark:text-orange-400';
      } else if (diffDays === 1) {
        displayText = 'Tomorrow';
        colorClass = 'text-yellow-600 dark:text-yellow-400';
      } else if (diffDays <= 7) {
        displayText = `${diffDays} days`;
        colorClass = 'text-green-600 dark:text-green-400';
      } else {
        displayText = dueDate.toLocaleDateString();
        colorClass = 'text-muted-foreground';
      }
      
      return (
        <span className={`text-sm ${colorClass}`}>
          {displayText}
        </span>
      );
    }
  },
]
