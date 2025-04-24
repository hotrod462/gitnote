'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { getFileTree, type FileTreeItem, createFolder, createOrUpdateFile, deleteFile } from '@/lib/actions/githubApi';
import { Skeleton } from "@/components/ui/skeleton";
import { File, Folder, FolderOpen, ChevronRight, ChevronDown, Loader2, FilePlus, FolderPlus, MoreHorizontal, Trash2 } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter, 
  DialogClose
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";

// Define props interface
interface FileTreeProps {
  selectedFilePath: string | null;
  onFileSelect: (filePath: string) => void;
}

// Recursive component to render tree items
interface RenderTreeItemProps {
  item: FileTreeItem;
  level: number;
  selectedFilePath: string | null;
  expandedFolders: Set<string>;
  loadingFolders: Set<string>;
  childrenCache: Record<string, FileTreeItem[]>;
  onFolderToggle: (path: string) => void;
  onFileClick: (path: string) => void;
  onRequestDelete: (item: FileTreeItem) => void;
}

const RenderTreeItem: React.FC<RenderTreeItemProps> = React.memo(({
  item,
  level,
  selectedFilePath,
  expandedFolders,
  loadingFolders,
  childrenCache,
  onFolderToggle,
  onFileClick,
  onRequestDelete
}) => {
  const isExpanded = expandedFolders.has(item.path);
  const isLoading = loadingFolders.has(item.path);
  const children = childrenCache[item.path];
  const indentStyle = { paddingLeft: `${level * 1.25}rem` }; // Indentation based on level

  const handleItemClick = () => {
    if (item.type === 'dir') {
      onFolderToggle(item.path);
    } else {
      onFileClick(item.path);
    }
  };

  return (
    <li key={item.path} className="group relative">
      <button
        onClick={handleItemClick}
        className={`flex items-center space-x-1 p-1 rounded w-full text-left text-sm hover:bg-accent ${selectedFilePath === item.path ? 'bg-accent font-medium' : ''}`}
        style={indentStyle}
      >
        {item.type === 'dir' ? (
          <>
            {isLoading ? (
              <Loader2 size={16} className="animate-spin text-muted-foreground" />
            ) : (
              isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />
            )}
            {isExpanded ? <FolderOpen size={16} className="text-sky-600" /> : <Folder size={16} className="text-sky-600" />}
          </>
        ) : (
          <File size={16} className="ml-[16px] text-muted-foreground" /> // Add margin to align with folder icons
        )}
        <span className="flex-grow truncate">{item.name}</span>
      </button>

      <DropdownMenu>
          <DropdownMenuTrigger asChild className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-within:opacity-100">
             <Button variant="ghost" size="icon" className="h-6 w-6">
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Item options</span>
              </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
             {item.type === 'file' && item.sha && (
                  <DropdownMenuItem 
                      className="text-destructive focus:text-destructive focus:bg-destructive/10"
                      onClick={() => onRequestDelete(item)}
                  >
                      <Trash2 className="mr-2 h-4 w-4" />
                      Delete File
                  </DropdownMenuItem>
              )}
          </DropdownMenuContent>
      </DropdownMenu>

      {isExpanded && children && (
        <ul className="space-y-1 mt-1">
          {children.length === 0 && (
            <li className="text-muted-foreground text-xs" style={{ paddingLeft: `${(level + 1) * 1.25}rem` }}>
              Folder is empty
            </li>
          )}
          {children.map((child) => (
            <RenderTreeItem
              key={child.path}
              item={child}
              level={level + 1}
              selectedFilePath={selectedFilePath}
              expandedFolders={expandedFolders}
              loadingFolders={loadingFolders}
              childrenCache={childrenCache}
              onFolderToggle={onFolderToggle}
              onFileClick={onFileClick}
              onRequestDelete={onRequestDelete}
            />
          ))}
        </ul>
      )}
      {isExpanded && isLoading && (
         <div className="space-y-1 pl-4 mt-1" style={{ paddingLeft: `${(level + 1) * 1.25}rem` }}>
           <Skeleton className="h-4 w-10/12" />
           <Skeleton className="h-4 w-8/12" />
         </div>
      )}
    </li>
  );
});

// Helper function to get parent directory
const getParentDirectory = (filePath: string | null): string => {
  if (!filePath) return ''; // Root if no file selected
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash === -1) return ''; // Root if file is in root
  return filePath.substring(0, lastSlash);
};

