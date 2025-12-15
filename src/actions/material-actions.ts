'use server';

import { auth } from '@/auth';
import { getAdminClient, APPWRITE_DATABASE_ID, Query } from '@/lib/appwrite';
import { ID, Permission, Role } from 'node-appwrite';
import { InputFile } from 'node-appwrite/file';
import { writeFile, unlink } from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { transcribeFile } from '@/services/transcription';
import { extractVocabulary } from './vocab-actions';
import { createNotification } from './notification-actions';
import { startOfDay } from 'date-fns';
import os from 'os';
import { randomUUID } from 'crypto';
import { 
  getCached, 
  setCached, 
  generateCacheKey, 
  CACHE_KEYS,
  invalidateMaterialsCache,
  invalidateVocabCache
} from '@/lib/redis';

const MATERIALS_BUCKET = 'materials';
const INTERNAL_REVALIDATE_TOKEN = process.env.INTERNAL_REVALIDATE_TOKEN;
const safeRevalidate = (paths: string[]) => {
    for (const path of paths) {
        try {
            revalidatePath(path);
        } catch (err) {
            console.warn(`[revalidate] Failed for ${path}:`, err);
        }
    }
};
const revalidateInBackground = async (paths: string[]) => {
    const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL ||
        process.env.SITE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : `http://localhost:${process.env.PORT || 3000}`);

    try {
        await fetch(`${baseUrl}/api/revalidate-paths`, {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                ...(INTERNAL_REVALIDATE_TOKEN ? { 'x-revalidate-token': INTERNAL_REVALIDATE_TOKEN } : {}),
            },
            body: JSON.stringify({ paths }),
        });
    } catch (err) {
        console.warn('[revalidate] Background revalidation failed:', err);
    }
};
const duplicateDateFormatter = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
});

async function ensureMaterialsBucket() {
    const admin = getAdminClient();

    try {
        await admin.storage.getBucket(MATERIALS_BUCKET);
        return { success: true };
    } catch (error: any) {
        if (error.code !== 404) {
             console.error(`Failed to check bucket '${MATERIALS_BUCKET}':`, error);
             return { error: 'Failed to check storage bucket' };
        }
    }

    try {
        await admin.storage.createBucket(
            MATERIALS_BUCKET,
            'Materials',
            [], // permissions
            false, // fileSecurity
            true, // enabled
            524288000 // max file size
        );
    } catch (createError) {
        console.error(`Failed to create bucket '${MATERIALS_BUCKET}':`, createError);
        return { error: 'Failed to create storage bucket' };
    }

    return { success: true };
}

export async function registerUploadedMaterial(
    fileUrl: string, 
    filename: string, 
    fileType: string, 
    size: number,
    folderId?: string | null
) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        const admin = getAdminClient();
        const materialId = ID.unique();
        
        const material = await admin.databases.createDocument(
            APPWRITE_DATABASE_ID,
            'materials',
            materialId,
            {
                title: path.parse(filename).name,
                filename: filename,
                file_path: fileUrl, // Storing URL in filePath
                size: size,
                user_id: session.user.id,
                mime_type: fileType,
                folder_id: folderId || null,
                updated_at: new Date().toISOString()
            }
        );

        // Update usage
        const userDoc = await admin.databases.getDocument(
            APPWRITE_DATABASE_ID,
            'users',
            session.user.id
        );
            
        if (userDoc) {
             await admin.databases.updateDocument(
                APPWRITE_DATABASE_ID,
                'users',
                session.user.id,
                { used_space: (userDoc.used_space || 0) + size }
             );
        }

        // Invalidate cache
        await invalidateMaterialsCache(session.user.id);
        
        revalidatePath('/materials');
        revalidatePath('/dashboard');
        return { success: true, materialId: material.$id };
    } catch (e) {
        console.error("Register upload error:", e);
        return { error: 'Failed to register upload' };
    }
}

