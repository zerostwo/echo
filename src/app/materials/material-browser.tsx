'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Folder, FileAudio, MoreVertical, FolderPlus, Pencil, Trash, ChevronLeft, Upload, Grid, List, RefreshCw, BookOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { UploadMaterialDialog } from './upload-dialog';
import { createFolder, deleteFolder, renameFolder } from '@/actions/folder-actions';
import { deleteMaterial, renameMaterial, uploadMaterial, transcribeMaterial } from '@/actions/material-actions';
import { extractVocabulary } from '@/actions/vocab-actions';
import { moveMaterial } from '@/actions/move-actions';
import { toast } from 'sonner';
import { DndContext, useDraggable, useDroppable, DragOverlay, MouseSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import { useUserSettings } from '@/components/user-settings-provider';
import { formatInTimeZone } from '@/lib/time';

interface MaterialBrowserProps {
  folders: any[];
  materials: any[];
  currentFolderId: string | null;
  parentFolderId?: string | null;
}

function DraggableItem({ id, type, children, className }: any) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: JSON.stringify({ id, type }),
        data: { id, type }
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.5 : 1,
    };

    return (
        <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={className}>
            {children}
        </div>
    );
}

function DroppableFolder({ id, children, className }: any) {
    const { setNodeRef, isOver } = useDroppable({
        id: JSON.stringify({ id, type: 'folder' }),
        data: { id, type: 'folder' }
    });

    return (
        <div ref={setNodeRef} className={cn(className, isOver && "ring-2 ring-primary bg-primary/10")}>
            {children}
        </div>
    );
}

function FileDropZone({ onDrop, children }: { onDrop: (files: FileList) => void, children: React.ReactNode }) {
    const [isDragOver, setIsDragOver] = useState(false);

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = () => {
        setIsDragOver(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onDrop(e.dataTransfer.files);
        }
    };

    return (
        <div 
            onDragOver={handleDragOver} 
            onDragLeave={handleDragLeave} 
            onDrop={handleDrop}
            className={cn("min-h-[500px] rounded-lg border-2 border-transparent transition-all", isDragOver && "border-dashed border-primary bg-primary/5")}
        >
            {children}
            {isDragOver && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="bg-background/80 backdrop-blur p-4 rounded-lg shadow-lg">
                        <Upload className="h-8 w-8 mx-auto mb-2 text-primary" />
                        <p className="font-medium">Drop files to upload</p>
                    </div>
                </div>
            )}
        </div>
    );
}

