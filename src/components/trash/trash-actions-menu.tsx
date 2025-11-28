"use client"

import { MoreHorizontal, RefreshCw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { restoreMaterial, permanentlyDeleteMaterial } from "@/actions/material-actions"
import { restoreSentence, permanentlyDeleteSentence } from "@/actions/sentence-actions"
import { restoreWord, permanentlyDeleteWord } from "@/actions/word-actions"
import { toast } from "sonner"
import { useRouter } from "next/navigation"
import { TrashItem } from "./columns"

interface TrashActionsMenuProps {
  item: TrashItem
}

export function TrashActionsMenu({ item }: TrashActionsMenuProps) {
  const router = useRouter()

  const handleRestore = async () => {
    const result = item.type === 'material'
      ? await restoreMaterial(item.id)
      : item.type === 'sentence'
        ? await restoreSentence(item.id)
        : await restoreWord(item.id)

    if (result.success) {
      toast.success("Item restored")
      router.refresh()
    } else {
      toast.error(result.error || "Failed to restore item")
    }
  }

  const handleDelete = async () => {
    if (!confirm("This will permanently delete the item. This action cannot be undone.")) return
    
    const result = item.type === 'material'
      ? await permanentlyDeleteMaterial(item.id)
      : item.type === 'sentence'
        ? await permanentlyDeleteSentence(item.id)
        : await permanentlyDeleteWord(item.id)

    if (result.success) {
        toast.success("Item deleted permanently")
        router.refresh()
    } else {
        toast.error(result.error || "Failed to delete item")
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="h-8 w-8 p-0">
          <span className="sr-only">Open menu</span>
          <MoreHorizontal className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>Actions</DropdownMenuLabel>
        <DropdownMenuItem onClick={handleRestore}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Restore
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleDelete} className="text-red-600">
          <Trash2 className="mr-2 h-4 w-4" />
          Delete Forever
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