export async function uploadMaterial(formData: FormData) {
  const session = await auth();
  if (!session?.user?.id) {
      return { error: 'Unauthorized' };
  }

  const file = formData.get('file') as File;
  const folderId = formData.get('folderId') as string; // Support uploading to folder

  if (!file || file.size === 0) {
      return { error: 'No file provided' };
  }

  const isAudio = file.type?.startsWith('audio/');
  const isVideo = file.type?.startsWith('video/');
  if (!isAudio && !isVideo) {
      return { error: 'Only audio or video files can be uploaded' };
  }

  const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB
  if (file.size > MAX_FILE_SIZE) {
      return { error: 'File size must be less than 500MB' };
  }

  const size = file.size;
  const baseTitle = path.parse(file.name).name;

  const admin = getAdminClient();

  // Check for duplicate uploads before storing
  const { documents: duplicateByTitleDocs } = await admin.databases.listDocuments(
    APPWRITE_DATABASE_ID,
    'materials',
    [
        Query.equal('user_id', session.user.id),
        Query.equal('title', baseTitle),
        Query.isNull('deleted_at')
    ]
  );
  const duplicateByTitle = duplicateByTitleDocs[0];

  if (duplicateByTitle) {
    const createdAt = duplicateByTitle.$createdAt
      ? duplicateDateFormatter.format(new Date(duplicateByTitle.$createdAt))
      : 'previously';
    return { 
      error: `Duplicate material. "${duplicateByTitle.title}" already exists (uploaded ${createdAt}).`,
      duplicateMaterialId: duplicateByTitle.$id 
    };
  }

  const { documents: duplicateBySizeDocs } = await admin.databases.listDocuments(
    APPWRITE_DATABASE_ID,
    'materials',
    [
        Query.equal('user_id', session.user.id),
        Query.equal('size', size),
        Query.equal('mime_type', file.type),
        Query.isNull('deleted_at')
    ]
  );
  const duplicateBySize = duplicateBySizeDocs[0];

  if (duplicateBySize) {
    const createdAt = duplicateBySize.$createdAt
      ? duplicateDateFormatter.format(new Date(duplicateBySize.$createdAt))
      : 'previously';
    return { 
      error: `Duplicate material. "${duplicateBySize.title}" with the same file size already exists (uploaded ${createdAt}).`,
      duplicateMaterialId: duplicateBySize.$id 
    };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueFilename = `${Date.now()}-${safeFilename}`;

    // Check quota
    const userDoc = await admin.databases.getDocument(
        APPWRITE_DATABASE_ID,
        'users',
        session.user.id
    );
    
    if (!userDoc) return { error: 'User not found' };
    
    const currentUsed = userDoc.used_space || 0;
    const quota = userDoc.quota || 0;

    if (currentUsed + size > quota) {
        return { error: 'Storage quota exceeded' };
    }

    // Ensure bucket exists (requires admin client)
    const bucketResult = await ensureMaterialsBucket();
    if (bucketResult.error) {
        return { error: bucketResult.error };
    }

    // Save file to Appwrite Storage
    const fileId = ID.unique();
    const BUCKET_NAME = MATERIALS_BUCKET;
    
    await admin.storage.createFile(
        BUCKET_NAME,
        fileId,
        InputFile.fromBuffer(buffer, uniqueFilename),
        [Permission.read(Role.user(session.user.id))]
    );

    // Create DB record
    const materialId = ID.unique();
    const material = await admin.databases.createDocument(
        APPWRITE_DATABASE_ID,
        'materials',
        materialId,
        {
          title: path.parse(file.name).name,
          filename: uniqueFilename,
          file_path: fileId, // Store File ID
          size: size,
          user_id: session.user.id,
          mime_type: file.type,
          folder_id: folderId || null,
          updated_at: new Date().toISOString()
        }
    );

    // Update usage
    await admin.databases.updateDocument(
        APPWRITE_DATABASE_ID,
        'users',
        session.user.id,
        { used_space: currentUsed + size }
    );

    // Create notification for upload
    await createNotification(
      session.user.id,
      'MATERIAL_UPLOADED',
      'Material Uploaded',
      `"${path.parse(file.name).name}" has been successfully uploaded and is ready for transcription.`,
      material.$id,
      'material'
    );

    // Invalidate cache
    await invalidateMaterialsCache(session.user.id);

    revalidatePath('/materials');
    revalidatePath('/dashboard');
    return { success: true, materialId: material.$id };
  } catch (e) {
      console.error("Upload error:", e);
      return { error: 'Upload failed' };
  }
}

export async function deleteMaterial(materialId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        const admin = getAdminClient();
        
        const material = await admin.databases.getDocument(
            APPWRITE_DATABASE_ID,
            'materials',
            materialId
        );

        if (!material || material.user_id !== session.user.id) return { error: 'Material not found' };

        // Soft delete
        await admin.databases.updateDocument(
            APPWRITE_DATABASE_ID,
            'materials',
            materialId,
            { deleted_at: new Date().toISOString() }
        );

        // Invalidate cache
        await Promise.all([
            invalidateMaterialsCache(session.user.id),
            invalidateVocabCache(session.user.id)
        ]);

        revalidatePath('/materials');
        revalidatePath('/dashboard');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to delete material' };
    }
}