// Main FileTree component
export default function FileTree({ selectedFilePath, onFileSelect }: FileTreeProps) {
  const [treeData, setTreeData] = useState<FileTreeItem[]>([]);
  const [childrenCache, setChildrenCache] = useState<Record<string, FileTreeItem[]>>({});
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Dialog State
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createItemType, setCreateItemType] = useState<'file' | 'folder' | null>(null);
  const [createItemTargetDir, setCreateItemTargetDir] = useState<string>('');
  const [newItemName, setNewItemName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Delete Dialog State
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<FileTreeItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch initial root tree data
  useEffect(() => {
    async function loadInitialTree() {
      setIsInitialLoading(true);
      setError(null);
      setLoadingFolders(new Set()); // Reset loading folders
      setExpandedFolders(new Set()); // Reset expanded
      setChildrenCache({}); // Reset cache
      try {
        const rootItems = await getFileTree(''); 
        setTreeData(rootItems);
      } catch (err: any) {
        console.error("Failed to load initial file tree:", err);
        setError(err.message || "Could not load initial file tree.");
      } finally {
        setIsInitialLoading(false);
      }
    }
    loadInitialTree();
  }, []); // Run only on initial mount

  // Function to handle folder toggle and fetch children if needed
  const handleFolderToggle = useCallback(async (path: string) => {
    const isCurrentlyExpanded = expandedFolders.has(path);
    const newExpandedFolders = new Set(expandedFolders);

    if (isCurrentlyExpanded) {
      newExpandedFolders.delete(path);
    } else {
      newExpandedFolders.add(path);
      // Fetch children only if not already cached and not currently loading
      if (!childrenCache[path] && !loadingFolders.has(path)) {
        setLoadingFolders((prev) => new Set(prev).add(path));
        try {
          const childrenItems = await getFileTree(path);
          setChildrenCache((prev) => ({ ...prev, [path]: childrenItems }));
        } catch (err: any) {
          console.error(`Failed to load folder content for ${path}:`, err);
          // Optionally set an error state specific to this folder
          // For simplicity now, just log error and remove from expanded if fetch fails
          newExpandedFolders.delete(path); 
        } finally {
          setLoadingFolders((prev) => {
            const next = new Set(prev);
            next.delete(path);
            return next;
          });
        }
      }
    }
    setExpandedFolders(newExpandedFolders);
  }, [expandedFolders, childrenCache, loadingFolders]);

  const handleFileClick = (path: string) => {
    // Use the callback prop
    onFileSelect(path);
  };

  const handleFolderClick = (path: string) => {
    // TODO: Implement folder expansion logic (fetch subtree)
    console.log("Clicked folder (expansion TBD):", path);
  };

  // Function to refresh a specific directory (or root)
  const refreshDirectory = useCallback(async (dirPath: string) => {
    setLoadingFolders((prev) => new Set(prev).add(dirPath)); // Show loading in parent
    try {
      const items = await getFileTree(dirPath);
      if (dirPath === '') {
        setTreeData(items);
      } else {
        setChildrenCache((prev) => ({ ...prev, [dirPath]: items }));
        // Ensure parent folder remains expanded after refresh
        setExpandedFolders((prev) => new Set(prev).add(dirPath)); 
      }
    } catch (err: any) {
      console.error(`Failed to refresh directory ${dirPath}:`, err);
      toast({
        title: "Error",
        description: `Could not refresh directory content: ${err.message}`,
        variant: "destructive",
      });
      // Remove potential failed expansion
      if (dirPath !== '') {
         setExpandedFolders((prev) => {
             const next = new Set(prev);
             next.delete(dirPath);
             return next;
         });
      }
    } finally {
      setLoadingFolders((prev) => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
    }
  }, [toast]);

  // Handlers to open the creation dialog
  const handleRequestCreateFile = () => {
    const targetDir = getParentDirectory(selectedFilePath);
    setCreateItemTargetDir(targetDir);
    setCreateItemType('file');
    setNewItemName('');
    setIsCreating(false);
    setIsCreateDialogOpen(true);
  };

  const handleRequestCreateFolder = () => {
    const targetDir = getParentDirectory(selectedFilePath);
    setCreateItemTargetDir(targetDir);
    setCreateItemType('folder');
    setNewItemName('');
    setIsCreating(false);
    setIsCreateDialogOpen(true);
  };

  // Handler for dialog submission
  const handleCreateItem = async () => {
    if (!newItemName || !createItemType) return;
    setIsCreating(true);
    const trimmedName = newItemName.trim();
    const fullPath = createItemTargetDir ? `${createItemTargetDir}/${trimmedName}` : trimmedName;

    let result: { success: boolean; error?: string };

    try {
      if (createItemType === 'folder') {
        result = await createFolder(fullPath);
      } else {
        // Creating an empty file initially
        result = await createOrUpdateFile(fullPath, '', `Create ${trimmedName}`);
      }

      if (result.success) {
        toast({
          title: "Success",
          description: `${createItemType === 'folder' ? 'Folder' : 'File'} "${trimmedName}" created.`,
        });
        setIsCreateDialogOpen(false);
        // Refresh the parent directory to show the new item
        await refreshDirectory(createItemTargetDir);
      } else {
        throw new Error(result.error || `Failed to create ${createItemType}.`);
      }
    } catch (err: any) {
      console.error(`Failed to create ${createItemType}:`, err);
      toast({
        title: "Error Creating Item",
        description: err.message,
        variant: "destructive",
      });
    } finally {
       setIsCreating(false);
    }
  };

  // Delete handlers
  const handleRequestDelete = (item: FileTreeItem) => {
      // Can only delete files with SHA for now
      if (item.type !== 'file' || !item.sha) return;
      setItemToDelete(item);
      setIsDeleting(false);
      setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
      if (!itemToDelete || !itemToDelete.sha) return;
      setIsDeleting(true);
      
      const itemPath = itemToDelete.path;
      const itemSha = itemToDelete.sha;
      const parentDir = getParentDirectory(itemPath);

      // Flag to track success for finally block
      let deleteSucceeded = false; 

      // --- Optimistic UI Update --- 
      let originalTreeData: FileTreeItem[] | null = null;
      let originalChildrenCache: Record<string, FileTreeItem[]> | null = null;

      if (parentDir === '') {
          originalTreeData = [...treeData]; // Shallow copy
          setTreeData((prev) => prev.filter(i => i.path !== itemPath));
      } else {
          originalChildrenCache = {...childrenCache}; // Shallow copy
          setChildrenCache((prev) => ({
              ...prev,
              [parentDir]: prev[parentDir]?.filter(i => i.path !== itemPath) || []
          }));
      }
      // --- End Optimistic UI --- 

      try {
          const result = await deleteFile(itemPath, itemSha); // Call server action

          if (result.success) {
              toast({
                  title: "Success",
                  description: `File "${itemToDelete.name}" deleted.`,
              });
              deleteSucceeded = true; // Set flag on success
              // Optional: If the deleted file was selected, unselect it
              if (selectedFilePath === itemPath) {
                  onFileSelect(''); // Or null, depending on how NotesPage handles it
              }
          } else {
              throw new Error(result.error || 'Failed to delete file.');
          }
      } catch (err: any) {
          console.error(`Failed to delete file ${itemPath}:`, err);
          toast({
              title: "Error Deleting File",
              description: err.message,
              variant: "destructive",
          });
          // --- Revert Optimistic UI --- 
          if (parentDir === '') {
              if (originalTreeData) setTreeData(originalTreeData);
          } else {
              if (originalChildrenCache) setChildrenCache(originalChildrenCache);
          }
          // --- End Revert --- 
          // deleteSucceeded remains false
      } finally {
          setIsDeleting(false);
          setIsDeleteDialogOpen(false); // Always close the dialog
          if (deleteSucceeded) {
              setItemToDelete(null); // Clear item only on success
          }
          // If keeping item on error, ensure it's cleared eventually or dialog handles it
      }
  };

  return (
    <div className="h-full w-full p-2 border-r bg-muted/40 overflow-y-auto flex flex-col">
      <div className="flex justify-between items-center mb-2 px-2">
        <h2 className="text-lg font-semibold">Explorer</h2>
        <div className="space-x-1">
           <Button variant="ghost" size="icon" onClick={handleRequestCreateFile} title="New File">
              <FilePlus className="h-4 w-4" />
           </Button>
           <Button variant="ghost" size="icon" onClick={handleRequestCreateFolder} title="New Folder">
               <FolderPlus className="h-4 w-4" />
           </Button>
        </div>
      </div>
      
      {/* Tree rendering area (needs flex-grow) */} 
      <div className="flex-grow overflow-y-auto">
          {isInitialLoading && (
            <div className="space-y-2 p-2">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-11/12" />
              <Skeleton className="h-5 w-10/12" />
            </div>
          )}
    
          {error && (
            <p className="text-destructive px-2">Error: {error}</p>
          )}
    
          {!isInitialLoading && !error && treeData.length === 0 && (
             <p className="text-muted-foreground px-2 text-sm">Repository is empty.</p>
          )}
    
          {!isInitialLoading && !error && treeData.length > 0 && (
            <ul className="space-y-1">
              {treeData.map((item) => (
                <RenderTreeItem
                  key={item.path}
                  item={item}
                  level={0} 
                  selectedFilePath={selectedFilePath}
                  expandedFolders={expandedFolders}
                  loadingFolders={loadingFolders}
                  childrenCache={childrenCache}
                  onFolderToggle={handleFolderToggle}
                  onFileClick={handleFileClick}
                  onRequestDelete={handleRequestDelete}
                />
              ))}
            </ul>
          )}
      </div>

      {/* Create Item Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create New {createItemType === 'folder' ? 'Folder' : 'File'}</DialogTitle>
            <DialogDescription>
              Enter the name for the new {createItemType}. It will be created in '{createItemTargetDir || '/'}'.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input 
                id="name" 
                value={newItemName} 
                onChange={(e) => setNewItemName(e.target.value)}
                className="col-span-3" 
                placeholder={createItemType === 'folder' ? 'MyFolder' : 'new-file.md'}
                disabled={isCreating}
              />
            </div>
          </div>
          <DialogFooter>
             <DialogClose asChild>
                <Button type="button" variant="outline" disabled={isCreating}>Cancel</Button>
              </DialogClose>
            <Button type="submit" onClick={handleCreateItem} disabled={isCreating || !newItemName.trim()}>
              {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */} 
      <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the file 
              <span className="font-medium">{itemToDelete?.name}</span> from your repository.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmDelete} 
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
} 

// TODO: Define Recursive Tree Item Component (RenderTreeItem) 