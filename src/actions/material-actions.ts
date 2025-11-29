'use server';

import { auth } from '@/auth';
import { supabaseAdmin, supabase } from '@/lib/supabase';
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
    // Bucket creation requires the service role key
    if (!supabaseAdmin) {
        return { error: 'Supabase admin client is not configured to create storage buckets.' };
    }

    const { data: existingBucket } = await supabaseAdmin.storage.getBucket(MATERIALS_BUCKET);
    if (existingBucket) return { success: true };

    const { error: createError } = await supabaseAdmin.storage.createBucket(MATERIALS_BUCKET, {
        public: false,
        allowedMimeTypes: ['audio/*', 'video/*'],
        fileSizeLimit: 524288000 // 500MB
    });

    if (createError) {
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
        const client = supabaseAdmin || supabase;
        
        const { data: material, error } = await client
            .from('materials')
            .insert({
                title: path.parse(filename).name,
                filename: filename,
                file_path: fileUrl, // Storing URL in filePath
                size: size,
                user_id: session.user.id,
                mime_type: fileType,
                folder_id: folderId || null,
                updated_at: new Date().toISOString()
            })
            .select()
            .single();

        if (error) throw error;

        // Update usage
        // Supabase doesn't support `increment` in update directly via JS client unless using RPC or fetching first.
        // We'll fetch user first (or use RPC if we created one). For now, fetch-update pattern.
        // Better: create a Postgres function `increment_used_space`. 
        // For now: read-modify-write (optimistic locking via version/etag if critical, but here simple is fine)
        
        const { data: user } = await client
            .from('users')
            .select('used_space')
            .eq('id', session.user.id)
            .single();
            
        if (user) {
             await client
                .from('users')
                .update({ used_space: (user.used_space || 0) + size })
                .eq('id', session.user.id);
        }

        // Invalidate cache
        await invalidateMaterialsCache(session.user.id);
        
        revalidatePath('/materials');
        revalidatePath('/dashboard');
        return { success: true, materialId: material.id };
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

  const client = supabaseAdmin || supabase;

  // Check for duplicate uploads before storing
  const { data: duplicateByTitle } = await client
    .from('materials')
    .select('id, title, created_at')
    .eq('user_id', session.user.id)
    .eq('title', baseTitle)
    .is('deleted_at', null)
    .maybeSingle();

  if (duplicateByTitle) {
    const createdAt = duplicateByTitle.created_at
      ? duplicateDateFormatter.format(new Date(duplicateByTitle.created_at))
      : 'previously';
    return { 
      error: `Duplicate material. "${duplicateByTitle.title}" already exists (uploaded ${createdAt}).`,
      duplicateMaterialId: duplicateByTitle.id 
    };
  }

  const { data: duplicateBySize } = await client
    .from('materials')
    .select('id, title, created_at')
    .eq('user_id', session.user.id)
    .eq('size', size)
    .eq('mime_type', file.type)
    .is('deleted_at', null)
    .maybeSingle();

  if (duplicateBySize) {
    const createdAt = duplicateBySize.created_at
      ? duplicateDateFormatter.format(new Date(duplicateBySize.created_at))
      : 'previously';
    return { 
      error: `Duplicate material. "${duplicateBySize.title}" with the same file size already exists (uploaded ${createdAt}).`,
      duplicateMaterialId: duplicateBySize.id 
    };
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const uniqueFilename = `${Date.now()}-${safeFilename}`;

    // Check quota
    const { data: user, error: userError } = await client
        .from('users')
        .select('quota, used_space')
        .eq('id', session.user.id)
        .single();
    
    if (userError || !user) return { error: 'User not found' };
    
    const currentUsed = user.used_space || 0;
    const quota = user.quota || 0;

    if (currentUsed + size > quota) {
        return { error: 'Storage quota exceeded' };
    }

    // Ensure bucket exists (requires admin client)
    const bucketResult = await ensureMaterialsBucket();
    if (bucketResult.error) {
        return { error: bucketResult.error };
    }

    // Save file to Supabase Storage
    const storagePath = `${session.user.id}/${uniqueFilename}`;
    const BUCKET_NAME = MATERIALS_BUCKET;
    
    let { error: uploadError } = await client.storage
        .from(BUCKET_NAME)
        .upload(storagePath, buffer, {
            contentType: file.type,
            upsert: false
        });

    if (uploadError) {
        console.error("Supabase storage upload error:", uploadError);
        throw new Error('Failed to upload to storage');
    }

    // Create DB record
    const { data: material, error: materialError } = await client
        .from('materials')
        .insert({
          id: randomUUID(),
          title: path.parse(file.name).name,
          filename: uniqueFilename,
          file_path: storagePath, // Store storage path
          size: size,
          user_id: session.user.id,
          mime_type: file.type,
          folder_id: folderId || null,
          updated_at: new Date().toISOString()
        })
        .select()
        .single();
        
    if (materialError) throw materialError;

    // Update usage
    await client
        .from('users')
        .update({ used_space: currentUsed + size })
        .eq('id', session.user.id);

    // Create notification for upload
    await createNotification(
      session.user.id,
      'MATERIAL_UPLOADED',
      'Material Uploaded',
      `"${path.parse(file.name).name}" has been successfully uploaded and is ready for transcription.`,
      material.id,
      'material'
    );

    // Invalidate cache
    await invalidateMaterialsCache(session.user.id);

    revalidatePath('/materials');
    revalidatePath('/dashboard');
    return { success: true, materialId: material.id };
  } catch (e) {
      console.error("Upload error:", e);
      return { error: 'Upload failed' };
  }
}