export async function restoreMaterial(materialId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        const admin = getAdminClient();

        const material = await admin.databases.getDocument(
            APPWRITE_DATABASE_ID,
            'materials',
            materialId
        );

        if (!material || material.user_id !== session.user.id) return { error: 'Material not found' };

        await admin.databases.updateDocument(
            APPWRITE_DATABASE_ID,
            'materials',
            materialId,
            { deleted_at: null }
        );
        
        // Invalidate cache
        await Promise.all([
            invalidateMaterialsCache(session.user.id),
            invalidateVocabCache(session.user.id)
        ]);
        
        revalidatePath('/materials');
        revalidatePath('/trash');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to restore material' };
    }
}

export async function permanentlyDeleteMaterial(materialId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        const admin = getAdminClient();

        const material = await admin.databases.getDocument(
            APPWRITE_DATABASE_ID,
            'materials',
            materialId
        );

        if (!material || material.user_id !== session.user.id) return { error: 'Material not found' };

        // Delete file from disk or storage
        try {
            if (material.file_path.startsWith('http')) {
                // External URL - do nothing
            } else if (path.isAbsolute(material.file_path)) {
                // Local file (legacy)
                await unlink(material.file_path);
            } else {
                // Appwrite Storage
                await admin.storage.deleteFile(
                    MATERIALS_BUCKET,
                    material.file_path
                );
            }
        } catch (e) {
            console.error("Failed to delete file:", e);
        }

        await admin.databases.deleteDocument(
            APPWRITE_DATABASE_ID,
            'materials',
            materialId
        );

        // Update usage
        const userDoc = await admin.databases.getDocument(
            APPWRITE_DATABASE_ID,
            'users',
            session.user.id
        );
            
        if (userDoc) {
             await admin.databases.updateDocument(
                APPWRITE_DATABASE_ID,
                'users',
                session.user.id,
                { used_space: Math.max(0, (userDoc.used_space || 0) - material.size) }
             );
        }

        revalidatePath('/materials');
        revalidatePath('/trash');
        revalidatePath('/dashboard');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to permanently delete material' };
    }
}

export async function moveMaterial(materialId: string, newFolderId: string | null) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        const admin = getAdminClient();
        
        const material = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'materials', materialId);
        if (material.user_id !== session.user.id) return { error: 'Unauthorized' };

        await admin.databases.updateDocument(
            APPWRITE_DATABASE_ID,
            'materials',
            materialId,
            { folder_id: newFolderId }
        );
        
        revalidatePath('/materials');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to move material' };
    }
}

export async function renameMaterial(materialId: string, newTitle: string) {
     const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        const admin = getAdminClient();
        
        const material = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'materials', materialId);
        if (material.user_id !== session.user.id) return { error: 'Unauthorized' };

        await admin.databases.updateDocument(
            APPWRITE_DATABASE_ID,
            'materials',
            materialId,
            { title: newTitle }
        );

        revalidatePath('/materials');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to rename material' };
    }
}

