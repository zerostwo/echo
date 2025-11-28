'use client';

import { useState, useMemo, useCallback } from 'react';
import { Search, FileAudio, FileVideo, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { bulkMoveMaterials } from '@/actions/folder-actions';

interface Material {
  id: string;
  title: string;
  folderId: string | null;
  mimeType?: string;
}

interface AddMaterialsDialogProps {
  folderId: string | null;
  folderName?: string;
  materials: Material[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function AddMaterialsDialog({
  folderId,
  folderName,
  materials,
  open,
  onOpenChange,
  onSuccess,
}: AddMaterialsDialogProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  // Filter materials - show only those NOT already in this folder
  const availableMaterials = useMemo(() => {
    return materials.filter(m => m.folderId !== folderId);
  }, [materials, folderId]);

  // Filter by search query
  const filteredMaterials = useMemo(() => {
    if (!searchQuery.trim()) return availableMaterials;
    
    const query = searchQuery.toLowerCase();
    return availableMaterials.filter(m => 
      m.title.toLowerCase().includes(query)
    );
  }, [availableMaterials, searchQuery]);

  // Toggle selection
  const toggleSelection = useCallback((materialId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(materialId)) {
        next.delete(materialId);
      } else {
        next.add(materialId);
      }
      return next;
    });
  }, []);

  // Select all filtered materials
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(filteredMaterials.map(m => m.id)));
  }, [filteredMaterials]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Handle confirm
  const handleConfirm = async () => {
    if (selectedIds.size === 0 || !folderId) return;

    setIsLoading(true);
    try {
      const result = await bulkMoveMaterials(Array.from(selectedIds), folderId);
      
      if (result.error) {
        toast.error(result.error);
      } else {
        toast.success(`Moved ${result.count} material${result.count === 1 ? '' : 's'} to folder`);
        setSelectedIds(new Set());
        setSearchQuery('');
        onSuccess?.();
      }
    } catch (error) {
      toast.error('Failed to move materials');
    } finally {
      setIsLoading(false);
    }
  };

  // Reset state when dialog closes
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setSearchQuery('');
      setSelectedIds(new Set());
    }
    onOpenChange(open);
  };

  // Get icon for material type
  const getMaterialIcon = (mimeType?: string) => {
    if (mimeType?.startsWith('video/')) {
      return <FileVideo className="h-4 w-4 text-blue-500" />;
    }
    return <FileAudio className="h-4 w-4 text-green-500" />;
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Materials to Folder</DialogTitle>
          <DialogDescription>
            Select materials to add to {folderName ? `"${folderName}"` : 'this folder'}.
          </DialogDescription>
        </DialogHeader>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search materials..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Selection controls */}
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {selectedIds.size} of {filteredMaterials.length} selected
          </span>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={selectAll}
              disabled={filteredMaterials.length === 0}
            >
              Select all
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearSelection}
              disabled={selectedIds.size === 0}
            >
              Clear
            </Button>
          </div>
        </div>

        {/* Materials list */}
        <ScrollArea className="h-[300px] rounded-md border">
          {filteredMaterials.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-muted-foreground">
              {availableMaterials.length === 0 ? (
                <>
                  <FileAudio className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">All materials are already in this folder</p>
                </>
              ) : (
                <>
                  <Search className="h-8 w-8 mb-2 opacity-50" />
                  <p className="text-sm">No materials match your search</p>
                </>
              )}
            </div>
          ) : (
            <div className="p-1">
              {filteredMaterials.map(material => (
                <label
                  key={material.id}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 cursor-pointer transition-colors',
                    selectedIds.has(material.id)
                      ? 'bg-accent'
                      : 'hover:bg-accent/50'
                  )}
                >
                  <Checkbox
                    checked={selectedIds.has(material.id)}
                    onCheckedChange={() => toggleSelection(material.id)}
                  />
                  {getMaterialIcon(material.mimeType)}
                  <span className="flex-1 truncate text-sm font-medium">
                    {material.title}
                  </span>
                </label>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={selectedIds.size === 0 || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Moving...
              </>
            ) : (
              `Add ${selectedIds.size} Material${selectedIds.size === 1 ? '' : 's'}`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

