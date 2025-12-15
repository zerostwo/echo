import { prisma } from "@/lib/prisma"
import { supabaseAdmin } from "@/lib/supabase"
import archiver from "archiver"
import fs from "fs"
import path from "path"
import os from "os"
import { Readable } from "stream"
import { format } from "date-fns"

interface ExportOptions {
  include: {
    learning: boolean
    vocab: boolean
    dict: boolean
    materials: boolean
    user: boolean
  }
}

export async function createExportJob(userId: string, options: ExportOptions) {
  const job = await prisma.exportJob.create({
    data: {
      userId,
      options: JSON.stringify(options),
      status: "queued",
    },
  })

  // Trigger processing asynchronously (fire and forget)
  processExportJob(job.id).catch((err) => {
    console.error(`Failed to process export job ${job.id}:`, err)
  })

  return job
}

export async function getExportJobStatus(jobId: string, userId: string) {
  return prisma.exportJob.findFirst({
    where: {
      id: jobId,
      userId,
    },
  })
}

export async function getExportDownloadUrl(jobId: string, userId: string) {
  const job = await prisma.exportJob.findFirst({
    where: {
      id: jobId,
      userId,
      status: "finished",
    },
  })

  if (!job || !job.filePath) {
    throw new Error("Export not found or not ready")
  }

  if (!supabaseAdmin) {
    throw new Error("Supabase admin client not initialized")
  }

  const timestamp = format(new Date(), "yyyy-MM-dd-HH-mm")
  const filename = `echo-export-${timestamp}.zip`

  const { data, error } = await supabaseAdmin.storage
    .from(job.filePath.startsWith("exports-large/") ? "exports-large" : "exports")
    .createSignedUrl(
      job.filePath.startsWith("exports-large/") 
        ? job.filePath.replace("exports-large/", "") 
        : job.filePath, 
      3600, 
      {
        download: filename,
      }
    )

  if (error) {
    throw error
  }

  return data.signedUrl
}

export async function deleteExportJob(jobId: string, userId: string) {
  const job = await prisma.exportJob.findFirst({
    where: {
      id: jobId,
      userId,
    },
  })

  if (!job) {
    throw new Error("Export job not found")
  }

  // Delete file from Supabase if it exists
  if (job.filePath && supabaseAdmin) {
    try {
      const bucket = job.filePath.startsWith("exports-large/") ? "exports-large" : "exports"
      const path = job.filePath.startsWith("exports-large/") ? job.filePath.replace("exports-large/", "") : job.filePath
      await supabaseAdmin.storage.from(bucket).remove([path])
    } catch (error) {
      console.error("Failed to delete export file from storage:", error)
      // Continue to delete the job record even if storage deletion fails
    }
  }

  // Delete job record
  await prisma.exportJob.delete({
    where: { id: jobId },
  })
}

// Helper for BigInt serialization
const jsonStringify = (data: any) => {
  return JSON.stringify(data, (key, value) =>
    typeof value === 'bigint' ? value.toString() : value
  , 2)
}