async function performTranscription(materialId: string, userId: string) {
    const admin = getAdminClient();

    // Fetch user settings
    let user;
    try {
        user = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'users', userId);
    } catch (e) {
        console.error("User not found for transcription:", userId);
        return;
    }

    let material;
    try {
        material = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'materials', materialId);
    } catch (e) {
        console.error("Material not found for transcription:", materialId);
        return;
    }

    if (!material || material.user_id !== userId) return;
    
    // Default transcription options
    let transcriptionOptions: {
        engine: 'faster-whisper' | 'openai-whisper';
        model: string;
        language?: string;
        vad_filter: boolean;
        compute_type: 'auto' | 'float16' | 'int8' | 'int8_float16';
        device: 'auto' | 'cpu' | 'cuda';
    } = {
        engine: 'faster-whisper',
        model: 'base',
        vad_filter: true,
        compute_type: 'auto',
        device: 'auto',
    };
    
    if (user?.settings) {
        try {
            const settings = JSON.parse(user.settings);
            if (settings.whisperEngine === 'faster-whisper' || settings.whisperEngine === 'openai-whisper') {
                transcriptionOptions.engine = settings.whisperEngine;
            }
            if (settings.whisperModel) {
                transcriptionOptions.model = settings.whisperModel;
            }
            if (settings.whisperLanguage && settings.whisperLanguage !== "auto") {
                transcriptionOptions.language = settings.whisperLanguage;
            }
            if (typeof settings.whisperVadFilter === 'boolean') {
                transcriptionOptions.vad_filter = settings.whisperVadFilter;
            }
            if (['auto', 'float16', 'int8', 'int8_float16'].includes(settings.whisperComputeType)) {
                transcriptionOptions.compute_type = settings.whisperComputeType;
            }
            if (['auto', 'cpu', 'cuda'].includes(settings.whisperDevice)) {
                transcriptionOptions.device = settings.whisperDevice;
            }
        } catch(e) { /* ignore */ }
    }

    let filePathToTranscribe = material.file_path;
    let tempFilePath: string | null = null;

    try {
        // Handle remote files (HTTP or Appwrite Storage)
        if (material.file_path.startsWith('http') || !path.isAbsolute(material.file_path)) {
            const tempDir = os.tmpdir();
            const tempName = `transcribe-${Date.now()}-${path.basename(material.filename)}`;
            tempFilePath = path.join(tempDir, tempName);

            if (material.file_path.startsWith('http')) {
                // Download from URL
                const response = await fetch(material.file_path);
                if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);
                
                const fileStream = createWriteStream(tempFilePath);
                // @ts-ignore
                await pipeline(response.body, fileStream);
            } else {
                // Download from Appwrite Storage
                const buffer = await admin.storage.getFileDownload(MATERIALS_BUCKET, material.file_path);
                await writeFile(tempFilePath, Buffer.from(buffer));
            }
            
            filePathToTranscribe = tempFilePath;
        }

        const result = await transcribeFile(filePathToTranscribe, transcriptionOptions);
        
        // Save sentences
        // Delete existing sentences
        const { documents: existingSentences } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'sentences',
            [Query.equal('material_id', materialId)]
        );
        
        await Promise.all(existingSentences.map(s => 
            admin.databases.deleteDocument(APPWRITE_DATABASE_ID, 'sentences', s.$id)
        ));

        // Insert new sentences
        const now = new Date().toISOString();
        const sentences = result.segments.map((seg: any, i: number) => {
            const startTime = Number.isFinite(seg.start) ? seg.start : 0;
            const endTime = Number.isFinite(seg.end) ? seg.end : 0;
            return {
                material_id: materialId,
                start_time: startTime,
                end_time: endTime,
                content: seg.text,
                order: i,
                created_at: now,
                updated_at: now
            };
        });
        
        if (sentences.length > 0) {
            await Promise.all(sentences.map((s: any) => 
                admin.databases.createDocument(
                    APPWRITE_DATABASE_ID,
                    'sentences',
                    ID.unique(),
                    s
                )
            ));
        }
        
        // Calculate actual media duration from the last segment's end time
        const mediaDuration = result.segments.length > 0 
            ? Math.max(...result.segments.map((seg: any) => seg.end || 0))
            : 0;
        
        // Update material status with transcription metadata
        await admin.databases.updateDocument(
            APPWRITE_DATABASE_ID,
            'materials',
            materialId,
            { 
                is_processed: true,
                transcription_engine: transcriptionOptions.engine,
                transcription_model: transcriptionOptions.model,
                transcription_language: result.language || transcriptionOptions.language || null,
                transcription_vad_filter: transcriptionOptions.engine === 'faster-whisper' ? transcriptionOptions.vad_filter : null,
                transcription_compute_type: transcriptionOptions.engine === 'faster-whisper' ? transcriptionOptions.compute_type : null,
                transcription_time: result.duration,
                duration: mediaDuration
            }
        );

        // Update Daily Stats for Sentences
        const sentencesCount = result.segments.length;
        if (sentencesCount > 0) {
            const today = startOfDay(new Date()).toISOString(); // Use ISO string for date
            
            const { documents: existingStats } = await admin.databases.listDocuments(
                APPWRITE_DATABASE_ID,
                'daily_study_stats',
                [
                    Query.equal('user_id', userId),
                    Query.equal('date', today)
                ]
            );
            const existingStat = existingStats[0];

            if (existingStat) {
                await admin.databases.updateDocument(
                    APPWRITE_DATABASE_ID,
                    'daily_study_stats',
                    existingStat.$id,
                    { sentences_added: existingStat.sentences_added + sentencesCount }
                );
            } else {
                await admin.databases.createDocument(
                    APPWRITE_DATABASE_ID,
                    'daily_study_stats',
                    ID.unique(),
                    {
                        user_id: userId,
                        date: today,
                        sentences_added: sentencesCount
                    }
                );
            }
        }
        
        // Trigger vocabulary extraction
        await extractVocabulary(materialId);

        // Create notification for successful processing
        await createNotification(
          userId,
          'MATERIAL_PROCESSED',
          'Transcription Complete',
          `"${material.title}" has been transcribed with ${result.segments.length} sentences and vocabulary extracted.`,
          materialId,
          'material'
        );

        await revalidateInBackground([
            '/materials',
            `/materials/${materialId}`,
            '/vocab',
        ]);

    } catch (error) {
        console.error("Transcription error:", error);
    } finally {
        if (tempFilePath) {
            try {
                await unlink(tempFilePath);
            } catch (e) {
                console.error("Failed to delete temp file:", e);
            }
        }
    }
}

