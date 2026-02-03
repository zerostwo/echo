'use client';

import { Button } from '@/components/ui/button';
import { RefreshCw, BookOpen } from 'lucide-react';
import { transcribeMaterial } from '@/actions/material-actions';
import { extractVocabulary } from '@/actions/vocab-actions';
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
    const [isTranscribing, setIsTranscribing] = useState(false);
    const [isExtracting, setIsExtracting] = useState(false);

    async function handleRetranscribe() {
        setIsTranscribing(true);
        const toastId = toast.loading("Starting transcription...");
        try {
            const res = await transcribeMaterial(materialId);
            if (res.error) {
                toast.error(res.error, { id: toastId });
            } else {
                toast.success("Re-transcription started. It will take a few moments.", { id: toastId });
            }
        } catch (e) {
            toast.error("Failed to re-transcribe", { id: toastId });
        } finally {
            setIsTranscribing(false);
        }
    }

    async function handleReextractVocabulary() {
        setIsExtracting(true);
        const toastId = toast.loading("Starting vocabulary extraction...");
        try {
            const res = await extractVocabulary(materialId);
            if (res?.error) {
                toast.error(res.error, { id: toastId });
            } else {
                toast.success("Vocabulary extraction started.", { id: toastId });
            }
        } catch (e) {
            toast.error("Failed to re-extract vocabulary", { id: toastId });
        } finally {
            setIsExtracting(false);
        }
    }

    return (
        <div className="flex flex-wrap gap-2">
            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button 
                        variant="outline" 
                        size="sm"
                        disabled={isTranscribing || isExtracting}
                        className="gap-2"
                    >
                        <RefreshCw className={`h-4 w-4 ${isTranscribing ? 'animate-spin' : ''}`} />
                        Re-transcribe
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Re-transcribe Material?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will re-transcribe the audio and generate a new vocabulary list.
                            All current sentences and progress for this material will be deleted.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleRetranscribe}>Continue</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog>
                <AlertDialogTrigger asChild>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={isTranscribing || isExtracting}
                        className="gap-2"
                    >
                        <BookOpen className={`h-4 w-4 ${isExtracting ? 'animate-pulse' : ''}`} />
                        Re-extract Vocabulary
                    </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Re-extract Vocabulary?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will rebuild the vocabulary list from the current sentences.
                            Existing word occurrences for this material will be replaced.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleReextractVocabulary}>Continue</AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
