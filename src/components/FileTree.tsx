'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { getFileTree, type FileTreeItem, createFolder, createOrUpdateFile, deleteFile, renameFile } from '@/lib/actions/githubApi';
import { Skeleton } from "@/components/ui/skeleton";
import { File, Folder, FolderOpen, ChevronRight, ChevronDown, Loader2, FilePlus, FolderPlus, MoreHorizontal, Trash2, Pencil } from 'lucide-react';
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
import CreateItemDialog from './CreateItemDialog';
import DeleteConfirmationDialog from './DeleteConfirmationDialog';
import RenameDialog from './RenameDialog';
import posthog from 'posthog-js';

// Define props interface
interface FileTreeProps {
  selectedFilePath: string | null;
  onFileSelect: (selection: { path: string; isNew?: boolean }) => void;
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
  onFileClick: (selection: { path: string; isNew?: boolean }) => void;
  onRequestDelete: (item: FileTreeItem) => void;
  onRequestRename: (item: FileTreeItem) => void;
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
  onRequestDelete,
  onRequestRename
}) => {
  const isExpanded = expandedFolders.has(item.path);
  const isLoading = loadingFolders.has(item.path);
  const children = childrenCache[item.path];
  const indentStyle = { paddingLeft: `${level * 1.25}rem` };

  const handleItemClick = () => {
    if (item.type === 'dir') {
      onFolderToggle(item.path);
    } else {
      onFileClick({ path: item.path, isNew: false });
    }
  };

  return (
    <li key={item.path} className="group relative">
      <div className="flex items-center justify-between w-full rounded hover:bg-accent pr-1">
        <button
          onClick={handleItemClick}
          className={`flex flex-grow items-center space-x-1 p-1 text-left text-sm ${selectedFilePath === item.path ? 'bg-accent font-medium rounded' : ''}`}
        >
          <span style={indentStyle} className="flex items-center space-x-1 flex-grow min-w-0">
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
              <>
                <span className="inline-block w-[16px]"></span>
                <File size={16} className="text-muted-foreground" />
              </>
            )}
            <span className="truncate flex-shrink min-w-0">{item.name}</span>
          </span>
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 flex-shrink-0">
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <MoreHorizontal className="h-4 w-4" />
              <span className="sr-only">Item options</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {item.type === 'file' && item.sha && (
              <DropdownMenuItem onClick={() => onRequestRename(item)}>
                <Pencil className="mr-2 h-4 w-4" />
                Rename File
              </DropdownMenuItem>
            )}
            {item.type === 'file' && item.sha && (
              <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => onRequestDelete(item)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete File
              </DropdownMenuItem>
            )}
            {item.type === 'dir' && (
              <DropdownMenuItem className="text-destructive focus:text-destructive focus:bg-destructive/10" onClick={() => onRequestDelete(item)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete Folder
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* --- RESTORE children/loading rendering --- */}
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
                      onRequestRename={onRequestRename}
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

  // Delete Dialog State
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<FileTreeItem | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Rename Dialog State
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [itemToRename, setItemToRename] = useState<FileTreeItem | null>(null);

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

  const handleFileClick = (selection: { path: string; isNew?: boolean }) => {
    onFileSelect(selection);
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
    setIsCreateDialogOpen(true);
  };

  const handleRequestCreateFolder = () => {
    const targetDir = getParentDirectory(selectedFilePath);
    setCreateItemTargetDir(targetDir);
    setCreateItemType('folder');
    setIsCreateDialogOpen(true);
  };

  // Function to handle confirming the creation dialog
  const handleConfirmCreate = async (itemName: string) => {
    if (!createItemType || !itemName) return; 

    const targetDir = createItemTargetDir;
    // Ensure trailing slash for directory path construction
    const prefix = targetDir ? (targetDir.endsWith('/') ? targetDir : targetDir + '/') : '';
    const fullPath = `${prefix}${itemName}${createItemType === 'file' ? '.md' : ''}`;

    console.log(`Attempting to create ${createItemType}: ${fullPath}`);
    setIsCreateDialogOpen(false); // Close dialog optimistically or after attempt?

    try {
      let result;
      if (createItemType === 'folder') {
        result = await createFolder(fullPath);
        if (result.success) {
           posthog.capture('folder_created', { folder_path: fullPath }); // Track folder creation
        } else {
           // Add error property for tracking?
           posthog.capture('folder_create_failed', { folder_path: fullPath, error: result.error });
        }
      } else { // 'file'
        result = await createOrUpdateFile(fullPath, '', `Create ${itemName}.md`);
        if (result.success) {
           posthog.capture('note_created', { file_path: fullPath }); // Track note creation
        } else {
           posthog.capture('note_create_failed', { file_path: fullPath, error: result.error });
        }
      }

      if (result.success) {
        toast({ title: `${createItemType === 'folder' ? 'Folder' : 'Note'} created successfully: ${itemName}` });
        // Add the new item to the tree optimistically or re-fetch?
        // Re-fetching the parent directory might be simplest
        await fetchAndUpdateDirectory(targetDir);
        // If it was a file, select it
        if (createItemType === 'file') {
          onFileSelect({ path: fullPath, isNew: true });
        }
      } else {
        throw new Error(result.error || `Failed to create ${createItemType}`);
      }
    } catch (err: any) {
      console.error(`Error creating ${createItemType}:`, err);
      toast({ 
        title: `Error creating ${createItemType}`, 
        description: err.message,
        variant: 'destructive' 
      });
    }
    // Reset state
    setCreateItemTargetDir('');
    setCreateItemType(null);
  };
  
  // Function to fetch and update a directory's content in the cache
  const fetchAndUpdateDirectory = async (dirPath: string) => {
       setLoadingFolders((prev) => new Set(prev).add(dirPath));
        try {
          const childrenItems = await getFileTree(dirPath);
          setChildrenCache((prev) => ({ ...prev, [dirPath]: childrenItems }));
           // If updating root, update treeData directly
           if (dirPath === '') {
               setTreeData(childrenItems);
           }
        } catch (err: any) {
          console.error(`Failed to refresh folder content for ${dirPath}:`, err);
          toast({ title: `Error refreshing folder ${dirPath}`, description: err.message, variant: 'destructive' });
        } finally {
          setLoadingFolders((prev) => {
            const next = new Set(prev);
            next.delete(dirPath);
            return next;
          });
        }
  };

  // Delete handlers
  const handleRequestDelete = (item: FileTreeItem) => {
      setItemToDelete(item);
      setDeleteError(null);
      setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = useCallback(async () => {
      if (!itemToDelete) return Promise.reject("No item selected for deletion");
      
      setDeleteError(null);
      const itemPath = itemToDelete.path;
      const itemType = itemToDelete.type;
      const itemName = itemToDelete.name;
      const itemSha = itemToDelete.sha;
      const parentDir = getParentDirectory(itemPath);

      let originalTreeData: FileTreeItem[] | null = null;
      let originalChildrenCache: Record<string, FileTreeItem[]> | null = null;

      if (parentDir === '') {
          originalTreeData = [...treeData];
          setTreeData((prev) => prev.filter(i => i.path !== itemPath));
      } else {
          originalChildrenCache = {...childrenCache};
          setChildrenCache((prev) => ({
              ...prev,
              [parentDir]: prev[parentDir]?.filter(i => i.path !== itemPath) || []
          }));
      }

      try {
          let result: { success: boolean; error?: string };
          if (itemType === 'file') {
              if (!itemSha) { throw new Error('File SHA is missing...'); }
              result = await deleteFile(itemPath, itemSha);
          } else {
              let children = childrenCache[itemPath];
              if (children === undefined) {
                  children = await getFileTree(itemPath);
                  setChildrenCache((prev) => ({ ...prev, [itemPath]: children || [] }));
              }
              const gitkeepItem = children?.find(c => c.name === '.gitkeep');
              const isEmpty = children?.length === 0 || (children?.length === 1 && gitkeepItem);
              if (!isEmpty) { throw new Error('Cannot delete non-empty folder.'); }
              if (gitkeepItem && gitkeepItem.sha) {
                   result = await deleteFile(gitkeepItem.path, gitkeepItem.sha, `Delete folder ${itemName}`);
              } else { result = { success: true }; }
          }

          if (result.success) {
              toast({
                  title: "Success",
                  description: `${itemType === 'dir' ? 'Folder' : 'File'} "${itemName}" deleted.`,
              });
              if (selectedFilePath === itemPath) { onFileSelect({ path: '' }); }
              setIsDeleteDialogOpen(false);
              setItemToDelete(null);
          } else {
              throw new Error(result.error || `Failed to delete ${itemType}.`);
          }
      } catch (err: any) {
          console.error(`Failed to delete ${itemType} ${itemPath}:`, err);
          setDeleteError(err.message);
          toast({
              title: `Error Deleting ${itemType === 'dir' ? 'Folder' : 'File'}`,
              description: err.message,
              variant: "destructive",
          });
          if (parentDir === '') {
              if (originalTreeData) setTreeData(originalTreeData);
          } else {
              if (originalChildrenCache) setChildrenCache(originalChildrenCache);
          }
          throw err;
      }
  }, [itemToDelete, childrenCache, treeData, toast, selectedFilePath, onFileSelect]);

  // Rename Handlers
  const handleRequestRename = (item: FileTreeItem) => {
      if (item.type !== 'file' || !item.sha) return;
      setItemToRename(item);
      setIsRenameDialogOpen(true);
  };

  const handleConfirmRename = useCallback(async (newNameFromDialog: string) => {
      if (!itemToRename || !itemToRename.sha || !newNameFromDialog || itemToRename.name === newNameFromDialog) {
          setIsRenameDialogOpen(false); 
          return Promise.reject("Invalid rename parameters");
      }
      const oldPath = itemToRename.path;
      const oldSha = itemToRename.sha;
      const parentDir = getParentDirectory(oldPath);
      const newPath = parentDir ? `${parentDir}/${newNameFromDialog}` : newNameFromDialog;

      // --- Optimistic UI --- 
      let originalTreeData: FileTreeItem[] | null = null;
      let originalChildrenCache: Record<string, FileTreeItem[]> | null = null;
      const updateState = (items: FileTreeItem[]): FileTreeItem[] => {
          return items.map(i => i.path === oldPath ? { ...i, name: newNameFromDialog, path: newPath } : i)
                      .sort((a, b) => {
                          if (a.type === 'dir' && b.type !== 'dir') return -1;
                          if (a.type !== 'dir' && b.type === 'dir') return 1;
                          return a.name.localeCompare(b.name);
                      });
      };

      if (parentDir === '') {
          originalTreeData = [...treeData];
          setTreeData(prev => updateState(prev));
      } else {
          originalChildrenCache = {...childrenCache};
          setChildrenCache(prev => ({
              ...prev,
              [parentDir]: updateState(prev[parentDir] || [])
          }));
      }
      // Close dialog optimistically? No, let parent handle it on success.
      // If the renamed item was selected, update the selection
      if (selectedFilePath === oldPath) {
          onFileSelect({ path: newPath, isNew: false });
      }
      // --- End Optimistic UI --- 

      try {
          const result = await renameFile(oldPath, newPath, oldSha);

          if (result.success) {
              toast({
                  title: "Success",
                  description: `File renamed to "${newNameFromDialog}".`,
              });
              // Update item with new SHA
              if (result.newSha) {
                  const finalSha = result.newSha;
                   if (parentDir === '') {
                      setTreeData(prev => prev.map(i => i.path === newPath ? { ...i, sha: finalSha } : i));
                  } else {
                      setChildrenCache(prev => ({
                          ...prev,
                          [parentDir]: prev[parentDir]?.map(i => i.path === newPath ? { ...i, sha: finalSha } : i) || []
                      }));
                  }
              }
              setIsRenameDialogOpen(false); // Close dialog on success
              setItemToRename(null); // Clear item
          } else {
              throw new Error(result.error || 'Failed to rename file.');
          }
      } catch (err: any) {
          console.error(`Failed to rename file ${oldPath} to ${newPath}:`, err);
          toast({
              title: "Error Renaming File",
              description: err.message,
              variant: "destructive",
          });
           // --- Revert Optimistic UI --- 
           if (parentDir === '') {
              if (originalTreeData) setTreeData(originalTreeData);
          } else {
              if (originalChildrenCache) setChildrenCache(originalChildrenCache);
          }
          // Revert selection
          if (selectedFilePath === newPath) { onFileSelect({ path: oldPath, isNew: false }); }
          // --- End Revert --- 
          throw err; // Re-throw so dialog knows it failed
      }
  }, [itemToRename, treeData, childrenCache, toast, selectedFilePath, onFileSelect]);

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
                  onRequestRename={handleRequestRename}
                />
              ))}
            </ul>
          )}
      </div>

      {/* Render the extracted Create Dialog */} 
      <CreateItemDialog 
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        itemType={createItemType}
        targetDirectory={createItemTargetDir}
        onCreateConfirm={handleConfirmCreate}
      />

      {/* Render extracted Delete Dialog */} 
      <DeleteConfirmationDialog 
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        itemToDelete={itemToDelete}
        deleteError={deleteError}
        onConfirmDelete={handleConfirmDelete}
        onClearError={() => setDeleteError(null)}
      />

      {/* Render extracted Rename Dialog */} 
      <RenameDialog 
        open={isRenameDialogOpen}
        onOpenChange={setIsRenameDialogOpen}
        itemToRename={itemToRename}
        onRenameConfirm={handleConfirmRename}
      />
    </div>
  );
} 

// TODO: Define Recursive Tree Item Component (RenderTreeItem) 