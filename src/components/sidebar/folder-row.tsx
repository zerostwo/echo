'use client';

import { useRouter } from 'next/navigation';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  Folder,
  FolderOpen,
  Plus,
  MoreHorizontal,
  Pencil,
  FolderPlus,
  Trash,
  Star,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { FolderTreeNode } from '@/lib/folder-utils';

export type DropPosition = 'before' | 'inside' | 'after' | null;

interface FolderRowProps {
  folder: FolderTreeNode;
  isExpanded: boolean;
  hasChildren: boolean;
  dropPosition?: DropPosition;
  isDragging?: boolean;
  isDraggedOver?: boolean;
  onToggleExpand: () => void;
  onRename: (folder: FolderTreeNode) => void;
  onCreateSubfolder: (parentId: string) => void;
  onDelete: (folderId: string) => void;
  onAddMaterials: (folderId: string) => void;
  onAddToFavorites?: (folderId: string) => void;
}

export function FolderRow({
  folder,
  isExpanded,
  hasChildren,
  dropPosition,
  isDragging,
  isDraggedOver,
  onToggleExpand,
  onRename,
  onCreateSubfolder,
  onDelete,
  onAddMaterials,
  onAddToFavorites,
}: FolderRowProps) {
  const router = useRouter();
  const searchParams = typeof window !== 'undefined' 
    ? new URLSearchParams(window.location.search) 
    : null;
  const currentFolderId = searchParams?.get('folderId');
  const isActive = currentFolderId === folder.id;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging: isSortableDragging,
  } = useSortable({
    id: folder.id,
    data: {
      type: 'folder',
      folder,
    },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const depth = folder.depth || 0;
  // Indentation: 8px base + 16px per depth level for nested folders
  const paddingLeft = 8 + depth * 16;

  // Navigate to folder
  const handleNavigate = () => {
    router.push(`/materials?folderId=${folder.id}`);
  };

  // Handle chevron click to toggle expand
  const handleChevronClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand();
  };

  // Handle row click - navigate to folder
  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault();
    handleNavigate();
  };

  // Determine if we should show the folder as "open" visually
  // Show as open when: expanded OR being dragged over for "inside" drop
  const showAsOpen = isExpanded || (isDraggedOver && dropPosition === 'inside');

  return (
    <div className="relative">
      {/* Drop indicator line - before */}
      {dropPosition === 'before' && (
        <div 
          className="absolute left-0 right-0 top-0 h-0.5 bg-primary rounded-full z-10"
          style={{ marginLeft: paddingLeft }}
        />
      )}
      
      <div
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        className={cn(
          'group relative flex items-center gap-1 rounded-md transition-all duration-150 cursor-grab active:cursor-grabbing select-none',
          // Dragging state
          (isDragging || isSortableDragging) && 'opacity-40',
          // Drop target "inside" - blue ring around folder
          dropPosition === 'inside' && 'ring-2 ring-primary bg-primary/10',
          // Active folder (selected)
          isActive && !dropPosition
            ? 'bg-sidebar-accent text-sidebar-accent-foreground' 
            : 'hover:bg-sidebar-accent/50 text-muted-foreground hover:text-foreground'
        )}
      >
        {/* Clickable folder content */}
        <div
          onClick={handleClick}
          style={{ paddingLeft }}
          className="flex items-center gap-1.5 flex-1 py-1.5 pr-2 min-w-0 cursor-pointer"
        >
          {/* Expand/collapse chevron - only shown if has children */}
          {hasChildren ? (
            <button
              onClick={handleChevronClick}
              className="shrink-0 p-0.5 rounded hover:bg-sidebar-accent transition-colors"
            >
              <ChevronRight 
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-200",
                  (isExpanded || showAsOpen) && "rotate-90"
                )} 
              />
            </button>
          ) : (
            <span className="w-4.5 shrink-0" />
          )}

          {/* Folder icon - changes based on open/closed state */}
          {showAsOpen ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-amber-500 transition-all duration-150" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-amber-500 transition-all duration-150" />
          )}
          
          {/* Folder name */}
          <span className="truncate text-sm font-medium">{folder.name}</span>
        </div>

        {/* Hover actions - only visible on hover of this specific row */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pr-1.5 shrink-0">
          {/* Add subfolder button */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.stopPropagation();
                  onCreateSubfolder(folder.id);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top" sideOffset={4}>
              Create subfolder
            </TooltipContent>
          </Tooltip>

          {/* More actions dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6 text-muted-foreground hover:text-foreground"
                onClick={(e) => e.stopPropagation()}
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onRename(folder)}>
                <Pencil className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onCreateSubfolder(folder.id)}>
                <FolderPlus className="mr-2 h-4 w-4" />
                Create subfolder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAddMaterials(folder.id)}>
                <Plus className="mr-2 h-4 w-4" />
                Add materials
              </DropdownMenuItem>
              {onAddToFavorites && (
                <DropdownMenuItem onClick={() => onAddToFavorites(folder.id)}>
                  <Star className="mr-2 h-4 w-4" />
                  Add to favorites
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="destructive"
                onClick={() => onDelete(folder.id)}
              >
                <Trash className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Drop indicator line - after */}
      {dropPosition === 'after' && (
        <div 
          className="absolute left-0 right-0 bottom-0 h-0.5 bg-primary rounded-full z-10"
          style={{ marginLeft: paddingLeft }}
        />
      )}
    </div>
  );
}
