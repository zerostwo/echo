'use server'

import { auth } from "@/auth"
import { getAdminClient, APPWRITE_DATABASE_ID, Query } from "@/lib/appwrite"
import { ID } from 'node-appwrite'
import { revalidatePath } from "next/cache"
import { lookupWordByText } from "@/actions/word-actions"
import { VocabFilters } from '@/actions/vocab-actions'
import { randomUUID } from 'crypto'

export async function createDictionaryFromFilter(name: string, description: string, filters: VocabFilters) {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }
  const userId = session.user.id
  const admin = getAdminClient()

  // 1. Get Word IDs based on filters
  
  // Filter by material
  let wordIdsFromMaterials: string[] | null = null
  
  if (filters.materialId || (filters.materialIds && filters.materialIds.length > 0)) {
      let materialIds: string[] = [];

      if (filters.materialIds && filters.materialIds.length > 0) {
          materialIds = filters.materialIds;
      } else if (filters.materialId) {
          materialIds = [filters.materialId];
      }
      
      if (materialIds.length > 0) {
          // Fetch sentences
          const sentenceIds: string[] = [];
          for (let i = 0; i < materialIds.length; i += 50) {
              const batch = materialIds.slice(i, i + 50);
              const { documents: sentences } = await admin.databases.listDocuments(
                  APPWRITE_DATABASE_ID,
                  'sentences',
                  [
                      Query.equal('material_id', batch),
                      Query.isNull('deleted_at'),
                      Query.limit(5000)
                  ]
              );
              sentenceIds.push(...sentences.map(s => s.$id));
          }
          
          if (sentenceIds.length > 0) {
              const occurrences: any[] = [];
              for (let i = 0; i < sentenceIds.length; i += 50) {
                  const batch = sentenceIds.slice(i, i + 50);
                  const { documents: occs } = await admin.databases.listDocuments(
                      APPWRITE_DATABASE_ID,
                      'word_occurrences',
                      [Query.equal('sentence_id', batch)]
                  );
                  occurrences.push(...occs);
              }
              wordIdsFromMaterials = Array.from(new Set(occurrences.map(o => o.word_id)));
          } else {
              wordIdsFromMaterials = [];
          }
      } else {
          wordIdsFromMaterials = [];
      }
  }

  // Filter by status/learningState/dueFilter (UserWordStatus)
  let wordIdsFromStatus: string[] | null = null
  
  if ((filters.status && filters.status.length > 0) || 
      (filters.learningState && filters.learningState.length > 0) || 
      filters.dueFilter) {
      
      const queries = [Query.equal('user_id', userId)];
      
      if (filters.status && filters.status.length > 0) {
          queries.push(Query.equal('status', filters.status));
      }
      
      if (filters.learningState && filters.learningState.length > 0) {
          queries.push(Query.equal('fsrs_state', filters.learningState));
      }
      
      // Simplified dueFilter logic
      if (filters.dueFilter === 'overdue') {
          queries.push(Query.lessThan('fsrs_due', new Date().toISOString()));
      }
      
      const { documents: statuses } = await admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'user_word_statuses',
          queries
      );
      wordIdsFromStatus = statuses.map(s => s.word_id);
  }

  // Filter by Word properties (search, collins, oxford, frequency)
  const wordQueries = [Query.isNull('deleted_at')];
  
  if (filters.search) {
      wordQueries.push(Query.search('text', filters.search));
  }
  
  if (filters.collins && filters.collins.length > 0) {
      wordQueries.push(Query.equal('collins', filters.collins));
  }
  
  if (filters.oxford) {
      wordQueries.push(Query.isNotNull('oxford'));
  }
  
  // Apply intersection of IDs
  // Appwrite doesn't support "IN" with large arrays well in one query if array is huge.
  // But we can filter in memory if needed or use batches.
  // If we have wordIdsFromMaterials or wordIdsFromStatus, we should use them to filter.
  
  let candidateIds: Set<string> | null = null;
  
  if (wordIdsFromMaterials !== null) {
      candidateIds = new Set(wordIdsFromMaterials);
  }
  
  if (wordIdsFromStatus !== null) {
      if (candidateIds === null) {
          candidateIds = new Set(wordIdsFromStatus);
      } else {
          // Intersection
          const statusSet = new Set(wordIdsFromStatus);
          candidateIds = new Set([...candidateIds].filter(x => statusSet.has(x)));
      }
  }
  
  // Fetch words matching properties
  // If candidateIds is set, we must also filter by them.
  // If candidateIds is huge, we can't pass it all to Query.equal('$id', ...).
  // Strategy: Fetch words matching properties, then filter by candidateIds in memory.
  // Or if candidateIds is small, use it in query.
  
  let finalWordIds: string[] = [];
  
  if (candidateIds !== null && candidateIds.size === 0) {
      throw new Error("No words found matching filters");
  }

  // If we have candidate IDs, we can fetch them directly (in batches) and check properties
  if (candidateIds !== null) {
      const ids = Array.from(candidateIds);
      const validIds: string[] = [];
      
      for (let i = 0; i < ids.length; i += 50) {
          const batch = ids.slice(i, i + 50);
          const batchQueries = [...wordQueries, Query.equal('$id', batch)];
          const { documents: words } = await admin.databases.listDocuments(
              APPWRITE_DATABASE_ID,
              'words',
              batchQueries
          );
          validIds.push(...words.map(w => w.$id));
      }
      finalWordIds = validIds;
  } else {
      // No ID constraints, just property constraints
      // This might return too many words. Limit?
      const { documents: words } = await admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'words',
          [...wordQueries, Query.limit(5000)]
      );
      finalWordIds = words.map(w => w.$id);
  }

  if (finalWordIds.length === 0) {
      throw new Error("No words found matching filters");
  }

  // Create Dictionary
  const dictionary = await admin.databases.createDocument(
      APPWRITE_DATABASE_ID,
      'dictionaries',
      ID.unique(),
      {
          name,
          description,
          user_id: userId,
          filter: JSON.stringify(filters),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
      }
  );

  // Add words
  // Batch insert dictionary_words
  for (const wordId of finalWordIds) {
      try {
          await admin.databases.createDocument(
              APPWRITE_DATABASE_ID,
              'dictionary_words',
              ID.unique(), // Composite key not supported, use unique ID
              {
                  dictionary_id: dictionary.$id,
                  word_id: wordId,
                  added_at: new Date().toISOString()
              }
          );
      } catch (e) {
          // Ignore errors
      }
  }

  revalidatePath("/dictionaries")
  return { ...dictionary, id: dictionary.$id }
}

