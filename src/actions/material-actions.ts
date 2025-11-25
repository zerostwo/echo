'use server';

import { auth } from '@/auth';
import prisma from '@/lib/prisma';
import { writeFile, mkdir, unlink, readFile } from 'fs/promises';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import path from 'path';
import { revalidatePath } from 'next/cache';
import { transcribeFile } from '@/services/transcription';
import { extractVocabulary } from './vocab-actions';
import { startOfDay } from 'date-fns';
import os from 'os';

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
        const material = await prisma.material.create({
            data: {
                title: path.parse(filename).name,
                filename: filename,
                filePath: fileUrl, // Storing URL in filePath
                size: size,
                userId: session.user.id,
                mimeType: fileType,
                folderId: folderId || null,
            }
        });

        // Update usage
        await prisma.user.update({
            where: { id: session.user.id },
            data: { usedSpace: { increment: size } }
        });

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
    // Check quota
    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { quota: true, usedSpace: true }
    });
    
    if (!user) return { error: 'User not found' };
    
    const currentUsed = user.usedSpace || BigInt(0);
    const quota = user.quota || BigInt(0);

    if (currentUsed + BigInt(size) > quota) {
        return { error: 'Storage quota exceeded' };
    }

    // Save file
    const uploadDir = path.join(process.cwd(), 'uploads', session.user.id);
    await mkdir(uploadDir, { recursive: true });
    const filePath = path.join(uploadDir, uniqueFilename);
    
    await writeFile(filePath, buffer);

    // Create DB record
    const material = await prisma.material.create({
      data: {
          title: path.parse(file.name).name,
          filename: uniqueFilename,
          filePath: filePath,
          size: size,
          userId: session.user.id,
          mimeType: file.type,
          folderId: folderId || null,
      }
    });

    // Update usage
    await prisma.user.update({
        where: { id: session.user.id },
        data: { usedSpace: { increment: size } }
    });

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
        const material = await prisma.material.findUnique({
            where: { id: materialId, userId: session.user.id }
        });

        if (!material) return { error: 'Material not found' };

        // Soft delete
        await prisma.material.update({
            where: { id: materialId },
            data: { deletedAt: new Date() }
        });

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
        await prisma.material.update({
            where: { id: materialId, userId: session.user.id },
            data: { deletedAt: null }
        });
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
        const material = await prisma.material.findUnique({
            where: { id: materialId, userId: session.user.id }
        });

        if (!material) return { error: 'Material not found' };

        // Delete file from disk
        try {
            if (!material.filePath.startsWith('http')) {
                await unlink(material.filePath);
            }
            // If it's S3, we skip deletion here or need an S3 client to delete it.
            // For better-upload, we might not have direct delete access without config.
        } catch (e) {
            console.error("Failed to delete file:", e);
        }

        // Delete DB record (Cascade deletes Sentences -> WordOccurrences)
        await prisma.material.delete({
            where: { id: materialId }
        });

        // Cleanup orphaned words
        // Delete words that have no occurrences left
        try {
            // SQLite syntax
            await prisma.$executeRaw`DELETE FROM Word WHERE id NOT IN (SELECT wordId FROM WordOccurrence)`;
        } catch (cleanupError) {
            console.error("Failed to cleanup orphaned words:", cleanupError);
            // Don't fail the main operation if cleanup fails
        }

        // Update usage
        await prisma.user.update({
            where: { id: session.user.id },
            data: { usedSpace: { decrement: material.size } }
        });

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
        await prisma.material.update({
            where: { id: materialId, userId: session.user.id },
            data: { folderId: newFolderId }
        });
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
        await prisma.material.update({
            where: { id: materialId, userId: session.user.id },
            data: { title: newTitle }
        });
        revalidatePath('/materials');
        return { success: true };
    } catch (e) {
        return { error: 'Failed to rename material' };
    }
}

async function performTranscription(materialId: string, userId: string) {
    // Fetch user settings
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { settings: true }
    });

    const material = await prisma.material.findUnique({
        where: { id: materialId, userId: userId }
    });

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

    let filePathToTranscribe = material.filePath;
    let tempFilePath: string | null = null;

    try {
        if (material.filePath.startsWith('http')) {
            // Download to temp
            const response = await fetch(material.filePath);
            if (!response.ok) throw new Error(`Failed to download file: ${response.statusText}`);
            
            const tempDir = os.tmpdir();
            const tempName = `transcribe-${Date.now()}-${path.basename(material.filename)}`;
            tempFilePath = path.join(tempDir, tempName);
            
            const fileStream = createWriteStream(tempFilePath);
            // @ts-ignore
            await pipeline(response.body, fileStream);
            filePathToTranscribe = tempFilePath;
        }

        const result = await transcribeFile(filePathToTranscribe, model);
        
        // Save sentences
        await prisma.$transaction(async (tx) => {
            // Clear existing if any
            await tx.sentence.deleteMany({ where: { materialId } });

            for (let i = 0; i < result.segments.length; i++) {
                const seg = result.segments[i];
                await tx.sentence.create({
                    data: {
                        materialId,
                        startTime: seg.start,
                        endTime: seg.end,
                        content: seg.text,
                        order: i
                    }
                });
            }
            
            await tx.material.update({
                where: { id: materialId },
                data: { 
                    isProcessed: true,
                    transcriptionModel: model,
                    transcriptionTime: result.duration,
                    duration: result.duration // Update duration from transcription
                }
            });
        });

        // Update Daily Stats for Sentences
        const sentencesCount = result.segments.length;
        if (sentencesCount > 0) {
            const today = startOfDay(new Date());
            await prisma.dailyStudyStat.upsert({
                where: {
                    userId_date: {
                        userId: userId,
                        date: today
                    }
                },
                update: {
                    sentencesAdded: { increment: sentencesCount }
                },
                create: {
                    userId: userId,
                    date: today,
                    sentencesAdded: sentencesCount
                }
            });
        }

        try {
            revalidatePath(`/materials/${materialId}`);
            revalidatePath('/materials');
        } catch (revalidateError) {
            console.warn("Revalidation failed (likely due to background execution):", revalidateError);
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

    // Run transcription in "background" without awaiting
    // Note: In serverless (Vercel), this might be killed if the response returns. 
    // But for self-hosted/VPS, this works.
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

    const user = await prisma.user.findUnique({
        where: { id: session.user.id },
        select: { quota: true, usedSpace: true }
    });

    if (!user) {
        return { error: 'User not found' };
    }

    // Return as numbers (bytes) for easier client-side handling, or strings if very large
    // For standard display, Number is likely fine for < 9PB
    return {
        quota: Number(user.quota),
        usedSpace: Number(user.usedSpace)
    };
}
