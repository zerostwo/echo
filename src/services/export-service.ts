import { getAdminClient, APPWRITE_DATABASE_ID, Query } from "@/lib/appwrite"
import { ID } from "node-appwrite"
import archiver from "archiver"
import fs from "fs"
import path from "path"
import os from "os"
import { format } from "date-fns"
import { InputFile } from "node-appwrite/file"

interface ExportOptions {
  include: {
    learning: boolean
    vocab: boolean
    dict: boolean
    materials: boolean
    user: boolean
  }
}

const EXPORT_BUCKET_ID = 'exports';

export async function createExportJob(userId: string, options: ExportOptions) {
  const admin = getAdminClient();
  
  // Note: Appwrite auto-manages $createdAt
  const job = await admin.databases.createDocument(
    APPWRITE_DATABASE_ID,
    'export_jobs',
    ID.unique(),
    {
      user_id: userId,
      options: JSON.stringify(options),
      status: "queued"
    }
  );

  // Trigger processing asynchronously (fire and forget)
  processExportJob(job.$id).catch((err) => {
    console.error(`Failed to process export job ${job.$id}:`, err)
  })

  return {
      id: job.$id,
      userId: job.user_id,
      status: job.status,
      options: job.options
  };
}

export async function getExportJobStatus(jobId: string, userId: string) {
  const admin = getAdminClient();
  try {
      const job = await admin.databases.getDocument(
          APPWRITE_DATABASE_ID,
          'export_jobs',
          jobId
      );
      
      if (job.user_id !== userId) return null;
      
      return {
          id: job.$id,
          userId: job.user_id,
          status: job.status,
          options: job.options,
          filePath: job.file_path,
          error: job.error
      };
  } catch (e) {
      return null;
  }
}

export async function getExportDownloadUrl(jobId: string, userId: string) {
  const admin = getAdminClient();
  
  const job = await admin.databases.getDocument(
      APPWRITE_DATABASE_ID,
      'export_jobs',
      jobId
  );

  if (!job || job.user_id !== userId || job.status !== "finished" || !job.file_path) {
    throw new Error("Export not found or not ready")
  }

  // Return a proxy URL that will handle the download
  return `/api/export/download/${jobId}`;
}

export async function deleteExportJob(jobId: string, userId: string) {
  const admin = getAdminClient();
  
  const job = await admin.databases.getDocument(
      APPWRITE_DATABASE_ID,
      'export_jobs',
      jobId
  );

  if (!job || job.user_id !== userId) {
    throw new Error("Export job not found")
  }

  // Delete file from Appwrite Storage if it exists
  if (job.file_path) {
    try {
      await admin.storage.deleteFile(EXPORT_BUCKET_ID, job.file_path);
    } catch (error) {
      console.error("Failed to delete export file from storage:", error)
    }
  }

  // Delete job record
  await admin.databases.deleteDocument(
      APPWRITE_DATABASE_ID,
      'export_jobs',
      jobId
  );
}

// Helper for BigInt serialization
const jsonStringify = (data: any) => {
  return JSON.stringify(data, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  , 2)
}

