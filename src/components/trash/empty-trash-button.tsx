'use client';

import { Button } from "@/components/ui/button"
import { Trash2 } from "lucide-react"
import { emptyTrash } from "@/actions/trash-actions"
import { toast } from "sonner"
import { useState } from "react"
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

export function EmptyTrashButton() {
    const [isLoading, setIsLoading] = useState(false);

    async function handleEmpty() {
        setIsLoading(true);
        try {
            const res = await emptyTrash();
            if (res.success) {
                toast.success("Trash emptied");
            } else {
                toast.error("Failed to empty trash");
            }
        } catch (e) {
            toast.error("Error emptying trash");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button variant="destructive" size="sm" disabled={isLoading}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Empty Trash
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Empty Trash?</AlertDialogTitle>
                    <AlertDialogDescription>
                        This action cannot be undone. All items in the trash will be permanently deleted.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleEmpty} className="bg-red-600 hover:bg-red-700">
                        {isLoading ? "Emptying..." : "Empty Trash"}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

