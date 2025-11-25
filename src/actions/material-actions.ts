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
import { startOfDay } from 'date-fns';
import os from 'os';
import { randomUUID } from 'crypto';

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

  if (!file) {
      return { error: 'No file provided' };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const safeFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
  const uniqueFilename = `${Date.now()}-${safeFilename}`;
  const size = file.size;

  try {
    const client = supabaseAdmin || supabase;

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

    // Save file to Supabase Storage
    const storagePath = `${session.user.id}/${uniqueFilename}`;
    const BUCKET_NAME = 'echo';
    
    let { error: uploadError } = await client.storage
        .from(BUCKET_NAME)
        .upload(storagePath, buffer, {
            contentType: file.type,
            upsert: false
        });

    // If bucket doesn't exist, try to create it and retry upload
    if (uploadError && (uploadError.message.includes('Bucket not found') || (uploadError as any).statusCode === '404')) {
        console.log(`Bucket '${BUCKET_NAME}' not found. Attempting to create it...`);
        const { error: createError } = await client.storage.createBucket(BUCKET_NAME, {
            public: false,
            allowedMimeTypes: ['audio/*', 'video/*'],
            fileSizeLimit: 524288000 // 500MB
        });

        if (createError) {
             console.error("Failed to create bucket:", createError);
             // Fall through to throw uploadError
        } else {
            // Retry upload
            const retryResult = await client.storage
                .from(BUCKET_NAME)
                .upload(storagePath, buffer, {
                    contentType: file.type,
                    upsert: false
                });
            uploadError = retryResult.error;
        }
    }

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
                    .from('echo')
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
    
    let model = 'base';
    if (user?.settings) {
        try {
            const settings = JSON.parse(user.settings);
            if (settings.whisperModel) {
                model = settings.whisperModel;
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
                    .from('echo')
                    .download(material.file_path);
                
                if (error || !data) throw error || new Error('Download failed');
                
                const arrayBuffer = await data.arrayBuffer();
                await writeFile(tempFilePath, Buffer.from(arrayBuffer));
            }
            
            filePathToTranscribe = tempFilePath;
        }

        const result = await transcribeFile(filePathToTranscribe, model);
        
        // Save sentences
        // Transaction replacement: Sequential operations (less safe but okay for now)
        // Delete existing sentences
        await client.from('sentences').delete().eq('material_id', materialId);

        // Insert new sentences
        // Batch insert
        const sentences = result.segments.map((seg: any, i: number) => {
            const startTime = Number.isFinite(seg.start) ? seg.start : 0;
            const endTime = Number.isFinite(seg.end) ? seg.end : 0;
            return {
                id: randomUUID(), // Generate ID manually
                material_id: materialId,
                start_time: startTime,
                end_time: endTime,
                content: seg.text,
                order: i
            };
        });
        
        if (sentences.length > 0) {
            const { error: insertError } = await client.from('sentences').insert(sentences);
            if (insertError) console.error("Error inserting sentences:", insertError);
        }
        
        // Update material status
        await client
            .from('materials')
            .update({ 
                is_processed: true,
                transcription_model: model,
                transcription_time: result.duration,
                duration: result.duration
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

export async function transcribeMaterial(materialId: string) {
    const session = await auth();
    if (!session?.user?.id) return { error: 'Unauthorized' };

    const client = supabaseAdmin || supabase;
    
    // Mark as processing
    await client.from('materials')
        .update({ is_processed: false })
        .eq('id', materialId)
        .eq('user_id', session.user.id);

    // Run transcription in "background" without awaiting
    performTranscription(materialId, session.user.id).catch(err => {
        console.error("Background transcription failed:", err);
    });

    return { success: true, message: 'Transcription started in background' };
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
