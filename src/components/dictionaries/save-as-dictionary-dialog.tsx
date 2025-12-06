"use client"

import { useState } from "react"
import { createDictionaryFromFilter } from "@/actions/dictionary-actions"
import { VocabFilters } from "@/actions/vocab-actions"
import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"
import { BookPlus } from "lucide-react"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

export function SaveAsDictionaryDialog({ filters }: { filters: VocabFilters }) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const name = formData.get("name") as string
    const description = formData.get("description") as string

    try {
      await createDictionaryFromFilter(name, description, filters)
      setOpen(false)
      toast.success("Dictionary created from filters")
      router.push("/dictionaries")
    } catch (error) {
      toast.error("Failed to create dictionary")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <BookPlus className="mr-2 h-4 w-4" />
          Save as Dictionary
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save Filtered Words as Dictionary</DialogTitle>
          <DialogDescription>
            Create a new dictionary containing all words matching the current filters.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" required placeholder="My Filtered Dictionary" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              name="description"
              placeholder="Description..."
            />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
