"use client"

import { useState, useEffect, useMemo } from "react"
import { Filter, X, ChevronDown, ChevronRight, Search, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Switch } from "@/components/ui/switch"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"

export interface VocabFilterState {
  statusFilter: string[]
  collinsFilter: number[]
  oxfordFilter: boolean | undefined
  showMastered: boolean
  frequencyRange: [number, number] | undefined
  materialFilter?: string // Single material filter (for backward compatibility)
  materialFilters?: string[] // Multi-select material filters
  learningStateFilter?: number[] // 0=New, 1=Learning, 2=Review, 3=Relearning
  dueFilter?: 'overdue' | 'today' | 'week' | 'month' | undefined
}

interface VocabFilterDrawerProps {
  filters: VocabFilterState
  onFiltersChange: (filters: VocabFilterState) => void
  maxFrequency?: number
  materials?: { id: string; title: string }[]
}

// Toggle Button Component for compact tag-style filters
function ToggleButton({ 
  active, 
  onClick, 
  children,
}: { 
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-2.5 py-1 rounded-md text-xs font-medium transition-all border",
        active
          ? "bg-primary text-primary-foreground border-primary shadow-sm"
          : "bg-muted/30 text-muted-foreground border-transparent hover:bg-muted hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}

// Section Header Component
function SectionHeader({ 
  title, 
  isOpen, 
  onToggle,
  count = 0
}: { 
  title: string
  isOpen: boolean
  onToggle: () => void
  count?: number
}) {
  return (
    <CollapsibleTrigger 
      onClick={onToggle}
      className="flex items-center justify-between w-full py-2 text-left hover:bg-muted/50 rounded-md px-1 -mx-1 transition-colors"
    >
      <span className="text-sm font-medium text-foreground flex items-center gap-2">
        {title}
        {count > 0 && (
          <Badge variant="secondary" className="h-4 px-1.5 text-[10px] font-normal">
            {count}
          </Badge>
        )}
      </span>
      {isOpen ? (
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      ) : (
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      )}
    </CollapsibleTrigger>
  )
}

// Material Source Filter with Search (Multi-select)
function MaterialSourceFilter({
  materials,
  selectedMaterials,
  isOpen,
  onToggle,
  onChange,
  count = 0
}: {
  materials: { id: string; title: string }[]
  selectedMaterials: string[]
  isOpen: boolean
  onToggle: () => void
  onChange: (materialId: string) => void
  count?: number
}) {
  const [searchQuery, setSearchQuery] = useState('')

  const filteredMaterials = useMemo(() => {
    if (!searchQuery) return materials
    const query = searchQuery.toLowerCase()
    return materials.filter(m => m.title.toLowerCase().includes(query))
  }, [materials, searchQuery])

  const selectedMaterialTitles = selectedMaterials
    .map(id => materials.find(m => m.id === id)?.title)
    .filter(Boolean) as string[]

  const handleClearAll = () => {
    selectedMaterials.forEach(id => onChange(id))
  }

  return (
    <Collapsible open={isOpen}>
      <SectionHeader 
        title="Material Source" 
        isOpen={isOpen}
        onToggle={onToggle}
        count={count}
      />
      <CollapsibleContent className="pt-2 pb-1 space-y-2">
        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search materials..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs"
          />
        </div>

        {/* Selected Materials */}
        {selectedMaterialTitles.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground px-1">
            <span>Selected:</span>
            {selectedMaterialTitles.slice(0, 2).map((title, index) => (
              <Badge key={index} variant="secondary" className="text-[10px] font-normal max-w-[120px] truncate">
                {title}
              </Badge>
            ))}
            {selectedMaterialTitles.length > 2 && (
              <Badge variant="secondary" className="text-[10px] font-normal">
                +{selectedMaterialTitles.length - 2}
              </Badge>
            )}
            <button 
              onClick={handleClearAll}
              className="text-muted-foreground hover:text-foreground ml-auto"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Materials List */}
        <ScrollArea className="h-[180px] rounded-md border">
          <div className="p-1.5 space-y-0.5">
            {filteredMaterials.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                No materials found
              </div>
            ) : (
              filteredMaterials.map((material) => {
                const isSelected = selectedMaterials.includes(material.id)
                return (
                  <button
                    key={material.id}
                    onClick={() => onChange(material.id)}
                    className={cn(
                      "w-full text-left px-2 py-1.5 rounded-md text-xs transition-colors flex items-center gap-2",
                      isSelected
                        ? "bg-accent text-accent-foreground"
                        : "hover:bg-muted text-foreground"
                    )}
                  >
                    <div className={cn(
                      "h-3.5 w-3.5 rounded border flex items-center justify-center shrink-0",
                      isSelected
                        ? "bg-primary border-primary"
                        : "border-muted-foreground/30"
                    )}>
                      {isSelected && (
                        <Check className="h-2.5 w-2.5 text-primary-foreground" />
                      )}
                    </div>
                    <span className="truncate">{material.title}</span>
                  </button>
                )
              })
            )}
          </div>
        </ScrollArea>
      </CollapsibleContent>
    </Collapsible>
  )
}

export function VocabFilterDrawer({ 
  filters, 
  onFiltersChange,
  maxFrequency = 1000,
  materials = []
}: VocabFilterDrawerProps) {
  const [open, setOpen] = useState(false)
  const [localFilters, setLocalFilters] = useState<VocabFilterState>(filters)
  const [frequencyEnabled, setFrequencyEnabled] = useState(!!filters.frequencyRange)
  
  // Section open states
  const [sectionsOpen, setSectionsOpen] = useState({
    learningStatus: true,
    fsrsState: true,
    reviewSchedule: false,
    materialSource: false,
    dictionaryTags: false,
    advanced: false,
  })

  // Sync local state when external filters change
  useEffect(() => {
    setLocalFilters(filters)
    setFrequencyEnabled(!!filters.frequencyRange)
  }, [filters])

  const toggleSection = (section: keyof typeof sectionsOpen) => {
    setSectionsOpen(prev => ({ ...prev, [section]: !prev[section] }))
  }

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

  const handleMaterialFilterChange = (materialId: string) => {
    const currentMaterials = localFilters.materialFilters || []
    const newMaterials = currentMaterials.includes(materialId)
      ? currentMaterials.filter(id => id !== materialId)
      : [...currentMaterials, materialId]
    setLocalFilters({
      ...localFilters,
      materialFilters: newMaterials,
      // Keep materialFilter in sync for backward compatibility (use first selected or undefined)
      materialFilter: newMaterials.length > 0 ? newMaterials[0] : undefined
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
      materialFilter: undefined,
      materialFilters: [],
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
    (filters.dueFilter ? 1 : 0) +
    (filters.materialFilters?.length || (filters.materialFilter ? 1 : 0))

  // Count for each section
  const dictionaryTagsCount = filters.collinsFilter.length + (filters.oxfordFilter !== undefined ? 1 : 0)
  const advancedCount = (filters.frequencyRange ? 1 : 0) + (filters.showMastered ? 1 : 0)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 text-xs">
          <Filter className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-0.5">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-[380px] sm:max-w-[380px] flex flex-col p-0">
        <SheetHeader className="px-4 py-3 border-b shrink-0">
          <SheetTitle className="text-sm font-semibold">Filters</SheetTitle>
        </SheetHeader>
        
        <div className="flex-1 overflow-y-auto px-4 py-3">
          <div className="space-y-4">
            {/* Learning Status - Collapsible, default expanded */}
            <Collapsible open={sectionsOpen.learningStatus}>
              <SectionHeader 
                title="Learning Status" 
                isOpen={sectionsOpen.learningStatus}
                onToggle={() => toggleSection('learningStatus')}
                count={filters.statusFilter.length}
              />
              <CollapsibleContent className="pt-2 pb-1">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: "NEW", label: "New" },
                    { value: "LEARNING", label: "Learning" },
                    { value: "MASTERED", label: "Mastered" },
                  ].map((status) => (
                    <ToggleButton
                      key={status.value}
                      active={localFilters.statusFilter.includes(status.value)}
                      onClick={() => handleStatusToggle(status.value)}
                    >
                      {status.label}
                    </ToggleButton>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* FSRS State - Collapsible, default expanded */}
            <Collapsible open={sectionsOpen.fsrsState}>
              <SectionHeader 
                title="FSRS State" 
                isOpen={sectionsOpen.fsrsState}
                onToggle={() => toggleSection('fsrsState')}
                count={filters.learningStateFilter?.length || 0}
              />
              <CollapsibleContent className="pt-2 pb-1">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: 0, label: "New" },
                    { value: 1, label: "Learning" },
                    { value: 2, label: "Review" },
                    { value: 3, label: "Relearning" },
                  ].map((state) => (
                    <ToggleButton
                      key={state.value}
                      active={localFilters.learningStateFilter?.includes(state.value) || false}
                      onClick={() => handleLearningStateToggle(state.value)}
                    >
                      {state.label}
                    </ToggleButton>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            <div className="border-t my-3" />

            {/* Review Schedule - Collapsible */}
            <Collapsible open={sectionsOpen.reviewSchedule}>
              <SectionHeader 
                title="Review Schedule" 
                isOpen={sectionsOpen.reviewSchedule}
                onToggle={() => toggleSection('reviewSchedule')}
                count={filters.dueFilter ? 1 : 0}
              />
              <CollapsibleContent className="pt-2 pb-1">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { value: 'overdue', label: 'Overdue' },
                    { value: 'today', label: 'Today' },
                    { value: 'week', label: 'This week' },
                    { value: 'month', label: 'This month' },
                  ].map((option) => (
                    <ToggleButton
                      key={option.value}
                      active={localFilters.dueFilter === option.value}
                      onClick={() => handleDueFilterChange(localFilters.dueFilter === option.value ? 'all' : option.value)}
                    >
                      {option.label}
                    </ToggleButton>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Material Source - Collapsible with Search */}
            {materials.length > 0 && (
              <MaterialSourceFilter
                materials={materials}
                selectedMaterials={localFilters.materialFilters || (localFilters.materialFilter ? [localFilters.materialFilter] : [])}
                isOpen={sectionsOpen.materialSource}
                onToggle={() => toggleSection('materialSource')}
                onChange={handleMaterialFilterChange}
                count={localFilters.materialFilters?.length || (localFilters.materialFilter ? 1 : 0)}
              />
            )}

            {/* Dictionary Tags - Collapsible */}
            <Collapsible open={sectionsOpen.dictionaryTags}>
              <SectionHeader 
                title="Dictionary Tags" 
                isOpen={sectionsOpen.dictionaryTags}
                onToggle={() => toggleSection('dictionaryTags')}
                count={dictionaryTagsCount}
              />
              <CollapsibleContent className="pt-2 pb-1 space-y-3">
                {/* Oxford 3000 */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Oxford 3000</Label>
                  <div className="flex gap-1.5">
                    <ToggleButton
                      active={localFilters.oxfordFilter === true}
                      onClick={() => handleOxfordChange(localFilters.oxfordFilter === true ? undefined : true)}
                    >
                      Include
                    </ToggleButton>
                    <ToggleButton
                      active={localFilters.oxfordFilter === false}
                      onClick={() => handleOxfordChange(localFilters.oxfordFilter === false ? undefined : false)}
                    >
                      Exclude
                    </ToggleButton>
                  </div>
                </div>

                {/* Collins Stars */}
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Collins Rating</Label>
                  <div className="flex gap-1">
                    {[5, 4, 3, 2, 1].map((level) => (
                      <button
                        key={level}
                        onClick={() => handleCollinsToggle(level)}
                        className={cn(
                          "flex-1 py-1 rounded text-center transition-all text-xs",
                          localFilters.collinsFilter.includes(level)
                            ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                            : "bg-muted/50 text-muted-foreground hover:bg-muted"
                        )}
                      >
                        {"★".repeat(level)}
                      </button>
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>

            {/* Advanced Options - Collapsible */}
            <Collapsible open={sectionsOpen.advanced}>
              <SectionHeader 
                title="Advanced" 
                isOpen={sectionsOpen.advanced}
                onToggle={() => toggleSection('advanced')}
                count={advancedCount}
              />
              <CollapsibleContent className="pt-2 pb-1 space-y-3">
                {/* Frequency Range */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">Frequency Range</Label>
                    <Switch
                      checked={frequencyEnabled}
                      onCheckedChange={handleFrequencyEnabledChange}
                      className="scale-75"
                    />
                  </div>
                  {frequencyEnabled && localFilters.frequencyRange && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>{localFilters.frequencyRange[0]}</span>
                        <span>{localFilters.frequencyRange[1]}</span>
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

                {/* Show Mastered Toggle */}
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Show Mastered</Label>
                  <Switch
                    checked={localFilters.showMastered}
                    onCheckedChange={handleShowMasteredChange}
                    className="scale-75"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </div>

        {/* Fixed Footer */}
        <div className="border-t px-4 py-3 flex gap-2 bg-background">
          <Button variant="ghost" size="sm" onClick={handleReset} className="flex-1 h-8 text-xs">
            Reset
          </Button>
          <Button size="sm" onClick={handleApply} className="flex-1 h-8 text-xs">
            Apply
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Filter Chips Component
interface FilterChipsProps {
  filters: VocabFilterState
  onRemoveFilter: (type: string, value?: string | number) => void
  maxFrequency?: number
  materials?: { id: string; title: string }[]
}

export function FilterChips({ filters, onRemoveFilter, materials = [] }: FilterChipsProps) {
  const chips: { key: string; label: string; type: string; value?: string | number }[] = []

  // Status chips
  filters.statusFilter.forEach(status => {
    chips.push({
      key: `status-${status}`,
      label: status.charAt(0) + status.slice(1).toLowerCase(),
      type: 'status',
      value: status,
    })
  })

  // Collins chips
  filters.collinsFilter.forEach(level => {
    chips.push({
      key: `collins-${level}`,
      label: "★".repeat(level),
      type: 'collins',
      value: level,
    })
  })

  // Oxford chip
  if (filters.oxfordFilter === true) {
    chips.push({
      key: 'oxford-only',
      label: 'Oxford',
      type: 'oxford',
    })
  } else if (filters.oxfordFilter === false) {
    chips.push({
      key: 'oxford-exclude',
      label: '¬Oxford',
      type: 'oxford',
    })
  }

  // Show mastered chip
  if (filters.showMastered) {
    chips.push({
      key: 'show-mastered',
      label: '+Mastered',
      type: 'showMastered',
    })
  }

  // Frequency range chip
  if (filters.frequencyRange) {
    chips.push({
      key: 'frequency',
      label: `${filters.frequencyRange[0]}-${filters.frequencyRange[1]}`,
      type: 'frequency',
    })
  }

  // Learning state chips
  const stateLabels: Record<number, string> = {
    0: 'New',
    1: 'Learning',
    2: 'Review',
    3: 'Relearning',
  }
  filters.learningStateFilter?.forEach(state => {
    chips.push({
      key: `learning-state-${state}`,
      label: `FSRS:${stateLabels[state]}`,
      type: 'learningState',
      value: state,
    })
  })

  // Due filter chip
  if (filters.dueFilter) {
    const dueLabels: Record<string, string> = {
      overdue: 'Overdue',
      today: 'Today',
      week: 'Week',
      month: 'Month',
    }
    chips.push({
      key: 'due-filter',
      label: dueLabels[filters.dueFilter],
      type: 'due',
    })
  }

  // Material filter chips (multi-select)
  if (filters.materialFilters && filters.materialFilters.length > 0) {
    filters.materialFilters.forEach(materialId => {
      const material = materials.find(m => m.id === materialId)
      chips.push({
        key: `material-filter-${materialId}`,
        label: material?.title || 'Material',
        type: 'material',
        value: materialId,
      })
    })
  } else if (filters.materialFilter) {
    // Backward compatibility for single material filter
    const material = materials.find(m => m.id === filters.materialFilter)
    chips.push({
      key: 'material-filter',
      label: material?.title || 'Material',
      type: 'material',
      value: filters.materialFilter,
    })
  }

  if (chips.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5">
      {chips.map(chip => (
        <Badge
          key={chip.key}
          variant="secondary"
          className="h-6 gap-1 pl-2 pr-1 text-xs font-normal"
        >
          {chip.label}
          <button
            onClick={() => onRemoveFilter(chip.type, chip.value)}
            className="rounded-full p-0.5 hover:bg-muted-foreground/20 transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  )
}
