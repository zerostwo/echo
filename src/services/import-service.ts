import { getAdminClient, APPWRITE_DATABASE_ID, Query } from "@/lib/appwrite"
import { ID } from "node-appwrite"
import AdmZip from "adm-zip"
import fs from "fs"
import path from "path"
import os from "os"
import { InputFile } from "node-appwrite/file"

interface ImportOptions {
  mode: "merge" | "overwrite"
}

const EXPORT_BUCKET_ID = 'exports';

export async function createImportJob(userId: string, filePath: string, mode: "merge" | "overwrite") {
  const admin = getAdminClient();
  
  const job = await admin.databases.createDocument(
    APPWRITE_DATABASE_ID,
    'import_jobs',
    ID.unique(),
    {
      user_id: userId,
      file_path: filePath,
      status: "queued",
    }
  );

  // Trigger processing asynchronously
  processImportJob(job.$id, mode).catch((err) => {
    console.error(`Failed to process import job ${job.$id}:`, err)
  })

  return {
      id: job.$id,
      userId: job.user_id,
      status: job.status,
      filePath: job.file_path
  };
}

export async function getImportJobStatus(jobId: string, userId: string) {
  const admin = getAdminClient();
  try {
      const job = await admin.databases.getDocument(
          APPWRITE_DATABASE_ID,
          'import_jobs',
          jobId
      );
      
      if (job.user_id !== userId) return null;
      
      return {
          id: job.$id,
          userId: job.user_id,
          status: job.status,
          error: job.error
      };
  } catch (e) {
      return null;
  }
}

