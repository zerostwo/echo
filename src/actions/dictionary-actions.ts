'use server'

import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import { lookupWordByText } from "@/actions/word-actions"
import { supabaseAdmin, supabase } from '@/lib/supabase'
import { VocabFilters } from '@/actions/vocab-actions'
import { randomUUID } from 'crypto'

export async function createDictionaryFromFilter(name: string, description: string, filters: VocabFilters) {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }
  const userId = session.user.id
  const client = supabaseAdmin || supabase

  // 1. Get Word IDs based on filters
  
  // Filter by material
  let wordIdsFromMaterials: string[] | null = null
  
  if (filters.materialId || (filters.materialIds && filters.materialIds.length > 0)) {
      let materialsQuery = client
            .from('materials')
            .select('id')
            .eq('user_id', userId)
            .is('deleted_at', null);

      if (filters.materialIds && filters.materialIds.length > 0) {
          materialsQuery = materialsQuery.in('id', filters.materialIds);
      } else if (filters.materialId) {
          materialsQuery = materialsQuery.eq('id', filters.materialId);
      }
      const { data: materials } = await materialsQuery
      const materialIds = materials?.map(m => m.id) || []
      
      if (materialIds.length > 0) {
          const { data: sentences } = await client
              .from('sentences')
              .select('id')
              .in('material_id', materialIds)
              .is('deleted_at', null)
          const sentenceIds = sentences?.map(s => s.id) || []
          
          if (sentenceIds.length > 0) {
              const { data: occurrences } = await client
                  .from('word_occurrences')
                  .select('word_id')
                  .in('sentence_id', sentenceIds)
              wordIdsFromMaterials = occurrences?.map(o => o.word_id) || []
              // Deduplicate
              wordIdsFromMaterials = Array.from(new Set(wordIdsFromMaterials))
          } else {
              wordIdsFromMaterials = []
          }
      } else {
          wordIdsFromMaterials = []
      }
  }

  // Filter by status/learningState/dueFilter (UserWordStatus)
  let wordIdsFromStatus: string[] | null = null
  
  if ((filters.status && filters.status.length > 0) || 
      (filters.learningState && filters.learningState.length > 0) || 
      filters.dueFilter) {
      
      let statusQuery = client
          .from('user_word_statuses')
          .select('word_id')
          .eq('user_id', userId)
      
      if (filters.status && filters.status.length > 0) {
          statusQuery = statusQuery.in('status', filters.status)
      }
      
      if (filters.learningState && filters.learningState.length > 0) {
          statusQuery = statusQuery.in('fsrs_state', filters.learningState)
      }
      
      // Simplified dueFilter logic
      if (filters.dueFilter === 'overdue') {
          statusQuery = statusQuery.lt('fsrs_due', new Date().toISOString())
      }
      
      const { data: statuses } = await statusQuery
      wordIdsFromStatus = statuses?.map(s => s.word_id) || []
  }

  // Filter by Word properties (search, collins, oxford, frequency)
  let wordQuery = client.from('words').select('id').is('deleted_at', null)
  
  if (filters.search) {
      wordQuery = wordQuery.ilike('text', `%${filters.search}%`)
  }
  
  if (filters.collins && filters.collins.length > 0) {
      wordQuery = wordQuery.in('collins', filters.collins)
  }
  
  if (filters.oxford) {
      wordQuery = wordQuery.not('oxford', 'is', null)
  }
  
  // Apply intersection of IDs
  if (wordIdsFromMaterials !== null) {
      wordQuery = wordQuery.in('id', wordIdsFromMaterials)
  }
  
  if (wordIdsFromStatus !== null) {
      wordQuery = wordQuery.in('id', wordIdsFromStatus)
  }
  
  const { data: words } = await wordQuery
  const finalWordIds = words?.map(w => w.id) || []

  if (finalWordIds.length === 0) {
      throw new Error("No words found matching filters")
  }

  // Create Dictionary
  const dictionary = await prisma.dictionary.create({
    data: {
      name,
      description,
      userId,
      filter: JSON.stringify(filters),
    },
  })

  // Add words
  const data = finalWordIds.map(wordId => ({
    dictionaryId: dictionary.id,
    wordId,
  }))

  // Batch insert
  await prisma.dictionaryWord.createMany({
    data,
    skipDuplicates: true,
  })

  revalidatePath("/dictionaries")
  return dictionary
}

