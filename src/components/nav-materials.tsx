"use client"

import {
  ChevronRight,
  FileAudio,
  Folder,
  MoreHorizontal,
  Trash2,
  FolderPlus,
  Pencil,
} from "lucide-react"

import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useState } from "react"
import { createFolder, deleteFolder, renameFolder } from "@/actions/folder-actions"
import { toast } from "sonner"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

export function NavMaterials({
  folders,
}: {
  folders: any[]
}) {
  const pathname = usePathname()
  const router = useRouter()
  
  // State for folder operations
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [createParentId, setCreateParentId] = useState<string | null>(null)
  const [newFolderName, setNewFolderName] = useState("")
  
  const [renamingItem, setRenamingItem] = useState<{id: string, name: string} | null>(null)
  const [newName, setNewName] = useState("")

  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Build Tree
  const folderTree = buildTree(folders)

  function buildTree(items: any[]) {
      const map: Record<string, any> = {}
      const roots: any[] = []
      
      // Create map
      items.forEach(item => {
          map[item.id] = { ...item, children: [] }
      })
      
      // Assemble tree
      items.forEach(item => {
          if (item.parentId && map[item.parentId]) {
              map[item.parentId].children.push(map[item.id])
          } else {
              roots.push(map[item.id])
          }
      })
      
      return roots
  }

  async function handleCreate() {
      if (!newFolderName.trim()) return
      const res = await createFolder(newFolderName, createParentId || undefined)
      if (res.error) {
          toast.error(res.error)
      } else {
          toast.success("Folder created")
          setIsCreateOpen(false)
          setNewFolderName("")
          setCreateParentId(null)
          router.refresh()
      }
  }

  async function handleDelete() {
      if (!deleteId) return
      const res = await deleteFolder(deleteId)
      if (res.error) {
          toast.error(res.error)
      } else {
          toast.success("Folder deleted, material moved to Unfiled")
          setDeleteId(null)
          router.refresh()
      }
  }

  async function handleRename() {
      if (!renamingItem || !newName.trim()) return
      const res = await renameFolder(renamingItem.id, newName)
      if (res.error) {
          toast.error(res.error)
      } else {
          toast.success("Folder renamed")
          setRenamingItem(null)
          setNewName("")
          router.refresh()
      }
  }

  const TreeItem = ({ item, level = 0 }: { item: any, level?: number }) => {
      const isActive = pathname === `/materials` && typeof window !== 'undefined' && window.location.search.includes(`folderId=${item.id}`)
      const hasChildren = item.children && item.children.length > 0

      if (hasChildren) {
          return (
              <Collapsible className="group/collapsible">
                  <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                          <SidebarMenuButton tooltip={item.name} isActive={isActive}>
                              <ChevronRight className="transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                              <Folder />
                              <span>{item.name}</span>
                          </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                              <SidebarMenuAction showOnHover>
                                  <MoreHorizontal />
                                  <span className="sr-only">More</span>
                              </SidebarMenuAction>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-48" side="right" align="start">
                              <DropdownMenuItem onClick={() => {
                                  setCreateParentId(item.id)
                                  setIsCreateOpen(true)
                              }}>
                                  <FolderPlus className="text-muted-foreground" />
                                  <span>New Subfolder</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => {
                                  setRenamingItem({ id: item.id, name: item.name })
                                  setNewName(item.name)
                              }}>
                                  <Pencil className="text-muted-foreground" />
                                  <span>Rename</span>
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => setDeleteId(item.id)}>
                                  <Trash2 className="text-muted-foreground" />
                                  <span>Delete Folder</span>
                              </DropdownMenuItem>
                          </DropdownMenuContent>
                      </DropdownMenu>
                      <CollapsibleContent>
                          <SidebarMenuSub>
                              {item.children.map((child: any) => (
                                  <TreeItem key={child.id} item={child} level={level + 1} />
                              ))}
                          </SidebarMenuSub>
                      </CollapsibleContent>
                  </SidebarMenuItem>
              </Collapsible>
          )
      }

      // Leaf node (no children)
      // If it's nested (level > 0), it should be a SidebarMenuSubItem/Button
      if (level > 0) {
          return (
              <SidebarMenuSubItem>
                  <SidebarMenuSubButton asChild isActive={isActive}>
                        <Link href={`/materials?folderId=${item.id}`}>
                            <Folder />
                            <span>{item.name}</span>
                        </Link>
                  </SidebarMenuSubButton>
                   <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <button className="absolute right-2 top-1.5 flex h-6 w-6 items-center justify-center rounded-md hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus:outline-none focus:ring-2 focus:ring-sidebar-ring opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreHorizontal className="h-4 w-4" />
                                <span className="sr-only">More</span>
                            </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-48" side="right" align="start">
                            <DropdownMenuItem onClick={() => {
                                setCreateParentId(item.id)
                                setIsCreateOpen(true)
                            }}>
                                <FolderPlus className="text-muted-foreground" />
                                <span>New Subfolder</span>
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => {
                                setRenamingItem({ id: item.id, name: item.name })
                                setNewName(item.name)
                            }}>
                                <Pencil className="text-muted-foreground" />
                                <span>Rename</span>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => setDeleteId(item.id)}>
                                <Trash2 className="text-muted-foreground" />
                                <span>Delete Folder</span>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
              </SidebarMenuSubItem>
          )
      }

      // Top level leaf node
      return (
          <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive}>
                  <Link href={`/materials?folderId=${item.id}`}>
                      <Folder />
                      <span>{item.name}</span>
                  </Link>
              </SidebarMenuButton>
              <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                      <SidebarMenuAction showOnHover>
                          <MoreHorizontal />
                          <span className="sr-only">More</span>
                      </SidebarMenuAction>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-48" side="right" align="start">
                    <DropdownMenuItem onClick={() => {
                        setCreateParentId(item.id)
                        setIsCreateOpen(true)
                    }}>
                        <FolderPlus className="text-muted-foreground" />
                        <span>New Subfolder</span>
                    </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => {
                          setRenamingItem({ id: item.id, name: item.name })
                          setNewName(item.name)
                      }}>
                          <Pencil className="text-muted-foreground" />
                          <span>Rename</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => setDeleteId(item.id)}>
                          <Trash2 className="text-muted-foreground" />
                          <span>Delete Folder</span>
                      </DropdownMenuItem>
                  </DropdownMenuContent>
              </DropdownMenu>
          </SidebarMenuItem>
      )
  }

  return (
    <>
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      <SidebarGroupLabel>
        Organize
        <SidebarGroupAction title="New Folder" onClick={() => {
             setCreateParentId(null)
             setIsCreateOpen(true)
         }}>
            <FolderPlus /> <span className="sr-only">New Folder</span>
        </SidebarGroupAction>
      </SidebarGroupLabel>
      <SidebarMenu>
        
        {/* Dynamic Folders */}
        {folderTree.map((item) => (
          <TreeItem key={item.id} item={item} />
        ))}
      </SidebarMenu>
    </SidebarGroup>

    <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Create New Folder</DialogTitle>
            </DialogHeader>
            <Input 
                placeholder="Folder Name" 
                value={newFolderName} 
                onChange={(e) => setNewFolderName(e.target.value)} 
            />
            <DialogFooter>
                <Button onClick={handleCreate}>Create</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <Dialog open={!!renamingItem} onOpenChange={(open) => !open && setRenamingItem(null)}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Rename Folder</DialogTitle>
            </DialogHeader>
            <Input 
                placeholder="Folder Name" 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)} 
            />
            <DialogFooter>
                <Button onClick={handleRename}>Save</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Delete Folder</DialogTitle>
                <DialogDescription>
                    Are you sure you want to delete this folder? Material inside will be moved to "Unfiled" (visible in All Material).
                </DialogDescription>
            </DialogHeader>
            <DialogFooter>
                <Button variant="outline" onClick={() => setDeleteId(null)}>Cancel</Button>
                <Button variant="destructive" onClick={handleDelete}>Delete</Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>
    </>
  )
}