export async function deleteMaterial(materialId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    try {
        const client = supabaseAdmin || supabase;
        
        const { data: material, error } = await client
            .from('materials')
            .select('*')
            .eq('id', materialId)
            .eq('user_id', session.user.id)
            .single();

        if (error || !material) return { error: 'Material not found' };

        // Soft delete
        const { error: updateError } = await client
            .from('materials')
            .update({ deleted_at: new Date().toISOString() })
            .eq('id', materialId);
            
        if (updateError) throw updateError;

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
        const client = supabaseAdmin || supabase;

        const { error } = await client
            .from('materials')
            .update({ deleted_at: null })
            .eq('id', materialId)
            .eq('user_id', session.user.id);
            
        if (error) throw error;
        
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
        const client = supabaseAdmin || supabase;

        const { data: material, error } = await client
            .from('materials')
            .select('*')
            .eq('id', materialId)
            .eq('user_id', session.user.id)
            .single();

        if (error || !material) return { error: 'Material not found' };

        // Delete file from disk or storage
        try {
            if (material.file_path.startsWith('http')) {
                // External URL - do nothing (or maybe handle if we support deleting external resources?)
            } else if (path.isAbsolute(material.file_path)) {
                // Local file (legacy)
                await unlink(material.file_path);
            } else {
                // Supabase Storage
                const { error: removeError } = await client.storage
                    .from('materials')
                    .remove([material.file_path]);
                
                if (removeError) {
                    console.error("Failed to delete from storage:", removeError);
                }
            }
        } catch (e) {
            console.error("Failed to delete file:", e);
        }

        // Delete DB record (Supabase/Postgres should handle Cascade if configured in DB, 
        // but Prisma handled it in code or DB. Assuming DB foreign keys have ON DELETE CASCADE)
        // If not, we must manually delete related records. 
        // Let's assume we might need to delete manually if CASCADE isn't set in DB.
        // Check schema: userId -> onDelete: Cascade. material -> sentences -> onDelete: Cascade.
        // So just deleting material is enough IF the DB migration was applied with Cascade.
        
        const { error: deleteError } = await client
            .from('materials')
            .delete()
            .eq('id', materialId);

        if (deleteError) throw deleteError;

        // Cleanup orphaned words
        // This is complex in Supabase JS client without raw SQL or RPC.
        // We can use supabase.rpc() if we create a function, or raw query via other means?
        // Supabase JS client doesn't support raw SQL unless enabled via RPC or direct connection.
        // We will SKIP this for now or implement it later. It's optimization.
        /*
        try {
            // await prisma.$executeRaw`DELETE FROM Word WHERE id NOT IN (SELECT wordId FROM WordOccurrence)`;
        } catch (cleanupError) { ... }
        */

        // Update usage
        const { data: user } = await client
            .from('users')
            .select('used_space')
            .eq('id', session.user.id)
            .single();
            
        if (user) {
             await client
                .from('users')
                .update({ used_space: Math.max(0, (user.used_space || 0) - material.size) })
                .eq('id', session.user.id);
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
        const client = supabaseAdmin || supabase;
        
        const { error } = await client
            .from('materials')
            .update({ folder_id: newFolderId })
            .eq('id', materialId)
            .eq('user_id', session.user.id);
            
        if (error) throw error;
        
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
        const client = supabaseAdmin || supabase;
        
        const { error } = await client
            .from('materials')
            .update({ title: newTitle })
            .eq('id', materialId)
            .eq('user_id', session.user.id);

        if (error) throw error;

        revalidatePath('/materials');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to rename material' };
    }
}

async function performTranscription(materialId: string, userId: string) {
    const client = supabaseAdmin || supabase;

    // Fetch user settings
    const { data: user } = await client
        .from('users')
        .select('settings')
        .eq('id', userId)
        .single();

    const { data: material } = await client
        .from('materials')
        .select('*')
        .eq('id', materialId)
        .eq('user_id', userId)
        .single();

    if (!material) return;
    
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
        // Handle remote files (HTTP or Supabase Storage)
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
                // Download from Supabase Storage
                const { data, error } = await client.storage
                    .from('materials')
                    .download(material.file_path);
                
                if (error || !data) throw error || new Error('Download failed');
                
                const arrayBuffer = await data.arrayBuffer();
                await writeFile(tempFilePath, Buffer.from(arrayBuffer));
            }
            
            filePathToTranscribe = tempFilePath;
        }

        const result = await transcribeFile(filePathToTranscribe, transcriptionOptions);
        
        // Save sentences
        // Transaction replacement: Sequential operations (less safe but okay for now)
        // Delete existing sentences
        await client.from('sentences').delete().eq('material_id', materialId);

        // Insert new sentences
        // Batch insert
        const now = new Date().toISOString();
        const sentences = result.segments.map((seg: any, i: number) => {
            const startTime = Number.isFinite(seg.start) ? seg.start : 0;
            const endTime = Number.isFinite(seg.end) ? seg.end : 0;
            return {
                id: randomUUID(), // Generate ID manually
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
            const { error: insertError } = await client.from('sentences').insert(sentences);
            if (insertError) console.error("Error inserting sentences:", insertError);
        }
        
        // Calculate actual media duration from the last segment's end time
        const mediaDuration = result.segments.length > 0 
            ? Math.max(...result.segments.map((seg: any) => seg.end || 0))
            : 0;
        
        // Update material status with transcription metadata
        await client
            .from('materials')
            .update({ 
                is_processed: true,
                transcription_engine: transcriptionOptions.engine,
                transcription_model: transcriptionOptions.model,
                transcription_language: result.language || transcriptionOptions.language || null,
                transcription_vad_filter: transcriptionOptions.engine === 'faster-whisper' ? transcriptionOptions.vad_filter : null,
                transcription_compute_type: transcriptionOptions.engine === 'faster-whisper' ? transcriptionOptions.compute_type : null,
                transcription_time: result.duration,
                duration: mediaDuration
            })
            .eq('id', materialId);

        // Update Daily Stats for Sentences
        const sentencesCount = result.segments.length;
        if (sentencesCount > 0) {
            const today = startOfDay(new Date()).toISOString(); // Use ISO string for date
            
            // Upsert logic manual implementation
            const { data: existingStat } = await client
                .from('daily_study_stats')
                .select('id, sentences_added')
                .eq('user_id', userId)
                .eq('date', today)
                .single();

            if (existingStat) {
                await client
                    .from('daily_study_stats')
                    .update({ sentences_added: existingStat.sentences_added + sentencesCount })
                    .eq('id', existingStat.id);
            } else {
                await client
                    .from('daily_study_stats')
                    .insert({
                        id: randomUUID(),
                        user_id: userId,
                        date: today,
                        sentences_added: sentencesCount
                    });
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

    const client = supabaseAdmin || supabase;
    
    // Mark as processing
    await client.from('materials')
        .update({ is_processed: false })
        .eq('id', materialId)
        .eq('user_id', session.user.id);

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

    const client = supabaseAdmin || supabase;

    const { data: user, error } = await client
        .from('users')
        .select('quota, used_space')
        .eq('id', session.user.id)
        .single();

    if (error || !user) {
        return { error: 'User not found' };
    }

    return {
        quota: Number(user.quota),
        usedSpace: Number(user.used_space)
    };
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

    const client = supabaseAdmin || supabase;
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
        // Step 1: Get materials with basic info only (no heavy joins)
        let query = client
            .from('materials')
            .select('*', { count: 'exact' })
            .eq('user_id', userId)
            .is('deleted_at', null);

        // Apply folder filter
        if (filters.folderId === 'unfiled') {
            query = query.is('folder_id', null);
        } else if (filters.folderId) {
            query = query.eq('folder_id', filters.folderId);
        }

        // Apply search filter
        if (filters.search) {
            query = query.ilike('title', `%${filters.search}%`);
        }

        // Apply sorting
        const orderColumn = sortBy === 'title' ? 'title' : sortBy === 'created_at' ? 'created_at' : 'title';
        query = query.order(orderColumn, { ascending: sortOrder === 'asc' });

        // Apply pagination
        query = query.range(offset, offset + pageSize - 1);

        const { data: materials, count, error } = await query;

        if (error) {
            console.error('[getMaterialsPaginated] Error:', error);
            return { error: 'Failed to fetch materials' };
        }

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

        // Step 2: Get stats for these materials in parallel
        const materialIds = materials.map((m: any) => m.id);

        // Fetch sentences, practices, and occurrences in parallel
        const [sentencesResult, practicesResult, occurrencesResult] = await Promise.all([
            client
                .from('sentences')
                .select('id, material_id')
                .in('material_id', materialIds)
                .is('deleted_at', null),
            client
                .from('practice_progress')
                .select('sentence_id, score, attempts, user_id')
                .eq('user_id', userId),
            client
                .from('word_occurrences')
                .select('sentence_id, word_id')
        ]);

        const sentences = sentencesResult.data || [];
        const practices = practicesResult.data || [];
        const occurrences = occurrencesResult.data || [];

        // Build lookup maps
        const sentencesByMaterial = new Map<string, string[]>();
        const sentenceIdSet = new Set<string>();
        
        sentences.forEach((s: any) => {
            if (!sentencesByMaterial.has(s.material_id)) {
                sentencesByMaterial.set(s.material_id, []);
            }
            sentencesByMaterial.get(s.material_id)!.push(s.id);
            sentenceIdSet.add(s.id);
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
            const materialSentenceIds = sentencesByMaterial.get(m.id) || [];
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