export async function addWordToDictionaryByText(dictionaryId: string, text: string, translation?: string) {
  const session = await auth()
  if (!session?.user?.id) {
    return { success: false, error: "Unauthorized" }
  }
  const admin = getAdminClient();

  // Verify ownership
  try {
      const dict = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'dictionaries', dictionaryId);
      if (dict.user_id !== session.user.id) return { success: false, error: "Unauthorized" };
  } catch (e) {
      return { success: false, error: "Dictionary not found" };
  }

  let wordId: string | undefined

  const result = await lookupWordByText(text)
  if ('error' in result || !result.word) {
    if (translation) {
      // Create word manually if translation is provided
      const normalizedText = text.trim().toLowerCase()
      
      // Check existing
      const { documents: existing } = await admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'words',
          [Query.equal('text', normalizedText)]
      );
      
      if (existing.length > 0) {
          wordId = existing[0].$id
      } else {
          const newWord = await admin.databases.createDocument(
              APPWRITE_DATABASE_ID,
              'words',
              ID.unique(),
              {
                  text: normalizedText,
                  translation: translation,
                  deleted_at: null
              }
          );
          wordId = newWord.$id
      }
    } else {
      return { success: false, error: "Word not found", code: "WORD_NOT_FOUND" }
    }
  } else {
    wordId = result.word.id || undefined; // result.word.id might be null if from dictionary only
  }

  if (!wordId) {
    // Create word in DB from dictionary result
    const normalizedText = result.word!.text;
    
    // Check existing again
    const { documents: existing } = await admin.databases.listDocuments(
        APPWRITE_DATABASE_ID,
        'words',
        [Query.equal('text', normalizedText)]
    );
    
    if (existing.length > 0) {
        wordId = existing[0].$id;
    } else {
        const newWord = await admin.databases.createDocument(
            APPWRITE_DATABASE_ID,
            'words',
            ID.unique(),
            {
                text: normalizedText,
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
                deleted_at: null
            }
        );
        wordId = newWord.$id;
    }
  }

  // Add to dictionary
  // Check if exists
  const { documents: existingDictWord } = await admin.databases.listDocuments(
      APPWRITE_DATABASE_ID,
      'dictionary_words',
      [
          Query.equal('dictionary_id', dictionaryId),
          Query.equal('word_id', wordId!)
      ]
  );

  if (existingDictWord.length === 0) {
      await admin.databases.createDocument(
          APPWRITE_DATABASE_ID,
          'dictionary_words',
          ID.unique(),
          {
              dictionary_id: dictionaryId,
              word_id: wordId!,
              added_at: new Date().toISOString()
          }
      );
  }

  // Ensure UserWordStatus exists
  const { documents: existingStatus } = await admin.databases.listDocuments(
      APPWRITE_DATABASE_ID,
      'user_word_statuses',
      [
          Query.equal('user_id', session.user.id),
          Query.equal('word_id', wordId!)
      ]
  );

  if (existingStatus.length === 0) {
      await admin.databases.createDocument(
          APPWRITE_DATABASE_ID,
          'user_word_statuses',
          ID.unique(),
          {
              user_id: session.user.id,
              word_id: wordId!,
              status: 'NEW',
              updated_at: new Date().toISOString()
          }
      );
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
  const admin = getAdminClient();

  const dictionary = await admin.databases.createDocument(
      APPWRITE_DATABASE_ID,
      'dictionaries',
      ID.unique(),
      {
          name: data.name,
          description: data.description,
          is_system: data.isSystem || false,
          filter: data.filter,
          user_id: session.user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
      }
  );

  revalidatePath("/vocab")
  revalidatePath("/dictionaries")
  return { ...dictionary, id: dictionary.$id }
}