export async function addWordToDictionaryByText(dictionaryId: string, text: string, translation?: string) {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" }
  }

  // Verify ownership
  const dictionary = await prisma.dictionary.findUnique({
    where: { id: dictionaryId, userId: session.user.id },
  })

  if (!dictionary) {
    return { success: false, error: "Dictionary not found" }
  }

  let wordId: string | undefined

  const result = await lookupWordByText(text)
  if ('error' in result || !result.word) {
    if (translation) {
      // Create word manually if translation is provided
      const normalizedText = text.trim().toLowerCase()
      const existing = await prisma.word.findUnique({
          where: { text: normalizedText }
      })
      
      if (existing) {
          wordId = existing.id
      } else {
          const newWord = await prisma.word.create({
            data: {
              id: randomUUID(),
              text: normalizedText,
              translation: translation,
              // Other fields will be null
            },
          })
          wordId = newWord.id
      }
    } else {
      return { success: false, error: "Word not found", code: "WORD_NOT_FOUND" }
    }
  } else {
    wordId = result.word.id
  }

  if (!wordId) {
    // Should be covered above, but just in case
    // Create word in DB
    // We need to handle potential race condition where word is created by another process
    // upsert is better, but we don't have id.
    // findUnique by text is already done in lookupWordByText (partially)
    
    // Let's try to find it again with prisma to be sure
    const existing = await prisma.word.findUnique({
        where: { text: result.word!.text }
    })
    
    if (existing) {
        wordId = existing.id
    } else {
        const newWord = await prisma.word.create({
          data: {
            id: randomUUID(),
            text: result.word!.text,
            phonetic: result.word!.phonetic,
            definition: result.word!.definition,
            translation: result.word!.translation,
            pos: result.word!.pos,
            collins: result.word!.collins,
            oxford: result.word!.oxford,
            tag: result.word!.tag,
            bnc: result.word!.bnc,
            frq: result.word!.frq,
            exchange: result.word!.exchange,
            audio: result.word!.audio,
          },
        })
        wordId = newWord.id
    }
  }

  // Add to dictionary
  // Use upsert or ignore if exists
  // dictionaryWord has composite id [dictionaryId, wordId]
  
  try {
      await prisma.dictionaryWord.create({
        data: {
          dictionaryId,
          wordId: wordId!,
        },
      })
  } catch (e) {
      // Ignore unique constraint violation (already exists)
  }

  // Ensure UserWordStatus exists so it shows up in learning
  try {
    await prisma.userWordStatus.upsert({
      where: {
        userId_wordId: {
          userId: session.user.id,
          wordId: wordId!
        }
      },
      update: {}, // Do nothing if exists
      create: {
        userId: session.user.id,
        wordId: wordId!,
        status: 'NEW',
      }
    })
  } catch (e) {
    console.error("Error creating user word status:", e)
  }

  revalidatePath(`/dictionaries/${dictionaryId}`)
  return { success: true }
}

export async function createDictionary(data: {
  name: string
  description?: string
  isSystem?: boolean
  filter?: string
}) {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }

  const dictionary = await prisma.dictionary.create({
    data: {
      name: data.name,
      description: data.description,
      isSystem: data.isSystem || false,
      filter: data.filter,
      userId: session.user.id,
    },
  })

  revalidatePath("/vocab")
  revalidatePath("/dictionaries")
  return dictionary
}