async function processExportJob(jobId: string) {
  const admin = getAdminClient();
  
  try {
    await admin.databases.updateDocument(
        APPWRITE_DATABASE_ID,
        'export_jobs',
        jobId,
        { status: "processing" }
    );

    const job = await admin.databases.getDocument(
        APPWRITE_DATABASE_ID,
        'export_jobs',
        jobId
    );

    const options = JSON.parse(job.options) as ExportOptions
    const userId = job.user_id
    const tmpDir = path.join(os.tmpdir(), `echo-export-${jobId}`)
    
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true })
    }

    // 1. Metadata
    const metadata = {
      version: "1.0",
      exportedAt: new Date().toISOString(),
      userId: userId,
      options: options,
    }
    fs.writeFileSync(path.join(tmpDir, "metadata.json"), jsonStringify(metadata))

    // 2. User Data (Basic info)
    if (options.include.user) {
      const user = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'users', userId);
      
      if (user) {
        const userDir = path.join(tmpDir, "user")
        fs.mkdirSync(userDir, { recursive: true })
        
        // Handle Avatar
        if (user.image) {
            let fileId = null;
            const bucketId = 'avatars'; 
            
            if (user.image.includes('/files/')) {
                const match = user.image.match(/\/files\/([^\/]+)\//);
                if (match) fileId = match[1];
            } else if (!user.image.startsWith('http')) {
                fileId = user.image;
            }

            if (fileId) {
                const avatarDest = path.join(userDir, `avatar.png`) 
                try {
                    const buffer = await admin.storage.getFileDownload(bucketId, fileId);
                    fs.writeFileSync(avatarDest, Buffer.from(buffer));
                } catch (e) {
                    console.error("Failed to export avatar", e)
                }
            }
        }

        const { password, ...safeUser } = user
        
        let userDataToSave: any = { ...safeUser }
        try {
            if (typeof userDataToSave.settings === 'string') {
                userDataToSave.settings = JSON.parse(userDataToSave.settings)
            }
        } catch (e) {}

        fs.writeFileSync(path.join(userDir, "user.json"), jsonStringify(userDataToSave))
      }
    }

    // 3. Vocabulary & Learning Progress
    if (options.include.vocab || options.include.learning) {
      const vocabDir = path.join(tmpDir, "vocabulary")
      fs.mkdirSync(vocabDir, { recursive: true })

      if (options.include.vocab) {
        let allStatuses: any[] = [];
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
            allStatuses.push(...documents);
            cursor = documents[documents.length - 1].$id;
            if (documents.length < 100) break;
        }
        
        const wordIds = allStatuses.map(s => s.word_id);
        const uniqueWordIds = Array.from(new Set(wordIds));
        
        let allWords: any[] = [];
        for (let i = 0; i < uniqueWordIds.length; i += 100) {
            const batch = uniqueWordIds.slice(i, i + 100);
            const { documents } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'words',
                [Query.equal('$id', batch)]
            );
            allWords.push(...documents);
        }

        fs.writeFileSync(path.join(vocabDir, "words.json"), jsonStringify(allWords))
        fs.writeFileSync(path.join(vocabDir, "statuses.json"), jsonStringify(allStatuses))
      }

      if (options.include.learning) {
        const studyDir = path.join(tmpDir, "study")
        fs.mkdirSync(studyDir, { recursive: true })

        let allReviews: any[] = [];
        let cursor = null;
        while (true) {
             const queries = [
                Query.equal('user_id', userId),
                Query.limit(100)
            ];
            if (cursor) queries.push(Query.cursorAfter(cursor));
            
            const { documents } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'word_reviews',
                queries
            );
            if (documents.length === 0) break;
            allReviews.push(...documents);
            cursor = documents[documents.length - 1].$id;
            if (documents.length < 100) break;
        }
        fs.writeFileSync(path.join(studyDir, "reviews.json"), jsonStringify(allReviews))

        const { documents: practices } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'practice_progress',
            [Query.equal('user_id', userId)]
        );
        fs.writeFileSync(path.join(studyDir, "practices.json"), jsonStringify(practices))

        const { documents: stats } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'daily_study_stats',
            [Query.equal('user_id', userId)]
        );
        fs.writeFileSync(path.join(studyDir, "daily_stats.json"), jsonStringify(stats))
      }
    }

    // 4. Dictionaries
    if (options.include.dict) {
      const dictDir = path.join(tmpDir, "dictionaries")
      fs.mkdirSync(dictDir, { recursive: true })

      const { documents: dictionaries } = await admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'dictionaries',
          [Query.equal('user_id', userId)]
      );
      
      const fullDictionaries = [];
      for (const dict of dictionaries) {
          const { documents: dictWords } = await admin.databases.listDocuments(
              APPWRITE_DATABASE_ID,
              'dictionary_words',
              [Query.equal('dictionary_id', dict.$id)]
          );
          fullDictionaries.push({
              ...dict,
              words: dictWords
          });
      }
      
      fs.writeFileSync(path.join(dictDir, "dictionaries.json"), jsonStringify(fullDictionaries))
    }

    // 5. Materials
    if (options.include.materials) {
      const matDir = path.join(tmpDir, "materials")
      fs.mkdirSync(matDir, { recursive: true })
      const mediaDir = path.join(matDir, "media")
      fs.mkdirSync(mediaDir, { recursive: true })

      const { documents: materials } = await admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'materials',
          [Query.equal('user_id', userId)]
      );
      
      const fullMaterials = [];
      for (const mat of materials) {
          const { documents: sentences } = await admin.databases.listDocuments(
              APPWRITE_DATABASE_ID,
              'sentences',
              [Query.equal('material_id', mat.$id)]
          );
          fullMaterials.push({
              ...mat,
              sentences
          });

          if (mat.file_id) { 
              const destPath = path.join(mediaDir, `${mat.$id}_${mat.filename || 'file'}`)
              try {
                  const buffer = await admin.storage.getFileDownload('materials', mat.file_id);
                  fs.writeFileSync(destPath, Buffer.from(buffer));
              } catch (e) {
                  console.error(`Failed to export file for material ${mat.$id}:`, e)
              }
          }
      }
      
      fs.writeFileSync(path.join(matDir, "materials.json"), jsonStringify(fullMaterials))
      
      const { documents: folders } = await admin.databases.listDocuments(
          APPWRITE_DATABASE_ID,
          'folders',
          [Query.equal('user_id', userId)]
      );
      fs.writeFileSync(path.join(matDir, "folders.json"), JSON.stringify(folders, null, 2))
    }

    const zipPath = path.join(os.tmpdir(), `export-${jobId}.zip`)
    const output = fs.createWriteStream(zipPath)
    const archive = archiver("zip", { zlib: { level: 9 } })

    await new Promise<void>((resolve, reject) => {
      output.on("close", resolve)
      archive.on("error", reject)
      archive.pipe(output)
      archive.directory(tmpDir, false)
      archive.finalize()
    })

    try {
        await admin.storage.getBucket(EXPORT_BUCKET_ID);
    } catch (e) {
        await admin.storage.createBucket(EXPORT_BUCKET_ID, 'Exports', [], false, true, undefined, ['zip']);
    }

    const fileId = ID.unique();
    const inputFile = InputFile.fromPath(zipPath, `export-${jobId}.zip`);
    
    const file = await admin.storage.createFile(
        EXPORT_BUCKET_ID,
        fileId,
        inputFile,
        [
            `user:${userId}` 
        ]
    );

    fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.unlinkSync(zipPath)

    await admin.databases.updateDocument(
        APPWRITE_DATABASE_ID,
        'export_jobs',
        jobId,
        {
            status: "finished",
            file_path: file.$id, 
        }
    );

  } catch (error: any) {
    console.error("Export job failed:", error)
    await admin.databases.updateDocument(
        APPWRITE_DATABASE_ID,
        'export_jobs',
        jobId,
        {
            status: "failed",
            error: error.message || "Unknown error",
        }
    );
  }
}
