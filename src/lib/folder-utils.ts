// Folder types and utility functions for folder tree operations

export interface Folder {
  id: string;
  name: string;
  parentId: string | null;
  userId: string;
  order: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface FolderTreeNode extends Folder {
  children: FolderTreeNode[];
  depth: number;
}

/**
 * Build a hierarchical tree structure from a flat list of folders
 */
export function buildFolderTree(folders: Folder[]): FolderTreeNode[] {
  const folderMap = new Map<string, FolderTreeNode>();
  const rootFolders: FolderTreeNode[] = [];

  // First pass: create nodes for all folders
  folders.forEach(folder => {
    folderMap.set(folder.id, {
      ...folder,
      children: [],
      depth: 0,
    });
  });

  // Second pass: build hierarchy
  folders.forEach(folder => {
    const node = folderMap.get(folder.id)!;
    
    if (folder.parentId && folderMap.has(folder.parentId)) {
      const parent = folderMap.get(folder.parentId)!;
      node.depth = parent.depth + 1;
      parent.children.push(node);
    } else {
      rootFolders.push(node);
    }
  });

  // Sort by order at each level
  const sortByOrder = (nodes: FolderTreeNode[]): FolderTreeNode[] => {
    nodes.sort((a, b) => a.order - b.order);
    nodes.forEach(node => {
      node.children = sortByOrder(node.children);
    });
    return nodes;
  };

  return sortByOrder(rootFolders);
}

/**
 * Flatten a folder tree back into a list with correct depth info
 */
export function flattenFolderTree(tree: FolderTreeNode[]): FolderTreeNode[] {
  const result: FolderTreeNode[] = [];

  const traverse = (nodes: FolderTreeNode[], depth: number) => {
    nodes.forEach(node => {
      result.push({ ...node, depth });
      traverse(node.children, depth + 1);
    });
  };

  traverse(tree, 0);
  return result;
}

/**
 * Find a folder by ID in a tree structure
 */
export function findFolderInTree(
  tree: FolderTreeNode[],
  folderId: string
): FolderTreeNode | null {
  for (const node of tree) {
    if (node.id === folderId) return node;
    const found = findFolderInTree(node.children, folderId);
    if (found) return found;
  }
  return null;
}

/**
 * Get all ancestor IDs of a folder
 */
export function getAncestorIds(folders: Folder[], folderId: string): string[] {
  const ancestors: string[] = [];
  let current = folders.find(f => f.id === folderId);
  
  while (current?.parentId) {
    ancestors.push(current.parentId);
    current = folders.find(f => f.id === current!.parentId);
  }
  
  return ancestors;
}

/**
 * Get the full folder path from root to the specified folder
 * Returns array of folders in order from root to target (inclusive)
 */
export function getFolderPath(folders: Folder[], folderId: string): Folder[] {
  const path: Folder[] = [];
  let current = folders.find(f => f.id === folderId);
  
  while (current) {
    path.unshift(current); // Add to beginning
    if (current.parentId) {
      current = folders.find(f => f.id === current!.parentId);
    } else {
      break;
    }
  }
  
  return path;
}

/**
 * Check if moving a folder would create a circular reference
 */
export function wouldCreateCircularRef(
  folders: Folder[],
  folderId: string,
  newParentId: string | null
): boolean {
  if (!newParentId) return false;
  if (folderId === newParentId) return true;
  
  const ancestors = getAncestorIds(folders, newParentId);
  return ancestors.includes(folderId);
}

/**
 * Get all descendant IDs of a folder
 */
export function getDescendantIds(folders: Folder[], folderId: string): string[] {
  const descendants: string[] = [];
  const children = folders.filter(f => f.parentId === folderId);
  
  children.forEach(child => {
    descendants.push(child.id);
    descendants.push(...getDescendantIds(folders, child.id));
  });
  
  return descendants;
}

/**
 * Calculate new order values when moving items
 */
export function calculateNewOrder(
  items: { id: string; order: number }[],
  activeId: string,
  overId: string
): { id: string; newOrder: number }[] {
  const oldIndex = items.findIndex(item => item.id === activeId);
  const newIndex = items.findIndex(item => item.id === overId);
  
  if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) {
    return [];
  }

  // Create a copy and reorder
  const reordered = [...items];
  const [removed] = reordered.splice(oldIndex, 1);
  reordered.splice(newIndex, 0, removed);

  // Return new orders for all affected items
  return reordered.map((item, index) => ({
    id: item.id,
    newOrder: index,
  }));
}

