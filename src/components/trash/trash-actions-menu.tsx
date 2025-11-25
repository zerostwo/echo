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
import { toast } from "sonner"
import { useRouter } from "next/navigation"

interface TrashActionsMenuProps {
  material: any
}

export function TrashActionsMenu({ material }: TrashActionsMenuProps) {
  const router = useRouter()

  const handleRestore = async () => {
    const result = await restoreMaterial(material.id)
    if (result.success) {
      toast.success("Material restored")
      router.refresh()
    } else {
      toast.error("Failed to restore material")
    }
  }

  const handleDelete = async () => {
    if (!confirm("This will permanently delete the material and its transcript. This action cannot be undone.")) return
    
    const result = await permanentlyDeleteMaterial(material.id)
    if (result.success) {
        toast.success("Material deleted permanently")
        router.refresh()
    } else {
        toast.error("Failed to delete material")
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

