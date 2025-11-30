"use client"

import { useState, useEffect } from "react"
import { Filter, X, BookOpen, Clock, Target, GraduationCap } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export interface VocabFilterState {
  statusFilter: string[]
  collinsFilter: number[]
  oxfordFilter: boolean | undefined
  showMastered: boolean
  frequencyRange: [number, number] | undefined
  materialFilter?: string
  learningStateFilter?: number[] // 0=New, 1=Learning, 2=Review, 3=Relearning
  dueFilter?: 'overdue' | 'today' | 'week' | 'month' | undefined
}

interface VocabFilterDrawerProps {
  filters: VocabFilterState
  onFiltersChange: (filters: VocabFilterState) => void
  maxFrequency?: number
}

export function VocabFilterDrawer({ 
  filters, 
  onFiltersChange,
  maxFrequency = 1000 
}: VocabFilterDrawerProps) {
  const [open, setOpen] = useState(false)
  const [localFilters, setLocalFilters] = useState<VocabFilterState>(filters)
  const [frequencyEnabled, setFrequencyEnabled] = useState(!!filters.frequencyRange)

  // Sync local state when external filters change
  useEffect(() => {
    setLocalFilters(filters)
    setFrequencyEnabled(!!filters.frequencyRange)
  }, [filters])

  const handleStatusToggle = (status: string) => {
    const newStatus = localFilters.statusFilter.includes(status)
      ? localFilters.statusFilter.filter(s => s !== status)
      : [...localFilters.statusFilter, status]
    setLocalFilters({ ...localFilters, statusFilter: newStatus })
  }

  const handleCollinsToggle = (level: number) => {
    const newCollins = localFilters.collinsFilter.includes(level)
      ? localFilters.collinsFilter.filter(c => c !== level)
      : [...localFilters.collinsFilter, level]
    setLocalFilters({ ...localFilters, collinsFilter: newCollins })
  }

  const handleOxfordChange = (value: boolean | undefined) => {
    setLocalFilters({ ...localFilters, oxfordFilter: value })
  }

  const handleFrequencyChange = (value: number[]) => {
    setLocalFilters({ ...localFilters, frequencyRange: [value[0], value[1]] as [number, number] })
  }

  const handleFrequencyEnabledChange = (enabled: boolean) => {
    setFrequencyEnabled(enabled)
    if (!enabled) {
      setLocalFilters({ ...localFilters, frequencyRange: undefined })
    } else {
      setLocalFilters({ ...localFilters, frequencyRange: [0, maxFrequency] })
    }
  }

  const handleShowMasteredChange = (checked: boolean) => {
    setLocalFilters({ ...localFilters, showMastered: checked })
  }

  const handleLearningStateToggle = (state: number) => {
    const currentStates = localFilters.learningStateFilter || []
    const newStates = currentStates.includes(state)
      ? currentStates.filter(s => s !== state)
      : [...currentStates, state]
    setLocalFilters({ ...localFilters, learningStateFilter: newStates })
  }

  const handleDueFilterChange = (value: string) => {
    setLocalFilters({ 
      ...localFilters, 
      dueFilter: value === 'all' ? undefined : value as 'overdue' | 'today' | 'week' | 'month'
    })
  }

  const handleApply = () => {
    onFiltersChange(localFilters)
    setOpen(false)
  }

  const handleReset = () => {
    const resetFilters: VocabFilterState = {
      statusFilter: [],
      collinsFilter: [],
      oxfordFilter: undefined,
      showMastered: false,
      frequencyRange: undefined,
      materialFilter: filters.materialFilter, // Keep material filter if set from URL
      learningStateFilter: [],
      dueFilter: undefined,
    }
    setLocalFilters(resetFilters)
    setFrequencyEnabled(false)
    onFiltersChange(resetFilters)
  }

  // Count active filters
  const activeFilterCount = 
    filters.statusFilter.length + 
    filters.collinsFilter.length + 
    (filters.oxfordFilter !== undefined ? 1 : 0) +
    (filters.showMastered ? 1 : 0) +
    (filters.frequencyRange ? 1 : 0) +
    (filters.learningStateFilter?.length || 0) +
    (filters.dueFilter ? 1 : 0)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Filter className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="ml-1 px-1.5 py-0.5 text-xs">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[420px] sm:w-[420px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filter Vocabulary
          </SheetTitle>
          <SheetDescription>
            Narrow down your vocabulary list with these filters.
          </SheetDescription>
        </SheetHeader>
        
        <div className="space-y-6">
          {/* Learning Status Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-semibold">Learning Status</Label>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: "NEW", label: "New", color: "border-gray-300 bg-gray-50 text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300" },
                { value: "LEARNING", label: "Learning", color: "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
                { value: "MASTERED", label: "Mastered", color: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
              ].map((status) => (
                <button
                  key={status.value}
                  className={`px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    localFilters.statusFilter.includes(status.value)
                      ? `${status.color} ring-2 ring-offset-1 ring-primary/50`
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                  onClick={() => handleStatusToggle(status.value)}
                >
                  {status.label}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* FSRS Learning State Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <GraduationCap className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-semibold">FSRS State</Label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: 0, label: "New", description: "Not reviewed yet" },
                { value: 1, label: "Learning", description: "In initial learning" },
                { value: 2, label: "Review", description: "Regular review" },
                { value: 3, label: "Relearning", description: "Forgotten, relearning" },
              ].map((state) => (
                <button
                  key={state.value}
                  className={`px-3 py-2.5 rounded-lg border text-left transition-all ${
                    localFilters.learningStateFilter?.includes(state.value)
                      ? "border-primary bg-primary/10 ring-2 ring-offset-1 ring-primary/50"
                      : "border-border bg-background hover:bg-muted"
                  }`}
                  onClick={() => handleLearningStateToggle(state.value)}
                >
                  <div className="text-sm font-medium">{state.label}</div>
                  <div className="text-xs text-muted-foreground">{state.description}</div>
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Review Due Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-semibold">Review Schedule</Label>
            </div>
            <Select
              value={localFilters.dueFilter || 'all'}
              onValueChange={handleDueFilterChange}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select due time" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All words</SelectItem>
                <SelectItem value="overdue">Overdue (past due date)</SelectItem>
                <SelectItem value="today">Due today</SelectItem>
                <SelectItem value="week">Due this week</SelectItem>
                <SelectItem value="month">Due this month</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Dictionary Tags Section */}
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <Label className="text-sm font-semibold">Dictionary Tags</Label>
            </div>
            
            {/* Oxford 3000 */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Oxford 3000</Label>
              <div className="flex gap-2">
                <button
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    localFilters.oxfordFilter === true
                      ? "border-blue-300 bg-blue-50 text-blue-700 ring-2 ring-offset-1 ring-primary/50 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                  onClick={() => handleOxfordChange(localFilters.oxfordFilter === true ? undefined : true)}
                >
                  Oxford Only
                </button>
                <button
                  className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    localFilters.oxfordFilter === false
                      ? "border-red-300 bg-red-50 text-red-700 ring-2 ring-offset-1 ring-primary/50 dark:border-red-700 dark:bg-red-900/30 dark:text-red-400"
                      : "border-border bg-background text-muted-foreground hover:bg-muted"
                  }`}
                  onClick={() => handleOxfordChange(localFilters.oxfordFilter === false ? undefined : false)}
                >
                  Exclude Oxford
                </button>
              </div>
            </div>

            {/* Collins Stars */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Collins Star Rating</Label>
              <div className="flex gap-1.5">
                {[5, 4, 3, 2, 1].map((level) => (
                  <button
                    key={level}
                    className={`flex-1 px-2 py-2 rounded-lg border text-center transition-all ${
                      localFilters.collinsFilter.includes(level)
                        ? "border-yellow-300 bg-yellow-50 ring-2 ring-offset-1 ring-primary/50 dark:border-yellow-700 dark:bg-yellow-900/30"
                        : "border-border bg-background hover:bg-muted"
                    }`}
                    onClick={() => handleCollinsToggle(level)}
                  >
                    <div className="text-yellow-500 text-xs leading-none">
                      {"★".repeat(level)}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <Separator />

          {/* Frequency Range */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">Frequency Range</Label>
              <Switch
                checked={frequencyEnabled}
                onCheckedChange={handleFrequencyEnabledChange}
              />
            </div>
            {frequencyEnabled && localFilters.frequencyRange && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Min: {localFilters.frequencyRange[0]}</span>
                  <span className="text-muted-foreground">Max: {localFilters.frequencyRange[1]}</span>
                </div>
                <Slider
                  value={localFilters.frequencyRange}
                  onValueChange={handleFrequencyChange}
                  max={maxFrequency}
                  min={0}
                  step={1}
                  className="w-full"
                />
              </div>
            )}
          </div>

          <Separator />

          {/* Show Mastered Toggle */}
          <div className="flex items-center justify-between py-2">
            <div className="space-y-0.5">
              <Label className="text-sm font-semibold">Show Mastered Words</Label>
              <p className="text-xs text-muted-foreground">
                Include words you&apos;ve already mastered
              </p>
            </div>
            <Switch
              checked={localFilters.showMastered}
              onCheckedChange={handleShowMasteredChange}
            />
          </div>
        </div>

        <SheetFooter className="flex gap-2 pt-6 sm:flex-row">
          <Button variant="outline" onClick={handleReset} className="flex-1">
            Reset
          </Button>
          <Button onClick={handleApply} className="flex-1">
            Apply Filters
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

// Filter Chips Component
interface FilterChipsProps {
  filters: VocabFilterState
  onRemoveFilter: (type: string, value?: string | number) => void
  maxFrequency?: number
}

export function FilterChips({ filters, onRemoveFilter, maxFrequency = 1000 }: FilterChipsProps) {
  const chips: { key: string; label: string; type: string; value?: string | number }[] = []

  // Status chips
  filters.statusFilter.forEach(status => {
    chips.push({
      key: `status-${status}`,
      label: `Status: ${status}`,
      type: 'status',
      value: status,
    })
  })

  // Collins chips
  filters.collinsFilter.forEach(level => {
    chips.push({
      key: `collins-${level}`,
      label: `Collins: ${"★".repeat(level)}`,
      type: 'collins',
      value: level,
    })
  })

  // Oxford chip
  if (filters.oxfordFilter === true) {
    chips.push({
      key: 'oxford-only',
      label: 'Oxford 3000',
      type: 'oxford',
    })
  } else if (filters.oxfordFilter === false) {
    chips.push({
      key: 'oxford-exclude',
      label: 'Exclude Oxford',
      type: 'oxford',
    })
  }

  // Show mastered chip
  if (filters.showMastered) {
    chips.push({
      key: 'show-mastered',
      label: 'Showing Mastered',
      type: 'showMastered',
    })
  }

  // Frequency range chip - only show if explicitly set
  if (filters.frequencyRange) {
    chips.push({
      key: 'frequency',
      label: `Frequency: ${filters.frequencyRange[0]}-${filters.frequencyRange[1]}`,
      type: 'frequency',
    })
  }

  // Learning state chips
  const stateLabels: Record<number, string> = {
    0: 'FSRS: New',
    1: 'FSRS: Learning',
    2: 'FSRS: Review',
    3: 'FSRS: Relearning',
  }
  filters.learningStateFilter?.forEach(state => {
    chips.push({
      key: `learning-state-${state}`,
      label: stateLabels[state] || `State: ${state}`,
      type: 'learningState',
      value: state,
    })
  })

  // Due filter chip
  if (filters.dueFilter) {
    const dueLabels: Record<string, string> = {
      overdue: 'Due: Overdue',
      today: 'Due: Today',
      week: 'Due: This Week',
      month: 'Due: This Month',
    }
    chips.push({
      key: 'due-filter',
      label: dueLabels[filters.dueFilter],
      type: 'due',
    })
  }

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map(chip => (
        <Badge
          key={chip.key}
          variant="secondary"
          className="gap-1 pr-1 hover:bg-secondary/80"
        >
          {chip.label}
          <button
            onClick={() => onRemoveFilter(chip.type, chip.value)}
            className="ml-1 rounded-full p-0.5 hover:bg-muted-foreground/20"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  )
}
