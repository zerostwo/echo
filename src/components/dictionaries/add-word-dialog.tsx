"use client"

import { useState } from "react"
import { addWordToDictionaryByText } from "@/actions/dictionary-actions"
import { Button } from "@/components/ui/button"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Plus } from "lucide-react"
import { toast } from "sonner"

export function AddWordDialog({ dictionaryId }: { dictionaryId: string }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [showTranslation, setShowTranslation] = useState(false)
  const router = useRouter()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = e.currentTarget

    const formData = new FormData(form)
    const text = formData.get("text") as string
    const translation = formData.get("translation") as string | undefined

    try {
      const result = await addWordToDictionaryByText(dictionaryId, text, translation)
      
      if (result.success) {
        form.reset()
        setShowTranslation(false)
        toast.success("Word added")
        router.refresh()
        // Keep dialog open for faster entry
      } else {
        if (result.code === 'WORD_NOT_FOUND') {
           setShowTranslation(true)
           toast.info("Word not found. Please provide a translation.")
        } else {
           toast.error(result.error || "Failed to add word")
        }
      }
    } catch (error) {
      toast.error("An unexpected error occurred")
    } finally {
      setLoading(false)
    }
  }

  const onOpenChange = (newOpen: boolean) => {
      setOpen(newOpen)
      if (!newOpen) {
          setShowTranslation(false)
      }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Word
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Word</DialogTitle>
          <DialogDescription>
            Add a word to this dictionary. If it's not in the database, we'll look it up.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="text">Word</Label>
            <Input id="text" name="text" required placeholder="e.g. serendipity" autoFocus />
          </div>
          
          {showTranslation && (
            <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
              <Label htmlFor="translation">Translation (Chinese)</Label>
              <Input 
                id="translation" 
                name="translation" 
                required 
                placeholder="e.g. 意外发现珍奇事物的本领" 
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                This word wasn't found in our dictionary. Please add a translation to create it.
              </p>
            </div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : (showTranslation ? "Create & Add" : "Add")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
