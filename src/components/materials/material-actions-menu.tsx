"use client"

import { MoreHorizontal, Trash, FolderInput, Pencil } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { deleteMaterial, moveMaterial, renameMaterial } from "@/actions/material-actions"
import { toast } from "sonner"
import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { useRouter } from "next/navigation"

interface MaterialActionsMenuProps {
  material: any
  folders: any[]
}

export function MaterialActionsMenu({ material, folders }: MaterialActionsMenuProps) {
  const router = useRouter()
  const [isMoveOpen, setIsMoveOpen] = useState(false)
  const [isRenameOpen, setIsRenameOpen] = useState(false)
  const [isDeleteOpen, setIsDeleteOpen] = useState(false)
  const [selectedFolderId, setSelectedFolderId] = useState<string>(material.folderId || "unfiled")
  const [newTitle, setNewTitle] = useState(material.title)

  const handleDelete = async () => {
    const result = await deleteMaterial(material.id)
    if (result.success) {
      toast.success("Material moved to trash")
      setIsDeleteOpen(false)
    } else {
      toast.error("Failed to delete material")
    }
  }

  const handleMove = async () => {
    const targetId = selectedFolderId === "unfiled" ? null : selectedFolderId
    const result = await moveMaterial(material.id, targetId)
    if (result.success) {
        toast.success("Material moved")
        setIsMoveOpen(false)
        router.refresh()
    } else {
        toast.error("Failed to move material")
    }
  }

  const handleRename = async () => {
      if (!newTitle.trim()) return
      const result = await renameMaterial(material.id, newTitle)
      if (result.success) {
          toast.success("Material renamed")
          setIsRenameOpen(false)
          router.refresh()
      } else {
          toast.error("Failed to rename material")
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="h-8 w-8 p-0">
            <span className="sr-only">Open menu</span>
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => {
              setNewTitle(material.title)
              setIsRenameOpen(true)
          }}>
            <Pencil className="mr-2 h-4 w-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setIsMoveOpen(true)}>
            <FolderInput className="mr-2 h-4 w-4" />
            Move to Folder
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setIsDeleteOpen(true)} className="text-red-600">
            <Trash className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={isDeleteOpen} onOpenChange={setIsDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete &quot;{material.title}&quot;?</AlertDialogTitle>
            <AlertDialogDescription>
              This will move the material to trash. You can restore it later from the trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Rename Material</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <Input 
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    placeholder="Material Title"
                />
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsRenameOpen(false)}>Cancel</Button>
                <Button onClick={handleRename}>Save</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isMoveOpen} onOpenChange={setIsMoveOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Move Material</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
                <Select value={selectedFolderId} onValueChange={setSelectedFolderId}>
                    <SelectTrigger>
                        <SelectValue placeholder="Select folder" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="unfiled">Unfiled</SelectItem>
                        {folders.map((folder) => (
                            <SelectItem key={folder.id} value={folder.id}>
                                {folder.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>
            <DialogFooter>
                <Button variant="outline" onClick={() => setIsMoveOpen(false)}>Cancel</Button>
                <Button onClick={handleMove}>Move</Button>
            </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

