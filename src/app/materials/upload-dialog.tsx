'use client';

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { uploadMaterial, transcribeMaterial } from "@/actions/material-actions"
import { useState } from "react"
import { toast } from "sonner"
import { UploadDropzone } from "@/components/upload-dropzone"
import { useRouter } from "next/navigation"

interface UploadMaterialDialogProps {
    folderId?: string | null;
}

export function UploadMaterialDialog({ folderId }: UploadMaterialDialogProps) {
  const [open, setOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const router = useRouter();

  async function handleUpload(files: File[]) {
    if (files.length === 0) return;
    
    setIsUploading(true);
    let successCount = 0;
    
    try {
        toast.info(`Uploading ${files.length} file(s)...`);
        
        // Convert FileList/array to Array just in case
        const fileArray = Array.from(files);
        
        for (const file of fileArray) {
            const formData = new FormData();
            formData.append('file', file);
            if (folderId) {
                formData.append('folderId', folderId);
            }

            try {
                const res = await uploadMaterial(formData);
                
                if (res.error) {
                    toast.error(`Failed to upload ${file.name}: ${res.error}`);
                    continue;
                }
                
                successCount++;

                if (res.materialId) {
                     // Trigger transcription in background
                     transcribeMaterial(res.materialId).then((transRes) => {
                        if (transRes.error) {
                            toast.error(`Transcription failed for ${file.name}: ${transRes.error}`);
                        } else {
                            toast.success(`Transcription started for ${file.name}`);
                        }
                    });
                }
            } catch (fileError) {
                console.error(`Error uploading ${file.name}`, fileError);
                toast.error(`Error uploading ${file.name}`);
            }
        }
        
        if (successCount > 0) {
            toast.success(`Successfully uploaded ${successCount} file(s)`);
            setOpen(false);
            router.refresh();
        }
        
    } catch (e) {
        console.error("Upload error:", e);
        toast.error("An error occurred during upload");
    } finally {
        setIsUploading(false);
    }
  }

  // Mock control object for UploadDropzone
  const mockControl: any = {
      upload: () => {}, 
      isPending: isUploading
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Upload Material</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Upload Audio/Video</DialogTitle>
          <DialogDescription>
            Select files to upload for listening practice.
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
            <UploadDropzone 
                control={mockControl} 
                accept="audio/*,video/*"
                description={{
                    fileTypes: 'Audio, Video',
                    maxFiles: 10,
                    maxFileSize: '500MB'
                }}
                uploadOverride={handleUpload}
            />
        </div>
      </DialogContent>
    </Dialog>
  )
}