export async function getDictionaries() {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }
  const admin = getAdminClient();

  const { documents: dictionaries } = await admin.databases.listDocuments(
      APPWRITE_DATABASE_ID,
      'dictionaries',
      [
          Query.equal('user_id', session.user.id),
          Query.isNull('deleted_at'),
          Query.orderDesc('created_at')
      ]
  );

  // Fetch stats
  // This is heavy. We need words for each dictionary.
  // And statuses for those words.
  
  const result = [];
  
  for (const dict of dictionaries) {
      const { documents: dictWords } = await admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'dictionary_words',
          [Query.equal('dictionary_id', dict.$id)]
      );
      
      const wordIds = dictWords.map(dw => dw.word_id);
      const totalWords = wordIds.length;
      
      let learnedWords = 0;
      let totalReps = 0;
      let totalErrors = 0;
      
      if (totalWords > 0) {
          // Batch fetch statuses
          for (let i = 0; i < wordIds.length; i += 50) {
              const batch = wordIds.slice(i, i + 50);
              const { documents: statuses } = await admin.databases.listDocuments(
                  APPWRITE_DATABASE_ID,
                  'user_word_statuses',
                  [
                      Query.equal('user_id', session.user.id),
                      Query.equal('word_id', batch)
                  ]
              );
              
              for (const status of statuses) {
                  if (status.status !== 'NEW' && status.status !== 'UNKNOWN') {
                      learnedWords++;
                  }
                  totalReps += status.fsrs_reps || 0;
                  totalErrors += status.error_count || 0;
              }
          }
      }
      
      const learningProgress = totalWords > 0 ? (learnedWords / totalWords) * 100 : 0;
      const totalAttempts = totalReps + totalErrors;
      const accuracy = totalAttempts > 0 ? (totalReps / totalAttempts) * 100 : 0;
      
      result.push({
          id: dict.$id,
          name: dict.name,
          description: dict.description,
          isSystem: dict.is_system,
          filter: dict.filter,
          createdAt: dict.created_at,
          updatedAt: dict.updated_at,
          wordCount: totalWords,
          learningProgress,
          accuracy
      });
  }

  return result;
}

