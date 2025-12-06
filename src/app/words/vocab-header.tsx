"use client"

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { GraduationCap, BookOpen, X } from 'lucide-react'
import { VocabFilterState } from './vocab-filter-drawer'

interface VocabHeaderProps {
  materialId?: string
  materialTitle?: string
  dictionaryId?: string
  filters?: VocabFilterState
}

export function VocabHeader({ materialId, materialTitle, dictionaryId, filters }: VocabHeaderProps) {
  // Build learning URL with filters
  const buildLearningUrl = () => {
    const params = new URLSearchParams()
    
    if (dictionaryId) {
      params.set('dictionaryId', dictionaryId)
    }
    
    if (materialId || filters?.materialFilter) {
      params.set('materialId', materialId || filters?.materialFilter || '')
    }
    
    if (filters?.oxfordFilter === true) {
      params.set('oxford', 'true')
    } else if (filters?.oxfordFilter === false) {
      params.set('oxford', 'false')
    }
    
    if (filters?.collinsFilter && filters.collinsFilter.length > 0) {
      params.set('collins', filters.collinsFilter.join(','))
    }
    
    const queryString = params.toString()
    return queryString ? `/study/words?${queryString}` : '/study/words'
  }

  return (
    <div className="flex items-center gap-2">
      {(materialId || materialTitle) && (
        <div className="flex items-center gap-2 mr-4">
          <Badge variant="secondary" className="h-8 px-3 text-sm gap-2">
            <BookOpen className="h-3.5 w-3.5" />
            Filtered by: {materialTitle || 'Material'}
          </Badge>
          <Link href="/words">
            <Button variant="ghost" size="icon" className="h-8 w-8">
              <X className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      )}
      <Link href={buildLearningUrl()}>
        <Button>
          <GraduationCap className="mr-2 h-4 w-4" />
          Start Learning
        </Button>
      </Link>
    </div>
  )
}
