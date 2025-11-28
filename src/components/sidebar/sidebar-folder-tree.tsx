'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Folder as FolderGlyph, FolderOpen, FolderPlus, MoreHorizontal, Pencil, Trash, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

import {
  createFolder,
  renameFolder,
  deleteFolder,
} from '@/actions/folder-actions';
import type { Folder } from '@/lib/folder-utils';

interface SidebarFolderTreeProps {
  folders: Folder[];
  materials?: { id: string; title: string; folderId: string | null }[];
}

export function SidebarFolderTree({ folders, materials = [] }: SidebarFolderTreeProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentFolderId = searchParams.get('folderId');

  // State for collapsible section
  const [isOrganizeOpen, setIsOrganizeOpen] = useState(true);

  // State for inline folder creation
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const newFolderInputRef = useRef<HTMLInputElement>(null);
  
  // State for inline renaming
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);

  // State for delete confirmation dialog
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [folderToDelete, setFolderToDelete] = useState<Folder | null>(null);

  // Focus input when creating new folder
  useEffect(() => {
    if (isCreatingFolder && newFolderInputRef.current) {
      newFolderInputRef.current.focus();
    }
  }, [isCreatingFolder]);

  // Focus input when renaming folder
  useEffect(() => {
    if (renamingFolderId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingFolderId]);

  // Sort folders by name (filename)
  const sortedFolders = [...folders].sort((a, b) => a.name.localeCompare(b.name));

  // Check if folder is selected
  const isSelected = (folderId: string) => currentFolderId === folderId;

  // Create folder handler
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) {
      setIsCreatingFolder(false);
      setNewFolderName('');
      return;
    }

    // Check for duplicate folder name
    const trimmedName = newFolderName.trim();
    const isDuplicate = folders.some(
      (f) => f.name.toLowerCase() === trimmedName.toLowerCase()
    );
    
    if (isDuplicate) {
      toast.error('A folder with this name already exists');
      return;
    }

    const result = await createFolder(trimmedName);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Folder created');
      router.refresh();
    }
    setIsCreatingFolder(false);
    setNewFolderName('');
  };

  // Start creating a new folder
  const startCreatingFolder = () => {
    setNewFolderName('');
    setIsCreatingFolder(true);
  };

  // Cancel folder creation
  const cancelCreatingFolder = () => {
    setIsCreatingFolder(false);
    setNewFolderName('');
  };

  // Rename folder handler
  const handleRenameFolder = async () => {
    if (!renamingFolderId || !renameValue.trim()) {
      setRenamingFolderId(null);
      setRenameValue('');
      return;
    }

    // Check for duplicate folder name (excluding current folder)
    const trimmedName = renameValue.trim();
    const isDuplicate = folders.some(
      (f) => f.id !== renamingFolderId && f.name.toLowerCase() === trimmedName.toLowerCase()
    );
    
    if (isDuplicate) {
      toast.error('A folder with this name already exists');
      return;
    }

    const result = await renameFolder(renamingFolderId, trimmedName);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Folder renamed');
      router.refresh();
    }
    setRenamingFolderId(null);
    setRenameValue('');
  };
  
  // Cancel renaming
  const cancelRenaming = () => {
    setRenamingFolderId(null);
    setRenameValue('');
  };

  // Open delete confirmation dialog
  const openDeleteDialog = (folder: Folder) => {
    setFolderToDelete(folder);
    setDeleteDialogOpen(true);
  };

  // Delete folder handler
  const handleDeleteFolder = async () => {
    if (!folderToDelete) return;

    const result = await deleteFolder(folderToDelete.id);
    if (result.error) {
      toast.error(result.error);
    } else {
      toast.success('Folder deleted');
      router.refresh();
    }
    setDeleteDialogOpen(false);
    setFolderToDelete(null);
  };

  // Start inline renaming
  const startRenaming = (folder: Folder) => {
    setRenamingFolderId(folder.id);
    setRenameValue(folder.name);
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <Collapsible open={isOrganizeOpen} onOpenChange={setIsOrganizeOpen} className="flex flex-col min-h-0">
        {/* Organize Header - matches SidebarGroupLabel styling exactly */}
        <div className="flex h-8 shrink-0 items-center justify-between rounded-md px-2">
          <CollapsibleTrigger asChild>
            <button className="flex items-center gap-1 text-xs font-medium text-sidebar-foreground/70 hover:text-sidebar-foreground transition-colors">
              <span>Folders</span>
              <ChevronRight 
                className={cn(
                  "size-4 text-muted-foreground transition-transform duration-200",
                  isOrganizeOpen && "rotate-90"
                )} 
              />
            </button>
          </CollapsibleTrigger>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  startCreatingFolder();
                }}
              >
                <FolderPlus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={4}>
              Create folder
            </TooltipContent>
          </Tooltip>
        </div>

        <CollapsibleContent className="flex-1 min-h-0 overflow-hidden">
          <div className="h-full overflow-y-auto">
              <div className="space-y-0.5 py-1">
              {sortedFolders.length === 0 && !isCreatingFolder && (
                <div className="px-2 py-6 text-center">
                  <FolderGlyph className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground mb-3">
                    No folders yet
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-sm"
                    onClick={() => startCreatingFolder()}
                  >
                    Create folder
                  </Button>
                </div>
              )}
              
              {/* Inline input for new folder */}
              {isCreatingFolder && (
                <div className="flex items-center gap-2 rounded-md h-8 px-2">
                  <FolderGlyph className="size-4 shrink-0 text-muted-foreground" />
                  <input
                    ref={newFolderInputRef}
                    type="text"
                    className="flex-1 bg-sidebar-accent text-sm border border-primary/50 rounded px-2 py-0.5 outline-none focus:border-primary"
                    placeholder="New Folder"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateFolder();
                      } else if (e.key === 'Escape') {
                        cancelCreatingFolder();
                      }
                    }}
                    onBlur={() => {
                      if (newFolderName.trim()) {
                        handleCreateFolder();
                      } else {
                        cancelCreatingFolder();
                      }
                    }}
                  />
                </div>
              )}

              {/* Folder list */}
              {sortedFolders.map((folder) => {
                const selected = isSelected(folder.id);
                const FolderIcon = selected ? FolderOpen : FolderGlyph;
                const isRenaming = renamingFolderId === folder.id;
                
                return (
                  <div
                    key={folder.id}
                    className={cn(
                      "group/folder flex items-center justify-between rounded-md text-sm h-8 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground pr-1.5",
                      selected && "bg-sidebar-accent text-sidebar-accent-foreground"
                    )}
                  >
                    {isRenaming ? (
                      // Inline rename input
                      <div className="flex items-center gap-2 flex-1 px-2 h-full">
                        <FolderIcon className={cn(
                          "size-4 shrink-0",
                          selected ? "text-amber-500" : "text-muted-foreground"
                        )} />
                        <input
                          ref={renameInputRef}
                          type="text"
                          className="flex-1 bg-sidebar-accent text-sm border border-primary/50 rounded px-2 py-0.5 outline-none focus:border-primary"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleRenameFolder();
                            } else if (e.key === 'Escape') {
                              cancelRenaming();
                            }
                          }}
                          onBlur={() => {
                            if (renameValue.trim()) {
                              handleRenameFolder();
                            } else {
                              cancelRenaming();
                            }
                          }}
                        />
                      </div>
                    ) : (
                      // Normal folder link
                      <Link
                        href={`/materials?folderId=${folder.id}`}
                        className="flex items-center gap-2 flex-1 px-2 h-full truncate"
                      >
                        <FolderIcon className={cn(
                          "size-4 shrink-0",
                          selected ? "text-amber-500" : "text-muted-foreground"
                        )} />
                        <span className="truncate">{folder.name}</span>
                      </Link>
                    )}
                    
                    {!isRenaming && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 opacity-0 group-hover/folder:opacity-100 text-muted-foreground hover:text-sidebar-accent-foreground"
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-40">
                          <DropdownMenuItem
                            onClick={() => startRenaming(folder)}
                            className="cursor-pointer"
                          >
                            <Pencil className="mr-2 size-4" /> Rename
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive cursor-pointer"
                            onClick={() => openDeleteDialog(folder)}
                          >
                            <Trash className="mr-2 size-4" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                );
              })}
              </div>
            </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete folder?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{folderToDelete?.name}"? Materials inside will be moved to unfiled.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFolder}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
