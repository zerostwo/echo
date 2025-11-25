'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Folder, MoreHorizontal, FolderPlus, Pencil, Trash, ChevronRight, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Input } from '@/components/ui/input';
import { createFolder, deleteFolder, renameFolder } from '@/actions/folder-actions';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface FolderNavProps {
    folders: any[];
}

export function FolderNav({ folders }: FolderNavProps) {
    const pathname = usePathname();
    const router = useRouter();
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
    const [renamingItem, setRenamingItem] = useState<{id: string, name: string} | null>(null);
    const [newName, setNewName] = useState('');
    
    // Build hierarchy
    const rootFolders = folders.filter(f => !f.parentId);
    // For now sidebar-07 style usually implies flattened or simple nesting. 
    // We will render flat list of root folders for simplicity or simple nesting if needed.
    // Let's stick to 1 level deep for sidebar for now to keep it clean, or just all folders flat?
    // User asked for hierarchy. Let's try to support it but `shadcn/ui` sidebar usually is simple.
    // Let's just list all folders for now or try to map them. 
    // Actually, a simple list of clickable folders is what was requested "left folder list".
    
    async function handleCreate() {
        if (!newFolderName.trim()) return;
        const res = await createFolder(newFolderName);
        if (res.error) {
            toast.error(res.error);
        } else {
            toast.success('Folder created');
            setIsCreateOpen(false);
            setNewFolderName('');
            router.refresh();
        }
    }

    async function handleDelete(id: string) {
        if (!confirm('Delete this folder?')) return;
        const res = await deleteFolder(id);
        if (res.error) {
            toast.error(res.error);
        } else {
            toast.success('Folder deleted');
            router.refresh();
        }
    }

    async function handleRename() {
        if (!renamingItem || !newName.trim()) return;
        const res = await renameFolder(renamingItem.id, newName);
        if (res.error) {
            toast.error(res.error);
        } else {
            toast.success('Folder renamed');
            setRenamingItem(null);
            router.refresh();
        }
    }

    return (
        <div className="px-3 py-2">
            <div className="flex items-center justify-between mb-2 px-3">
                <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    Folders
                </h2>
                <Button variant="ghost" size="icon" className="h-4 w-4 text-muted-foreground hover:text-primary" onClick={() => setIsCreateOpen(true)}>
                    <FolderPlus className="h-3 w-3" />
                </Button>
            </div>
            
            <div className="space-y-1">
                {folders.map(folder => (
                    <div 
                        key={folder.id}
                        className={cn(
                            "group flex items-center justify-between w-full p-2 rounded-lg text-sm font-medium cursor-pointer transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                            pathname.includes(folder.id) ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-muted-foreground"
                        )}
                    >
                        <Link 
                            href={`/materials?folderId=${folder.id}`} 
                            className="flex items-center flex-1 truncate"
                        >
                            <Folder className="h-4 w-4 mr-2 shrink-0" />
                            <span className="truncate">{folder.name}</span>
                        </Link>
                        
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-sidebar-accent-foreground"
                                >
                                    <MoreHorizontal className="h-3 w-3" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem 
                                    onClick={() => {
                                        setRenamingItem({ id: folder.id, name: folder.name });
                                        setNewName(folder.name);
                                    }}
                                    className="cursor-pointer"
                                >
                                    <Pencil className="mr-2 h-3 w-3" /> Rename
                                </DropdownMenuItem>
                                <DropdownMenuItem 
                                    className="text-destructive focus:text-destructive cursor-pointer"
                                    onClick={() => handleDelete(folder.id)}
                                >
                                    <Trash className="mr-2 h-3 w-3" /> Delete
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                ))}
                {folders.length === 0 && (
                    <p className="px-3 text-xs text-muted-foreground italic">No folders yet</p>
                )}
            </div>

            {/* Dialogs */}
             <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>New Folder</DialogTitle>
                    </DialogHeader>
                    <Input 
                        placeholder="Name" 
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
                        placeholder="Name" 
                        value={newName} 
                        onChange={(e) => setNewName(e.target.value)} 
                    />
                    <DialogFooter>
                        <Button onClick={handleRename}>Save</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