async function processImportJob(jobId: string, mode: "merge" | "overwrite") {
  const admin = getAdminClient();
  
  try {
    await admin.databases.updateDocument(
        APPWRITE_DATABASE_ID,
        'import_jobs',
        jobId,
        { status: "processing" }
    );

    const job = await admin.databases.getDocument(
        APPWRITE_DATABASE_ID,
        'import_jobs',
        jobId
    );

    if (!job || !job.file_path) return

    const userId = job.user_id
    const tmpDir = path.join(os.tmpdir(), `echo-import-${jobId}`)
    
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }

    // Download ZIP
    const fileId = job.file_path;
    let zipPath = path.join(tmpDir, "import.zip")
    
    try {
        const buffer = await admin.storage.getFileDownload(EXPORT_BUCKET_ID, fileId);
        fs.writeFileSync(zipPath, Buffer.from(buffer));
    } catch (e) {
        throw new Error(`Failed to download import file: ${e}`);
    }

    // Extract
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(tmpDir, true)

    // Read Metadata
    const metadataPath = path.join(tmpDir, "metadata.json")
    if (!fs.existsSync(metadataPath)) {
      throw new Error("Invalid export: metadata.json missing")
    }
    const metadata = JSON.parse(fs.readFileSync(metadataPath, "utf-8"))

    // Helper to read JSON
    const readJson = (p: string) => {
      const fullPath = path.join(tmpDir, p)
      if (fs.existsSync(fullPath)) {
        return JSON.parse(fs.readFileSync(fullPath, "utf-8"))
      }
      return null
    }

    // --- RESTORE USER SETTINGS & AVATAR ---
    const userData = readJson("user/user.json")
    if (userData) {
        // Restore Settings
        if (userData.settings) {
            let settingsStr = userData.settings
            if (typeof settingsStr !== 'string') {
                settingsStr = JSON.stringify(settingsStr)
            }
            
            await admin.databases.updateDocument(
                APPWRITE_DATABASE_ID,
                'users',
                userId,
                { settings: settingsStr }
            );
        }

        // Restore Avatar
        const userDir = path.join(tmpDir, "user")
        if (fs.existsSync(userDir)) {
            const files = fs.readdirSync(userDir)
            const avatarFile = files.find(f => f.startsWith("avatar."))
            
            if (avatarFile) {
                const avatarPath = path.join(userDir, avatarFile)
                const ext = path.extname(avatarFile).substring(1) || "png"
                const filename = `avatar-${Date.now()}.${ext}`
                const BUCKET_NAME = "avatars"

                // Ensure bucket exists
                try {
                    await admin.storage.getBucket(BUCKET_NAME);
                } catch (e) {
                    await admin.storage.createBucket(BUCKET_NAME, 'Avatars', [], true, true, undefined, ['jpg', 'png', 'jpeg', 'gif', 'webp']);
                }

                const inputFile = InputFile.fromPath(avatarPath, filename);
                
                const file = await admin.storage.createFile(
                    BUCKET_NAME,
                    ID.unique(),
                    inputFile
                );
                
                await admin.databases.updateDocument(
                    APPWRITE_DATABASE_ID,
                    'users',
                    userId,
                    { image: file.$id }
                );
            }
        }
    }

    // --- OVERWRITE MODE: DELETE EXISTING DATA ---
    if (mode === "overwrite") {
        // Helper to delete all documents in a collection for a user
        const deleteForUser = async (collectionId: string, userIdField: string = 'user_id') => {
            let cursor = null;
            while (true) {
                const queries = [
                    Query.equal(userIdField, userId),
                    Query.limit(100)
                ];
                if (cursor) queries.push(Query.cursorAfter(cursor));
                
                const { documents } = await admin.databases.listDocuments(
                    APPWRITE_DATABASE_ID,
                    collectionId,
                    queries
                );
                
                if (documents.length === 0) break;
                
                await Promise.all(documents.map(doc => 
                    admin.databases.deleteDocument(APPWRITE_DATABASE_ID, collectionId, doc.$id)
                ));
                
                if (documents.length < 100) break;
            }
        };

        // 1. Study Logs
        let statusIds: string[] = [];
        let cursor = null;
        while (true) {
            const queries = [
                Query.equal('user_id', userId),
                Query.limit(100)
            ];
            if (cursor) queries.push(Query.cursorAfter(cursor));
            const { documents } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'user_word_statuses',
                queries
            );
            if (documents.length === 0) break;
            statusIds.push(...documents.map(d => d.$id));
            cursor = documents[documents.length - 1].$id;
            if (documents.length < 100) break;
        }
        
        for (let i = 0; i < statusIds.length; i += 50) {
            const batch = statusIds.slice(i, i + 50);
            const { documents: reviews } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'word_reviews',
                [Query.equal('user_word_status_id', batch)]
            );
            await Promise.all(reviews.map(r => admin.databases.deleteDocument(APPWRITE_DATABASE_ID, 'word_reviews', r.$id)));
        }

        await deleteForUser('practice_progress');
        await deleteForUser('daily_study_stats');
        
        // 2. User Word Statuses
        await deleteForUser('user_word_statuses');
        
        // 3. Materials & Folders
        const { documents: materials } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'materials',
            [Query.equal('user_id', userId)]
        );
        const materialIds = materials.map(m => m.$id);
        
        for (let i = 0; i < materialIds.length; i += 50) {
            const batch = materialIds.slice(i, i + 50);
            const { documents: sentences } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'sentences',
                [Query.equal('material_id', batch)]
            );
            await Promise.all(sentences.map(s => admin.databases.deleteDocument(APPWRITE_DATABASE_ID, 'sentences', s.$id)));
        }

        await deleteForUser('materials');
        await deleteForUser('folders');
        
        // 4. Dictionaries
        await deleteForUser('dictionaries');
    }

    // --- IMPORT PROCESS ---
    
    // 1. Vocabulary (Words & Statuses)
    const words = readJson("vocabulary/words.json")
    const statuses = readJson("vocabulary/statuses.json")
    
    const wordIdMap = new Map<string, string>() // Old ID -> New ID (or Existing ID)

    if (words) {
        for (const w of words) {
            // Check if word exists by text
            const { documents } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'words',
                [Query.equal('text', w.text)]
            );
            
            let wordId;
            if (documents.length > 0) {
                wordId = documents[0].$id;
            } else {
                // Create word
                const { $id, $createdAt, $updatedAt, ...data } = w;
                // Clean data
                const cleanData = {
                    text: data.text,
                    phonetic: data.phonetic,
                    translation: data.translation,
                    pos: data.pos,
                    definition: data.definition,
                };
                
                const newWord = await admin.databases.createDocument(
                    APPWRITE_DATABASE_ID,
                    'words',
                    ID.unique(),
                    cleanData
                );
                wordId = newWord.$id;
            }
            wordIdMap.set(w.$id || w.id, wordId)
        }
    }

    if (statuses) {
        for (const s of statuses) {
            const oldWordId = s.word_id || s.wordId; // Handle different casing if needed
            const newWordId = wordIdMap.get(oldWordId)
            if (!newWordId) continue

            const { $id, $createdAt, $updatedAt, user_id, word_id, ...data } = s
            
            // Check if status exists
            const { documents } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'user_word_statuses',
                [
                    Query.equal('user_id', userId),
                    Query.equal('word_id', newWordId)
                ]
            );

            if (documents.length > 0) {
                // Update
                await admin.databases.updateDocument(
                    APPWRITE_DATABASE_ID,
                    'user_word_statuses',
                    documents[0].$id,
                    data
                );
            } else {
                // Create
                await admin.databases.createDocument(
                    APPWRITE_DATABASE_ID,
                    'user_word_statuses',
                    ID.unique(),
                    {
                        ...data,
                        user_id: userId,
                        word_id: newWordId
                    }
                );
            }
        }
    }

    // 2. Dictionaries
    const dictionaries = readJson("dictionaries/dictionaries.json")
    if (dictionaries) {
        for (const d of dictionaries) {
            const { $id, $createdAt, $updatedAt, user_id, words: dictWords, ...data } = d
            
            // Find or create dictionary
            const { documents } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'dictionaries',
                [
                    Query.equal('user_id', userId),
                    Query.equal('name', data.name)
                ]
            );
            
            let dictId;
            if (documents.length > 0) {
                dictId = documents[0].$id;
            } else {
                const newDict = await admin.databases.createDocument(
                    APPWRITE_DATABASE_ID,
                    'dictionaries',
                    ID.unique(),
                    { ...data, user_id: userId }
                );
                dictId = newDict.$id;
            }

            // Add words to dictionary
            if (dictWords) {
                for (const dw of dictWords) {
                    const oldWordId = dw.word_id || dw.wordId;
                    const newWordId = wordIdMap.get(oldWordId)
                    
                    if (newWordId) {
                        // Check if exists
                        const { documents: existingDW } = await admin.databases.listDocuments(
                            APPWRITE_DATABASE_ID,
                            'dictionary_words',
                            [
                                Query.equal('dictionary_id', dictId),
                                Query.equal('word_id', newWordId)
                            ]
                        );
                        
                        if (existingDW.length === 0) {
                            await admin.databases.createDocument(
                                APPWRITE_DATABASE_ID,
                                'dictionary_words',
                                ID.unique(),
                                {
                                    dictionary_id: dictId,
                                    word_id: newWordId
                                }
                            );
                        }
                    }
                }
            }
        }
    }

    // 3. Materials & Folders
    const folders = readJson("materials/folders.json")
    const folderIdMap = new Map<string, string>()
    const sentenceIdMap = new Map<string, string>()

    if (folders) {
        for (const f of folders) {
            const { $id, $createdAt, $updatedAt, user_id, parent_id, children, materials, ...data } = f
            
            // Try to find existing folder by name
            const { documents } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'folders',
                [
                    Query.equal('user_id', userId),
                    Query.equal('name', data.name),
                    Query.isNull('parent_id') // Simplified
                ]
            );
            
            let folderId;
            if (documents.length > 0 && mode === "merge") {
                folderId = documents[0].$id;
            } else {
                 const newFolder = await admin.databases.createDocument(
                    APPWRITE_DATABASE_ID,
                    'folders',
                    ID.unique(),
                    { ...data, user_id: userId, parent_id: null }
                 );
                 folderId = newFolder.$id;
            }
            folderIdMap.set($id || f.id, folderId)
        }
        
        // Fix parents
        for (const f of folders) {
            const oldParentId = f.parent_id || f.parentId;
            if (oldParentId && folderIdMap.has(oldParentId)) {
                const newId = folderIdMap.get(f.$id || f.id)
                const newParentId = folderIdMap.get(oldParentId)
                if (newId && newParentId) {
                    await admin.databases.updateDocument(
                        APPWRITE_DATABASE_ID,
                        'folders',
                        newId,
                        { parent_id: newParentId }
                    );
                }
            }
        }
    }

    const materials = readJson("materials/materials.json")
    if (materials) {
        for (const m of materials) {
            const { $id, $createdAt, $updatedAt, user_id, folder_id, sentences, ...data } = m
            
            // Check if exists
            const { documents: existing } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'materials',
                [
                    Query.equal('user_id', userId),
                    Query.equal('title', data.title)
                ]
            );
            
            if (existing.length > 0 && mode === "merge") continue 

            // Handle Media File
            let fileId = data.file_id;
            // If we have a local file for this material
            const fileName = data.filename || 'file';
            const localMedia = path.join(tmpDir, "materials", "media", `${$id}_${fileName}`)
            
            if (fs.existsSync(localMedia)) {
                // Upload to storage
                const inputFile = InputFile.fromPath(localMedia, fileName);
                
                try {
                    const file = await admin.storage.createFile(
                        'materials',
                        ID.unique(),
                        inputFile
                    );
                    fileId = file.$id;
                } catch (e) {
                    console.error("Failed to upload material file", e);
                }
            }

            const oldFolderId = folder_id || m.folderId;
            const newFolderId = oldFolderId ? folderIdMap.get(oldFolderId) : null

            const material = await admin.databases.createDocument(
                APPWRITE_DATABASE_ID,
                'materials',
                ID.unique(),
                {
                    ...data,
                    user_id: userId,
                    folder_id: newFolderId,
                    file_id: fileId,
                }
            );

            // Create sentences
            if (sentences && Array.isArray(sentences)) {
                for (const s of sentences) {
                    const { $id: oldSentenceId, $createdAt, $updatedAt, material_id, ...sData } = s
                    const newSentence = await admin.databases.createDocument(
                        APPWRITE_DATABASE_ID,
                        'sentences',
                        ID.unique(),
                        {
                            ...sData,
                            material_id: material.$id
                        }
                    );
                    sentenceIdMap.set(oldSentenceId || s.id, newSentence.$id)
                }
            }
        }
    }

    // 4. Study Logs (Append)
    const reviews = readJson("study/reviews.json")
    if (reviews) {
        // Build OldStatusID -> WordID map from statuses.json
        const statusWordMap = new Map<string, string>()
        if (statuses) {
            statuses.forEach((s: any) => statusWordMap.set(s.$id || s.id, s.word_id || s.wordId))
        }

        for (const r of reviews) {
            const oldStatusId = r.user_word_status_id || r.userWordStatusId
            const oldWordId = statusWordMap.get(oldStatusId)
            if (!oldWordId) continue

            const newWordId = wordIdMap.get(oldWordId)
            if (!newWordId) continue

            const { documents: newStatus } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'user_word_statuses',
                [
                    Query.equal('user_id', userId),
                    Query.equal('word_id', newWordId)
                ]
            );

            if (newStatus.length > 0) {
                const { $id, $createdAt, $updatedAt, user_word_status_id, ...data } = r
                await admin.databases.createDocument(
                    APPWRITE_DATABASE_ID,
                    'word_reviews',
                    ID.unique(),
                    {
                        ...data,
                        user_word_status_id: newStatus[0].$id
                    }
                );
            }
        }
    }

    // 5. Practice Progress
    const practices = readJson("study/practices.json")
    if (practices) {
        for (const p of practices) {
            const { $id, $createdAt, $updatedAt, user_id, sentence_id, ...data } = p
            const oldSentenceId = sentence_id || p.sentenceId;
            const newSentenceId = sentenceIdMap.get(oldSentenceId)
            
            if (newSentenceId) {
                // Check if exists
                const { documents } = await admin.databases.listDocuments(
                    APPWRITE_DATABASE_ID,
                    'practice_progress',
                    [
                        Query.equal('user_id', userId),
                        Query.equal('sentence_id', newSentenceId)
                    ]
                );
                
                if (documents.length > 0) {
                    await admin.databases.updateDocument(
                        APPWRITE_DATABASE_ID,
                        'practice_progress',
                        documents[0].$id,
                        data
                    );
                } else {
                    await admin.databases.createDocument(
                        APPWRITE_DATABASE_ID,
                        'practice_progress',
                        ID.unique(),
                        {
                            ...data,
                            user_id: userId,
                            sentence_id: newSentenceId
                        }
                    );
                }
            }
        }
    }

    // 6. Daily Stats
    const stats = readJson("study/daily_stats.json")
    if (stats) {
        for (const s of stats) {
            const { $id, $createdAt, $updatedAt, user_id, date, ...data } = s
            
            const { documents } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'daily_study_stats',
                [
                    Query.equal('user_id', userId),
                    Query.equal('date', date)
                ]
            );
            
            if (documents.length > 0) {
                await admin.databases.updateDocument(
                    APPWRITE_DATABASE_ID,
                    'daily_study_stats',
                    documents[0].$id,
                    data
                );
            } else {
                await admin.databases.createDocument(
                    APPWRITE_DATABASE_ID,
                    'daily_study_stats',
                    ID.unique(),
                    {
                        ...data,
                        user_id: userId,
                        date: date
                    }
                );
            }
        }
    }

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
    if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath)

    await admin.databases.updateDocument(
        APPWRITE_DATABASE_ID,
        'import_jobs',
        jobId,
        { status: "finished" }
    );

  } catch (error: any) {
    console.error("Import job failed:", error)
    await admin.databases.updateDocument(
        APPWRITE_DATABASE_ID,
        'import_jobs',
        jobId,
        {
            status: "failed",
            error: error.message || "Unknown error",
        }
    );
  }
}