async function processExportJob(jobId: string) {
  try {
    await prisma.exportJob.update({
      where: { id: jobId },
      data: { status: "processing" },
    })

    const job = await prisma.exportJob.findUnique({
      where: { id: jobId },
      include: { user: true },
    })

    if (!job) return

    const options = JSON.parse(job.options) as ExportOptions
    const userId = job.userId
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
      const user = await prisma.user.findUnique({ where: { id: userId } })
      if (user) {
        const userDir = path.join(tmpDir, "user")
        fs.mkdirSync(userDir, { recursive: true })
        
        // Handle Avatar
        if (user.image && !user.image.startsWith("http")) {
            // It's likely a storage path or relative path
            // If it's a full URL but from our storage, we might want to download it.
            // But usually user.image stores the public URL.
            // If we want to backup the file, we need to know the storage path.
            // Based on uploadAvatar, it returns the public URL.
            // We can try to parse the path from the URL if it matches our supabase URL.
            
            let storagePath = null;
            if (process.env.NEXT_PUBLIC_SUPABASE_URL && user.image.includes(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
                // Extract path after /storage/v1/object/public/avatars/
                const parts = user.image.split("/storage/v1/object/public/avatars/");
                if (parts.length > 1) {
                    storagePath = parts[1];
                }
            }

            if (storagePath && supabaseAdmin) {
                const ext = path.extname(storagePath) || ".png"
                const avatarFilename = `avatar${ext}`
                const avatarDest = path.join(userDir, avatarFilename)
                
                try {
                    const { data, error } = await supabaseAdmin.storage
                        .from("avatars")
                        .download(storagePath)
                    
                    if (!error && data) {
                        const buffer = await data.arrayBuffer()
                        fs.writeFileSync(avatarDest, Buffer.from(buffer))
                    }
                } catch (e) {
                    console.error("Failed to export avatar", e)
                }
            }
        }

        // Exclude sensitive data
        const { password, ...safeUser } = user
        
        // Parse settings if it's a string
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
        // Export Words (that the user has interacted with or added)
        // We can find words via UserWordStatus
        const userWordStatuses = await prisma.userWordStatus.findMany({
          where: { userId },
          include: { word: true },
        })
        
        const words = userWordStatuses.map(s => s.word)
        fs.writeFileSync(path.join(vocabDir, "words.json"), jsonStringify(words))
        
        // Export UserWordStatus
        fs.writeFileSync(path.join(vocabDir, "statuses.json"), jsonStringify(userWordStatuses))
      }

      if (options.include.learning) {
        const studyDir = path.join(tmpDir, "study")
        fs.mkdirSync(studyDir, { recursive: true })

        // Export WordReviews
        const reviews = await prisma.wordReview.findMany({
          where: { userWordStatus: { userId } },
        })
        fs.writeFileSync(path.join(studyDir, "reviews.json"), jsonStringify(reviews))

        // Export PracticeProgress
        const practices = await prisma.practiceProgress.findMany({
          where: { userId },
        })
        fs.writeFileSync(path.join(studyDir, "practices.json"), jsonStringify(practices))

        // Export DailyStudyStat
        const stats = await prisma.dailyStudyStat.findMany({
          where: { userId },
        })
        fs.writeFileSync(path.join(studyDir, "daily_stats.json"), jsonStringify(stats))
      }
    }

    // 4. Dictionaries
    if (options.include.dict) {
      const dictDir = path.join(tmpDir, "dictionaries")
      fs.mkdirSync(dictDir, { recursive: true })

      const dictionaries = await prisma.dictionary.findMany({
        where: { userId },
        include: { words: { include: { word: true } } },
      })
      fs.writeFileSync(path.join(dictDir, "dictionaries.json"), jsonStringify(dictionaries))
    }

    // 5. Materials
    if (options.include.materials) {
      const matDir = path.join(tmpDir, "materials")
      fs.mkdirSync(matDir, { recursive: true })
      const mediaDir = path.join(matDir, "media")
      fs.mkdirSync(mediaDir, { recursive: true })

      const materials = await prisma.material.findMany({
        where: { userId },
        include: { sentences: true },
      })
      
      // Write metadata
      fs.writeFileSync(path.join(matDir, "materials.json"), jsonStringify(materials))

      // Download/Copy media files
      for (const material of materials) {
        if (material.filePath) {
          const fileName = path.basename(material.filePath)
          const destPath = path.join(mediaDir, fileName)
          
          try {
            // Check if it's a local file or S3
            // Assuming if it doesn't start with http/s3, it might be local or a key
            // But usually in Supabase/S3 context, filePath might be the key.
            
            if (supabaseAdmin) {
               // Try downloading from Supabase Storage first
               const { data, error } = await supabaseAdmin.storage
                 .from("materials") // Assuming bucket name
                 .download(material.filePath)
               
               if (!error && data) {
                 const buffer = await data.arrayBuffer()
                 fs.writeFileSync(destPath, Buffer.from(buffer))
                 continue
               }
            }

            // Fallback to local file system if it exists (dev env)
            if (fs.existsSync(material.filePath)) {
              fs.copyFileSync(material.filePath, destPath)
            }
          } catch (e) {
            console.error(`Failed to export file for material ${material.id}:`, e)
          }
        }
      }
      
      // Also export Folders
      const folders = await prisma.folder.findMany({
        where: { userId },
      })
      fs.writeFileSync(path.join(matDir, "folders.json"), JSON.stringify(folders, null, 2))
    }

    // Create ZIP
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

    // Upload ZIP to Supabase
    if (!supabaseAdmin) {
        throw new Error("Supabase admin not configured")
    }

    // Use stream for upload to avoid memory issues with large files
    // const fileContent = fs.readFileSync(zipPath)
    const storagePath = `${userId}/${jobId}.zip`
    const BUCKET_NAME = "exports"

    // Helper to upload with stream
    const uploadFile = async (bucket: string, path: string, filePath: string) => {
        const fileStream = fs.createReadStream(filePath)
        // @ts-ignore - supabase-js supports stream but types might be strict
        return await supabaseAdmin.storage
            .from(bucket)
            .upload(path, fileStream, {
                contentType: "application/zip",
                upsert: true,
                duplex: 'half' // Required for Node.js streams in some environments
            })
    }

    let { error: uploadError } = await uploadFile(BUCKET_NAME, storagePath, zipPath)

    let finalFilePath = storagePath
    
    // Handle errors: Bucket not found or Size limit exceeded
    if (uploadError) {
      const isSizeLimit = (uploadError as any).statusCode === '413' || uploadError.message.includes("exceeded the maximum allowed size");
      const isNotFound = (uploadError as any).statusCode === '404' || uploadError.message.includes("Bucket not found");

      if (isNotFound) {
        console.log(`Bucket '${BUCKET_NAME}' not found. Attempting to create it...`)
        const { error: createError } = await supabaseAdmin.storage.createBucket(BUCKET_NAME, {
          public: false, // Exports should be private
          fileSizeLimit: undefined // No limit
        })

        if (createError) {
          console.error("Failed to create bucket:", createError)
          uploadError = new Error(`Failed to create bucket 'exports': ${createError.message}`) as any
        } else {
          console.log(`Bucket '${BUCKET_NAME}' created successfully. Retrying upload...`)
          await new Promise(resolve => setTimeout(resolve, 1000))
          
          const retryResult = await uploadFile(BUCKET_NAME, storagePath, zipPath)
          
          uploadError = retryResult.error
        }
      } else if (isSizeLimit) {
        console.log(`Bucket '${BUCKET_NAME}' size limit exceeded. Attempting to use 'exports-large' bucket...`)
        
        const LARGE_BUCKET = "exports-large"
        // Set a very large limit (e.g. 50GB) or null if supported, but let's use a safe large number
        const MAX_SIZE = 53687091200 // 50GB
        
        // Check if large bucket exists, if not create it
        const { data: bucketData, error: bucketError } = await supabaseAdmin.storage.getBucket(LARGE_BUCKET)
        
        if (bucketError && bucketError.message.includes("not found")) {
             console.log(`Bucket '${LARGE_BUCKET}' not found. Creating...`)
             await supabaseAdmin.storage.createBucket(LARGE_BUCKET, {
                public: false,
                fileSizeLimit: MAX_SIZE
             })
        } else {
             // Bucket exists, ensure limit is high enough
             console.log(`Bucket '${LARGE_BUCKET}' exists. Updating limit...`)
             await supabaseAdmin.storage.updateBucket(LARGE_BUCKET, {
                public: false,
                fileSizeLimit: MAX_SIZE
             })
        }

        // Upload to large bucket
        const { error: largeUploadError } = await uploadFile(LARGE_BUCKET, storagePath, zipPath)
        
        if (largeUploadError) {
            console.error("Failed to upload to large bucket:", largeUploadError)
            uploadError = largeUploadError
        } else {
            uploadError = null
            finalFilePath = `exports-large/${storagePath}`
        }
      }
    }

    if (uploadError) throw uploadError

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true })
    fs.unlinkSync(zipPath)

    // Update Job
    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: "finished",
        filePath: finalFilePath,
      },
    })

  } catch (error: any) {
    console.error("Export job failed:", error)
    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        error: error.message || "Unknown error",
      },
    })
  }
}