export async function getDictionaries() {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }

  const dictionaries = await prisma.dictionary.findMany({
    where: {
      userId: session.user.id,
      deletedAt: null,
    },
    include: {
      _count: {
        select: { words: true },
      },
      words: {
        select: {
            wordId: true
        }
      }
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  // Fetch all user word statuses for the user
  const userWordStatuses = await prisma.userWordStatus.findMany({
      where: {
          userId: session.user.id
      },
      select: {
          wordId: true,
          status: true,
          fsrsReps: true,
          errorCount: true
      }
  })

  const statusMap = new Map(userWordStatuses.map(s => [s.wordId, s]))

  return dictionaries.map(dict => {
      const wordIds = dict.words.map(w => w.wordId)
      const totalWords = wordIds.length
      
      let learnedWords = 0
      let totalReps = 0
      let totalErrors = 0

      wordIds.forEach(wordId => {
          const status = statusMap.get(wordId)
          if (status) {
              if (status.status !== 'NEW' && status.status !== 'UNKNOWN') {
                  learnedWords++
              }
              totalReps += status.fsrsReps
              totalErrors += status.errorCount
          }
      })

      const learningProgress = totalWords > 0 ? (learnedWords / totalWords) * 100 : 0
      const totalAttempts = totalReps + totalErrors
      const accuracy = totalAttempts > 0 ? (totalReps / totalAttempts) * 100 : 0

      // Remove words array to keep payload small and match previous structure roughly (though we added stats)
      const { words, ...rest } = dict
      return {
          ...rest,
          wordCount: totalWords,
          learningProgress,
          accuracy
      }
  })
}

export async function getDictionary(id: string) {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }

  const dictionary = await prisma.dictionary.findUnique({
    where: {
      id,
      userId: session.user.id,
    },
    include: {
      words: {
        include: {
          word: true,
        },
        orderBy: {
          addedAt: "desc",
        },
      },
    },
  })

  return dictionary
}

export async function addWordsToDictionary(dictionaryId: string, wordIds: string[]) {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }

  // Verify ownership
  const dictionary = await prisma.dictionary.findUnique({
    where: { id: dictionaryId, userId: session.user.id },
  })

  if (!dictionary) {
    throw new Error("Dictionary not found")
  }

  // Create DictionaryWord entries
  // We use createMany if supported, or loop
  // Prisma createMany is supported for postgres
  
  // However, we need to handle duplicates (if word is already in dictionary).
  // createMany with skipDuplicates is useful.
  
  const data = wordIds.map(wordId => ({
    dictionaryId,
    wordId,
  }))

  await prisma.dictionaryWord.createMany({
    data,
    skipDuplicates: true,
  })

  revalidatePath(`/dictionaries/${dictionaryId}`)
  return { success: true }
}

export async function removeWordsFromDictionary(dictionaryId: string, wordIds: string[]) {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }

  // Verify ownership
  const dictionary = await prisma.dictionary.findUnique({
    where: { id: dictionaryId, userId: session.user.id },
  })

  if (!dictionary) {
    throw new Error("Dictionary not found")
  }

  await prisma.dictionaryWord.deleteMany({
    where: {
      dictionaryId,
      wordId: {
        in: wordIds,
      },
    },
  })

  revalidatePath(`/dictionaries/${dictionaryId}`)
  return { success: true }
}

export async function deleteDictionary(id: string) {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }

  await prisma.dictionary.update({
    where: {
      id,
      userId: session.user.id,
    },
    data: {
      deletedAt: new Date(),
    },
  })

  revalidatePath("/vocab")
  revalidatePath("/dictionaries")
  return { success: true }
}

export async function restoreDictionary(id: string) {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }

  await prisma.dictionary.update({
    where: {
      id,
      userId: session.user.id,
    },
    data: {
      deletedAt: null,
    },
  })

  revalidatePath("/vocab")
  revalidatePath("/dictionaries")
  revalidatePath("/trash")
  return { success: true }
}

export async function permanentlyDeleteDictionary(id: string) {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }

  await prisma.dictionary.delete({
    where: {
      id,
      userId: session.user.id,
    },
  })

  revalidatePath("/trash")
  return { success: true }
}

export async function updateDictionary(id: string, data: { name?: string; description?: string }) {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }

  const dictionary = await prisma.dictionary.update({
    where: {
      id,
      userId: session.user.id,
    },
    data,
  })

  revalidatePath("/vocab")
  revalidatePath("/dictionaries")
  revalidatePath(`/dictionaries/${id}`)
  return dictionary
}