// Simple in-memory queue for transcription tasks
const transcriptionQueue: { materialId: string; userId: string }[] = [];
let isProcessingQueue = false;

async function processTranscriptionQueue() {
    if (isProcessingQueue) return;
    isProcessingQueue = true;

    while (transcriptionQueue.length > 0) {
        const task = transcriptionQueue.shift();
        if (task) {
            try {
                console.log(`[Queue] Processing transcription for material: ${task.materialId}`);
                await performTranscription(task.materialId, task.userId);
                console.log(`[Queue] Completed transcription for material: ${task.materialId}`);
            } catch (err) {
                console.error(`[Queue] Transcription failed for material ${task.materialId}:`, err);
            }
        }
    }

    isProcessingQueue = false;
}

export async function transcribeMaterial(materialId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const admin = getAdminClient();
    
    // Mark as processing
    try {
        const material = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'materials', materialId);
        if (material.user_id !== session.user.id) return { error: 'Unauthorized' };

        await admin.databases.updateDocument(
            APPWRITE_DATABASE_ID,
            'materials',
            materialId,
            { is_processed: false }
        );
    } catch (e) {
        return { error: 'Failed to update material status' };
    }

    safeRevalidate([
        '/materials',
        `/materials/${materialId}`,
        '/vocab',
    ]);

    // Add to queue instead of running directly
    transcriptionQueue.push({ materialId, userId: session.user.id });
    console.log(`[Queue] Added material ${materialId} to queue. Queue length: ${transcriptionQueue.length}`);
    
    // Start processing queue (will return immediately if already processing)
    processTranscriptionQueue().catch(err => {
        console.error("Queue processing error:", err);
    });

    return { success: true, message: 'Transcription queued for processing' };
}

export async function computeUserStorage() {
    const session = await auth();
    if (!session?.user?.id) {
        return { error: 'Unauthorized' };
    }

    const admin = getAdminClient();

    try {
        const user = await admin.databases.getDocument(APPWRITE_DATABASE_ID, 'users', session.user.id);
        return {
            quota: Number(user.quota),
            usedSpace: Number(user.used_space)
        };
    } catch (error) {
        return { error: 'User not found' };
    }
}

/**
 * Get paginated materials with server-side pagination
 */
export interface MaterialFilters {
    search?: string;
    folderId?: string | null;
}

