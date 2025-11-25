'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { transcribeMaterial } from '@/actions/material-actions';
import { toast } from 'sonner';
import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

export function MaterialHeaderActions({ materialId }: { materialId: string }) {
    const [isRegenerating, setIsRegenerating] = useState(false);

    async function handleRegenerate() {
        setIsRegenerating(true);
        const toastId = toast.loading("Starting regeneration...");
        try {
            const res = await transcribeMaterial(materialId);
            if (res.error) {
                toast.error(res.error, { id: toastId });
            } else {
                toast.success("Regeneration started. It will take a few moments.", { id: toastId });
            }
        } catch (e) {
            toast.error("Failed to regenerate", { id: toastId });
        } finally {
            setIsRegenerating(false);
        }
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button 
                    variant="outline" 
                    size="sm" 
                    disabled={isRegenerating}
                    className="gap-2"
                >
                    <RefreshCw className={`h-4 w-4 ${isRegenerating ? 'animate-spin' : ''}`} />
                    Regenerate
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Regenerate Material?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This will re-transcribe the audio and generate a new vocabulary list. 
                        All current sentences and progress for this material will be deleted.
                        This action cannot be undone.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleRegenerate}>Continue</AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}