export interface DictionaryFilters {
    search?: string;
}

export interface PaginatedDictionaryResult {
    data: any[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export async function getDictionariesPaginated(
    page: number = 1,
    pageSize: number = 10,
    filters: DictionaryFilters = {},
    sortBy: string = 'createdAt',
    sortOrder: 'asc' | 'desc' = 'desc'
): Promise<PaginatedDictionaryResult | { error: string }> {
    const session = await auth()
    if (!session?.user?.id) {
        return { error: "Unauthorized" }
    }

    const skip = (page - 1) * pageSize;

    try {
        const where: any = {
            userId: session.user.id,
            deletedAt: null,
        };

        if (filters.search) {
            where.name = {
                contains: filters.search,
                mode: 'insensitive',
            };
        }

        // Determine if we can sort in database
        const dbSortFields = ['name', 'createdAt', 'updatedAt'];
        const isDbSort = dbSortFields.includes(sortBy);

        let dictionaries;
        let total;

        if (isDbSort) {
            [total, dictionaries] = await Promise.all([
                prisma.dictionary.count({ where }),
                prisma.dictionary.findMany({
                    where,
                    skip,
                    take: pageSize,
                    orderBy: {
                        [sortBy]: sortOrder,
                    },
                    include: {
                        _count: {
                            select: { words: true },
                        },
                        words: {
                            select: {
                                wordId: true
                            }
                        }
                    },
                })
            ]);
        } else {
            // Fetch all for in-memory sorting
            dictionaries = await prisma.dictionary.findMany({
                where,
                include: {
                    _count: {
                        select: { words: true },
                    },
                    words: {
                        select: {
                            wordId: true
                        }
                    }
                },
            });
            total = dictionaries.length;
        }

        // Fetch stats for the dictionaries (either page or all)
        const allWordIds = new Set<string>();
        dictionaries.forEach(d => {
            d.words.forEach(w => allWordIds.add(w.wordId));
        });

        const userWordStatuses = await prisma.userWordStatus.findMany({
            where: {
                userId: session.user.id,
                wordId: {
                    in: Array.from(allWordIds)
                }
            },
            select: {
                wordId: true,
                status: true,
                fsrsReps: true,
                errorCount: true
            }
        });

        const statusMap = new Map(userWordStatuses.map(s => [s.wordId, s]));

        let data = dictionaries.map(dict => {
            const wordIds = dict.words.map(w => w.wordId);
            const totalWords = wordIds.length;
            
            let learnedWords = 0;
            let totalReps = 0;
            let totalErrors = 0;

            wordIds.forEach(wordId => {
                const status = statusMap.get(wordId);
                if (status) {
                    if (status.status !== 'NEW' && status.status !== 'UNKNOWN') {
                        learnedWords++;
                    }
                    totalReps += status.fsrsReps;
                    totalErrors += status.errorCount;
                }
            });

            const learningProgress = totalWords > 0 ? (learnedWords / totalWords) * 100 : 0;
            const totalAttempts = totalReps + totalErrors;
            const accuracy = totalAttempts > 0 ? (totalReps / totalAttempts) * 100 : 0;

            const { words, ...rest } = dict;
            return {
                ...rest,
                wordCount: totalWords,
                learningProgress,
                accuracy
            };
        });

        if (!isDbSort) {
            // Sort in memory
            data.sort((a, b) => {
                const valA = a[sortBy as keyof typeof a];
                const valB = b[sortBy as keyof typeof b];
                
                // Handle potential undefined/null
                if (valA === valB) return 0;
                if (valA === null || valA === undefined) return 1;
                if (valB === null || valB === undefined) return -1;

                if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
                if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
                return 0;
            });
            
            // Paginate
            data = data.slice(skip, skip + pageSize);
        }

        return {
            data,
            total,
            page,
            pageSize,
            totalPages: Math.ceil(total / pageSize),
        };

    } catch (error) {
        console.error("Failed to fetch dictionaries:", error);
        return { error: "Failed to fetch dictionaries" };
    }
}