export interface PaginatedMaterialResult {
    data: any[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export async function getMaterialsPaginated(
    page: number = 1,
    pageSize: number = 10,
    filters: MaterialFilters = {},
    sortBy: string = 'title',
    sortOrder: 'asc' | 'desc' = 'asc'
): Promise<PaginatedMaterialResult | { error: string }> {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const admin = getAdminClient();
    const userId = session.user.id;
    const offset = (page - 1) * pageSize;

    // Generate cache key
    const cacheKey = generateCacheKey(CACHE_KEYS.MATERIALS_PAGINATED, {
        user_id: userId,
        page,
        pageSize,
        filters,
        sortBy,
        sortOrder
    });

    // Try to get from cache first
    const cached = await getCached<PaginatedMaterialResult>(cacheKey);
    if (cached) {
        console.log('[getMaterialsPaginated] Cache hit');
        return cached;
    }

    console.log('[getMaterialsPaginated] Cache miss, fetching from database');

    try {
        // Step 1: Get materials with basic info only
        const queries = [
            Query.equal('user_id', userId),
            Query.isNull('deleted_at')
        ];

        if (filters.folderId === 'unfiled') {
            queries.push(Query.isNull('folder_id'));
        } else if (filters.folderId) {
            queries.push(Query.equal('folder_id', filters.folderId));
        }

        if (filters.search) {
            queries.push(Query.search('title', filters.search));
        }

        const sortAttribute = sortBy === 'created_at' ? '$createdAt' : sortBy;

        if (sortOrder === 'asc') {
            queries.push(Query.orderAsc(sortAttribute));
        } else {
            queries.push(Query.orderDesc(sortAttribute));
        }

        queries.push(Query.limit(pageSize));
        queries.push(Query.offset(offset));

        const { documents: materials, total: count } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'materials',
            queries
        );

        if (!materials || materials.length === 0) {
            const emptyResult: PaginatedMaterialResult = {
                data: [],
                total: count || 0,
                page,
                pageSize,
                totalPages: Math.ceil((count || 0) / pageSize),
            };
            await setCached(cacheKey, emptyResult, 60);
            return emptyResult;
        }

        // Step 2: Get stats for these materials
        const materialIds = materials.map((m: any) => m.$id);

        // Fetch sentences
        const { documents: sentences } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'sentences',
            [
                Query.equal('material_id', materialIds),
                Query.isNull('deleted_at')
            ]
        );

        // Fetch practices
        const { documents: practices } = await admin.databases.listDocuments(
            APPWRITE_DATABASE_ID,
            'practice_progress',
            [Query.equal('user_id', userId)]
        );

        // Fetch occurrences
        const sentenceIds = sentences.map(s => s.$id);
        let occurrences: any[] = [];
        if (sentenceIds.length > 0) {
             // If too many IDs, might need chunking. Assuming reasonable page size.
             const { documents } = await admin.databases.listDocuments(
                 APPWRITE_DATABASE_ID,
                 'word_occurrences',
                 [Query.equal('sentence_id', sentenceIds)]
             );
             occurrences = documents;
        }

        // Build lookup maps
        const sentencesByMaterial = new Map<string, string[]>();
        const sentenceIdSet = new Set<string>();
        
        sentences.forEach((s: any) => {
            if (!sentencesByMaterial.has(s.material_id)) {
                sentencesByMaterial.set(s.material_id, []);
            }
            sentencesByMaterial.get(s.material_id)!.push(s.$id);
            sentenceIdSet.add(s.$id);
        });

        const practicesBySentence = new Map<string, any>();
        practices.forEach((p: any) => {
            if (sentenceIdSet.has(p.sentence_id)) {
                practicesBySentence.set(p.sentence_id, p);
            }
        });

        const occurrencesBySentence = new Map<string, Set<string>>();
        occurrences.forEach((o: any) => {
            if (sentenceIdSet.has(o.sentence_id)) {
                if (!occurrencesBySentence.has(o.sentence_id)) {
                    occurrencesBySentence.set(o.sentence_id, new Set());
                }
                occurrencesBySentence.get(o.sentence_id)!.add(o.word_id);
            }
        });

        // Process materials to calculate stats
        const processedMaterials = materials.map((m: any) => {
            const materialSentenceIds = sentencesByMaterial.get(m.$id) || [];
            const totalSentences = materialSentenceIds.length;
            
            let practicedSentences = 0;
            let totalScore = 0;
            let totalDuration = 0;
            let totalAttempts = 0;
            const uniqueWordIds = new Set<string>();

            materialSentenceIds.forEach((sentenceId: string) => {
                const practice = practicesBySentence.get(sentenceId);
                if (practice) {
                    practicedSentences++;
                    totalScore += practice.score || 0;
                    totalDuration += practice.duration || 0;
                    totalAttempts += practice.attempts || 0;
                }
                
                const wordIds = occurrencesBySentence.get(sentenceId);
                if (wordIds) {
                    wordIds.forEach(wid => uniqueWordIds.add(wid));
                }
            });

            const avgScore = practicedSentences > 0 ? Math.round(totalScore / practicedSentences) : 0;
            
            return {
                ...m,
                id: m.$id, // Map $id to id for frontend compatibility
                stats: {
                    practicedCount: practicedSentences,
                    totalSentences: totalSentences,
                    avgScore: avgScore,
                    vocabCount: uniqueWordIds.size,
                    duration: totalDuration,
                    attempts: totalAttempts
                }
            };
        });

        const total = count || 0;
        const totalPages = Math.ceil(total / pageSize);

        const result: PaginatedMaterialResult = {
            data: processedMaterials,
            total,
            page,
            pageSize,
            totalPages,
        };

        // Cache the result for 2 minutes
        await setCached(cacheKey, result, 120);

        return result;
    } catch (error) {
        console.error('[getMaterialsPaginated] Error:', error);
        return { error: 'Failed to fetch materials' };
    }
}