export async function getDictionary(id: string) {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }
  const admin = getAdminClient();

  try {
      const dictionary = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'dictionaries', id);
      if (dictionary.user_id !== session.user.id) throw new Error("Unauthorized");
      
      // Fetch words
      const { documents: dictWords } = await admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'dictionary_words',
          [
              Query.equal('dictionary_id', id),
              Query.orderDesc('added_at')
          ]
      );
      
      const wordIds = dictWords.map(dw => dw.word_id);
      const words: any[] = [];
      
      if (wordIds.length > 0) {
          for (let i = 0; i < wordIds.length; i += 50) {
              const batch = wordIds.slice(i, i + 50);
              const { documents: batchWords } = await admin.databases.listDocuments(
                  APPWRITE_DATABASE_ID,
                  'words',
                  [Query.equal('$id', batch)]
              );
              words.push(...batchWords);
          }
      }
      
      // Map back to structure
      const wordsWithMeta = dictWords.map(dw => {
          const w = words.find(w => w.$id === dw.word_id);
          return {
              wordId: dw.word_id,
              addedAt: dw.added_at,
              word: w ? { ...w, id: w.$id } : null
          };
      }).filter(w => w.word);

      return {
          id: dictionary.$id,
          name: dictionary.name,
          description: dictionary.description,
          isSystem: dictionary.is_system,
          filter: dictionary.filter,
          createdAt: dictionary.created_at,
          updatedAt: dictionary.updated_at,
          words: wordsWithMeta
      };
  } catch (e) {
      return null;
  }
}

export async function addWordsToDictionary(dictionaryId: string, wordIds: string[]) {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }
  const admin = getAdminClient();

  // Verify ownership
  try {
      const dict = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'dictionaries', dictionaryId);
      if (dict.user_id !== session.user.id) throw new Error("Unauthorized");
  } catch (e) {
      throw new Error("Dictionary not found");
  }

  for (const wordId of wordIds) {
      // Check if exists
      const { documents: existing } = await admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'dictionary_words',
          [
              Query.equal('dictionary_id', dictionaryId),
              Query.equal('word_id', wordId)
          ]
      );
      
      if (existing.length === 0) {
          await admin.databases.createDocument(
              APPWRITE_DATABASE_ID,
              'dictionary_words',
              ID.unique(),
              {
                  dictionary_id: dictionaryId,
                  word_id: wordId,
                  added_at: new Date().toISOString()
              }
          );
      }
  }

  revalidatePath(`/dictionaries/${dictionaryId}`)
  return { success: true }
}

export async function removeWordsFromDictionary(dictionaryId: string, wordIds: string[]) {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }
  const admin = getAdminClient();

  // Verify ownership
  try {
      const dict = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'dictionaries', dictionaryId);
      if (dict.user_id !== session.user.id) throw new Error("Unauthorized");
  } catch (e) {
      throw new Error("Dictionary not found");
  }

  for (const wordId of wordIds) {
      const { documents: existing } = await admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'dictionary_words',
          [
              Query.equal('dictionary_id', dictionaryId),
              Query.equal('word_id', wordId)
          ]
      );
      
      for (const doc of existing) {
          await admin.databases.deleteDocument(APPWRITE_DATABASE_ID, 'dictionary_words', doc.$id);
      }
  }

  revalidatePath(`/dictionaries/${dictionaryId}`)
  return { success: true }
}

export async function deleteDictionary(id: string) {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }
  const admin = getAdminClient();

  try {
      const dict = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'dictionaries', id);
      if (dict.user_id !== session.user.id) throw new Error("Unauthorized");
      
      await admin.databases.updateDocument(
          APPWRITE_DATABASE_ID,
          'dictionaries',
          id,
          { deleted_at: new Date().toISOString() }
      );
  } catch (e) {
      throw new Error("Dictionary not found");
  }

  revalidatePath("/vocab")
  revalidatePath("/dictionaries")
  return { success: true }
}

