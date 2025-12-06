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
  const router = useRouter()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    const form = e.currentTarget

    const formData = new FormData(form)
    const text = formData.get("text") as string

    try {
      await addWordToDictionaryByText(dictionaryId, text)
      form.reset()
      toast.success("Word added")
      router.refresh()
    } catch (error) {
      toast.error("Failed to add word (maybe not found)")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
            <Input id="text" name="text" required placeholder="e.g. serendipity" />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Adding..." : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