export function MaterialBrowser({ folders, materials, currentFolderId, parentFolderId }: MaterialBrowserProps) {
  const router = useRouter();
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  
  const [renamingItem, setRenamingItem] = useState<{id: string, type: 'folder' | 'material', name: string} | null>(null);
  const [newName, setNewName] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; type: 'folder' | 'material'; name: string } | null>(null);

  // Configure sensors to ignore small movements (clicks) so they propagate to children (Dropdowns)
  const sensors = useSensors(
      useSensor(MouseSensor, {
          activationConstraint: {
              distance: 10,
          },
      }),
      useSensor(TouchSensor, {
          activationConstraint: {
              delay: 250,
              tolerance: 5,
          },
      })
  );
  const { timezone } = useUserSettings();

  async function handleCreateFolder() {
      if (!newFolderName.trim()) return;
      const res = await createFolder(newFolderName, currentFolderId || undefined);
      if (res.error) {
          toast.error(res.error);
      } else {
          toast.success('Folder created');
          setIsCreateFolderOpen(false);
          setNewFolderName('');
      }
  }

  const openDeleteDialog = (id: string, type: 'folder' | 'material', name: string) => {
      setDeleteTarget({ id, type, name });
  };

  async function handleDeleteConfirm() {
      if (!deleteTarget) return;
      const res = deleteTarget.type === 'folder' ? await deleteFolder(deleteTarget.id) : await deleteMaterial(deleteTarget.id);
      if (res.error) {
          toast.error(res.error);
      } else {
          toast.success('Deleted successfully');
      }
      setDeleteTarget(null);
  }

  async function handleRename() {
      if (!renamingItem || !newName.trim()) return;
      
      const res = renamingItem.type === 'folder' 
          ? await renameFolder(renamingItem.id, newName)
          : await renameMaterial(renamingItem.id, newName);
          
      if (res.error) {
          toast.error(res.error);
      } else {
          toast.success('Renamed successfully');
          setRenamingItem(null);
      }
  }

  async function handleRetranscribe(id: string) {
      const toastId = toast.loading('Starting transcription...');
      const res = await transcribeMaterial(id);
      if (res.error) {
          toast.error(res.error, { id: toastId });
      } else {
          toast.success('Transcription started', { id: toastId });
      }
  }

  async function handleReextractVocabulary(id: string) {
      const toastId = toast.loading('Starting vocabulary extraction...');
      const res = await extractVocabulary(id);
      if (res?.error) {
          toast.error(res.error, { id: toastId });
      } else {
          toast.success('Vocabulary extraction started', { id: toastId });
      }
  }

  async function handleFileDrop(files: FileList) {
      const formData = new FormData();
      // Currently only support single file upload via drop for simplicity, or loop for multiple
      // Let's do one for now to be safe with server actions
      const file = files[0];
      formData.append('file', file);
      if (currentFolderId) {
          formData.append('folderId', currentFolderId);
      }

      const toastId = toast.loading(`Uploading ${file.name}...`);
      
      const res = await uploadMaterial(formData);
      
      if (res.error) {
          toast.error(res.error, { id: toastId });
      } else {
          toast.success('Uploaded successfully', { id: toastId });
          // Auto-transcribe after upload
          if (res.materialId) {
              transcribeMaterial(res.materialId);
          }
      }
  }

  async function handleDragEnd(event: any) {
      const { active, over } = event;
      
      if (over && active.id !== over.id) {
          const overData = JSON.parse(over.id);
          const activeData = JSON.parse(active.id);

          // Only allow moving materials into folders
          if (activeData.type === 'material' && overData.type === 'folder') {
               const toastId = toast.loading('Moving file...');
               const res = await moveMaterial(activeData.id, overData.id);
               
               if (res.error) {
                   toast.error(res.error, { id: toastId });
               } else {
                   toast.success('Moved successfully', { id: toastId });
               }
          }
      }
  }

  return (
    <DndContext onDragEnd={handleDragEnd} sensors={sensors}>
        <FileDropZone onDrop={handleFileDrop}>
            <div className="relative">
                <div className="flex justify-between items-center mb-6">
                    <div className="flex items-center gap-4">
                        {currentFolderId && (
                            <Link href={parentFolderId ? `/materials?folderId=${parentFolderId}` : '/materials'}>
                                <Button variant="ghost" size="icon">
                                    <ChevronLeft className="h-5 w-5" />
                                </Button>
                            </Link>
                        )}
                        <h1 className="text-3xl font-bold">Materials</h1>
                    </div>
                    <div className="flex gap-2 items-center">
                         <div className="flex bg-muted rounded-lg p-1 mr-2">
                            <Button 
                                variant={viewMode === 'grid' ? 'secondary' : 'ghost'} 
                                size="icon" 
                                className="h-8 w-8"
                                onClick={() => setViewMode('grid')}
                            >
                                <Grid className="h-4 w-4" />
                            </Button>
                            <Button 
                                variant={viewMode === 'list' ? 'secondary' : 'ghost'} 
                                size="icon" 
                                className="h-8 w-8"
                                onClick={() => setViewMode('list')}
                            >
                                <List className="h-4 w-4" />
                            </Button>
                        </div>

                        <Button variant="outline" onClick={() => setIsCreateFolderOpen(true)}>
                            <FolderPlus className="mr-2 h-4 w-4" />
                            New Folder
                        </Button>
                        <UploadMaterialDialog folderId={currentFolderId} />
                    </div>
                </div>

                <div className={cn(
                    "grid gap-4",
                    viewMode === 'grid' ? "md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" : "grid-cols-1"
                )}>
                    {folders.map((folder) => (
                        <DroppableFolder key={folder.id} id={folder.id} className="h-full">
                            <Card className="hover:bg-muted/50 transition-colors cursor-pointer group h-full">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div 
                                        className="flex items-center gap-3 flex-1"
                                        onClick={() => router.push(`/materials?folderId=${folder.id}`)}
                                    >
                                        <Folder className="h-10 w-10 text-blue-500 fill-blue-500/20" />
                                        <span className="font-medium truncate">{folder.name}</span>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem onClick={(e) => {
                                                e.stopPropagation(); // Prevent drag
                                                setRenamingItem({ id: folder.id, type: 'folder', name: folder.name });
                                                setNewName(folder.name);
                                            }}>
                                                <Pencil className="mr-2 h-4 w-4" /> Rename
                                            </DropdownMenuItem>
                                            <DropdownMenuItem className="text-destructive" onClick={(e) => {
                                                e.stopPropagation(); // Prevent drag
                                                openDeleteDialog(folder.id, 'folder', folder.name);
                                            }}>
                                                <Trash className="mr-2 h-4 w-4" /> Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </CardContent>
                            </Card>
                        </DroppableFolder>
                    ))}

                    {materials.map((material) => (
                        <DraggableItem key={material.id} id={material.id} type="material" className="h-full">
                            <Card className="group h-full">
                                <CardContent className="p-4 flex items-center justify-between">
                                    <div className="flex items-center gap-3 flex-1 overflow-hidden">
                                        <FileAudio className="h-10 w-10 text-purple-500" />
                                        <div className="flex flex-col min-w-0">
                                            <Link href={`/materials/${material.id}`} className="font-medium truncate hover:underline">
                                                {material.title}
                                            </Link>
                                            <div className="flex gap-2 text-xs text-muted-foreground">
                                                <span>{(material.size / 1024 / 1024).toFixed(1)} MB</span>
                                                {viewMode === 'list' && (
                                                    <span>• {formatInTimeZone(material.createdAt, timezone, { dateStyle: 'medium' })}</span>
                                                )}
                                                <span className={material.isProcessed ? "text-green-600" : "text-amber-600"}>
                                                    • {material.isProcessed ? 'Processed' : 'Processing'}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button variant="ghost" size="icon" className="opacity-0 group-hover:opacity-100">
                                                <MoreVertical className="h-4 w-4" />
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent>
                                            <DropdownMenuItem onClick={(e) => {
                                                e.stopPropagation();
                                                handleRetranscribe(material.id);
                                            }}>
                                                <RefreshCw className="mr-2 h-4 w-4" /> Re-transcribe
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={(e) => {
                                                e.stopPropagation();
                                                handleReextractVocabulary(material.id);
                                            }}>
                                                <BookOpen className="mr-2 h-4 w-4" /> Re-extract Vocabulary
                                            </DropdownMenuItem>
                                            <DropdownMenuItem onClick={(e) => {
                                                e.stopPropagation();
                                                setRenamingItem({ id: material.id, type: 'material', name: material.title });
                                                setNewName(material.title);
                                            }}>
                                                <Pencil className="mr-2 h-4 w-4" /> Rename
                                            </DropdownMenuItem>
                                            <DropdownMenuItem className="text-destructive" onClick={(e) => {
                                                e.stopPropagation();
                                                openDeleteDialog(material.id, 'material', material.title);
                                            }}>
                                                <Trash className="mr-2 h-4 w-4" /> Delete
                                            </DropdownMenuItem>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </CardContent>
                            </Card>
                        </DraggableItem>
                    ))}
                    
                    {folders.length === 0 && materials.length === 0 && (
                        <div className="col-span-full flex flex-col items-center justify-center py-12 text-muted-foreground">
                            <Folder className="h-12 w-12 mb-4 text-muted-foreground/20" />
                            <p>No items in this folder. Drop files here to upload.</p>
                        </div>
                    )}
                </div>

                {/* Create Folder Dialog */}
                <Dialog open={isCreateFolderOpen} onOpenChange={setIsCreateFolderOpen}>
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
                            <Button onClick={handleCreateFolder}>Create</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Rename Dialog */}
                <Dialog open={!!renamingItem} onOpenChange={(open) => !open && setRenamingItem(null)}>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Rename {renamingItem?.type}</DialogTitle>
                        </DialogHeader>
                        <Input 
                            placeholder="New Name" 
                            value={newName} 
                            onChange={(e) => setNewName(e.target.value)}
                        />
                        <DialogFooter>
                            <Button onClick={handleRename}>Save</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

                {/* Delete Confirmation */}
                <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Delete {deleteTarget?.name}?</AlertDialogTitle>
                            <AlertDialogDescription>
                                This will move the {deleteTarget?.type} to trash.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-red-600 hover:bg-red-700">
                                Delete
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>
            </div>
        </FileDropZone>
    </DndContext>
  )
}