export async function restoreDictionary(id: string) {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }
  const admin = getAdminClient();

  try {
      const dict = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'dictionaries', id);
      if (dict.user_id !== session.user.id) throw new Error("Unauthorized");
      
      await admin.databases.updateDocument(
          APPWRITE_DATABASE_ID,
          'dictionaries',
          id,
          { deleted_at: null }
      );
  } catch (e) {
      throw new Error("Dictionary not found");
  }

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
  const admin = getAdminClient();

  try {
      const dict = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'dictionaries', id);
      if (dict.user_id !== session.user.id) throw new Error("Unauthorized");
      
      // Delete dictionary words first (cascade)
      // Appwrite doesn't cascade automatically unless configured.
      // We should delete dictionary_words manually to be safe.
      
      let cursor = null;
      do {
          const queries = [Query.equal('dictionary_id', id), Query.limit(100)];
          if (cursor) queries.push(Query.cursorAfter(cursor));
          
          const { documents } = await admin.databases.listDocuments(APPWRITE_DATABASE_ID, 'dictionary_words', queries);
          if (documents.length === 0) break;
          
          await Promise.all(documents.map(d => admin.databases.deleteDocument(APPWRITE_DATABASE_ID, 'dictionary_words', d.$id)));
          cursor = documents[documents.length - 1].$id;
      } while (true);

      await admin.databases.deleteDocument(APPWRITE_DATABASE_ID, 'dictionaries', id);
  } catch (e) {
      throw new Error("Dictionary not found");
  }

  revalidatePath("/trash")
  return { success: true }
}

export async function updateDictionary(id: string, data: { name?: string; description?: string }) {
  const session = await auth()
  if (!session?.user?.id) {
    throw new Error("Unauthorized")
  }
  const admin = getAdminClient();

  try {
      const dict = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'dictionaries', id);
      if (dict.user_id !== session.user.id) throw new Error("Unauthorized");
      
      const updated = await admin.databases.updateDocument(
          APPWRITE_DATABASE_ID,
          'dictionaries',
          id,
          {
              ...data,
              updated_at: new Date().toISOString()
          }
      );
      return { ...updated, id: updated.$id };
  } catch (e) {
      throw new Error("Dictionary not found");
  }

  revalidatePath("/vocab")
  revalidatePath("/dictionaries")
  revalidatePath(`/dictionaries/${id}`)
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
    const admin = getAdminClient();

    const offset = (page - 1) * pageSize;

    try {
        const queries = [
            Query.equal('user_id', session.user.id),
            Query.isNull('deleted_at')
        ];

        if (filters.search) {
            queries.push(Query.search('name', filters.search));
        }

        // Sorting
        // Map sortBy to Appwrite fields
        const sortField = sortBy === 'createdAt' ? 'created_at' : sortBy === 'updatedAt' ? 'updated_at' : 'name';
        if (sortOrder === 'asc') {
            queries.push(Query.orderAsc(sortField));
        } else {
            queries.push(Query.orderDesc(sortField));
        }
        
        // Pagination
        queries.push(Query.limit(pageSize));
        queries.push(Query.offset(offset));

        const { documents: dictionaries, total } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'dictionaries',
            queries
        );

        // Fetch stats for the dictionaries
        const data = [];
        
        for (const dict of dictionaries) {
            // Count words
            // We can use listDocuments with limit 0 to get total? No, Appwrite returns total in response.
            const { total: wordCount, documents: dictWords } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'dictionary_words',
                [Query.equal('dictionary_id', dict.$id), Query.limit(5000)] // Limit to get IDs for stats
            );
            
            let learnedWords = 0;
            let totalReps = 0;
            let totalErrors = 0;
            
            if (wordCount > 0) {
                const wordIds = dictWords.map(dw => dw.word_id);
                // Batch fetch statuses
                for (let i = 0; i < wordIds.length; i += 50) {
                    const batch = wordIds.slice(i, i + 50);
                    const { documents: statuses } = await admin.databases.listDocuments(
                        APPWRITE_DATABASE_ID,
                        'user_word_statuses',
                        [
                            Query.equal('user_id', session.user.id),
                            Query.equal('word_id', batch)
                        ]
                    );
                    
                    for (const status of statuses) {
                        if (status.status !== 'NEW' && status.status !== 'UNKNOWN') {
                            learnedWords++;
                        }
                        totalReps += status.fsrs_reps || 0;
                        totalErrors += status.error_count || 0;
                    }
                }
            }
            
            const learningProgress = wordCount > 0 ? (learnedWords / wordCount) * 100 : 0;
            const totalAttempts = totalReps + totalErrors;
            const accuracy = totalAttempts > 0 ? (totalReps / totalAttempts) * 100 : 0;
            
            data.push({
                id: dict.$id,
                name: dict.name,
                description: dict.description,
                isSystem: dict.is_system,
                filter: dict.filter,
                createdAt: dict.created_at,
                updatedAt: dict.updated_at,
                wordCount,
                learningProgress,
                accuracy
            });
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
