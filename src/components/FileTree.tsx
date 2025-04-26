'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { getFileTree, type FileTreeItem, createFolder, createOrUpdateFile, deleteFile, renameFile } from '@/lib/actions/githubApi';
import { Skeleton } from "@/components/ui/skeleton";
import { File, Folder, FolderOpen, ChevronRight, ChevronDown, Loader2, FilePlus, FolderPlus, MoreHorizontal, Trash2, Pencil } from 'lucide-react';
import { Button } from "@/components/ui/button";
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
import { useDropzone } from 'react-dropzone';

// Define props interface
interface FileTreeProps {
  selectedFilePath: string | null;
  onFileSelect: (selection: { path: string; isNew?: boolean }) => void;
  onFileDrop: (files: File[], targetFolder: string) => void;
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
  onFileDrop: (files: File[], targetFolder: string) => void;
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
  onRequestRename,
  onFileDrop
}) => {
  const isExpanded = expandedFolders.has(item.path);
  const isLoading = loadingFolders.has(item.path);
  const children = childrenCache[item.path];
  const indentStyle = { paddingLeft: `${level * 1.25}rem` };

  const isFolder = item.type === 'dir';
  const { getRootProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (isFolder) {
        onFileDrop(acceptedFiles, item.path);
      }
    },
    noClick: true,
    noKeyboard: true,
    disabled: !isFolder,
  });

  const handleItemClick = () => {
    if (item.type === 'dir') {
      onFolderToggle(item.path);
    } else {
      onFileClick({ path: item.path, isNew: false });
    }
  };

  return (
    <li key={item.path} {...(isFolder ? getRootProps() : {})} className={`group relative ${isFolder ? 'outline-none' : ''}`}>
      {isFolder && isDragActive && (
        <div className="absolute inset-0 bg-blue-100/50 dark:bg-blue-900/50 border-2 border-dashed border-blue-500 rounded-md z-10 pointer-events-none"></div>
      )}
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
                      onFileDrop={onFileDrop}
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

// Add display name
RenderTreeItem.displayName = 'RenderTreeItem';

// Helper function to get parent directory
const getParentDirectory = (filePath: string | null): string => {
  if (!filePath) return ''; // Root if no file selected
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash === -1) return ''; // Root if file is in root
  return filePath.substring(0, lastSlash);
};

// Main FileTree component
export default function FileTree({ selectedFilePath, onFileSelect, onFileDrop }: FileTreeProps) {
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

  const { getRootProps: getRootContainerProps, isDragActive: isRootDragActive } = useDropzone({
      onDrop: (acceptedFiles) => onFileDrop(acceptedFiles, ''),
      noClick: true,
      noKeyboard: true,
  });

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
      } catch (err: unknown) {
        console.error("Failed to load initial file tree:", err);
        setError(err instanceof Error ? err.message : "Could not load initial file tree.");
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
        } catch (err: unknown) {
          console.error(`Failed to load folder content for ${path}:`, err);
          // Optionally set an error state specific to this folder
          // Add a toast notification on error
          toast({ 
              title: "Error Loading Folder",
              description: `Could not load content for "${path}". ${err instanceof Error ? err.message : 'Please try again.'}`, 
              variant: "destructive"
          });
          // Remove from expanded if fetch fails
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
  }, [expandedFolders, childrenCache, loadingFolders, toast]);

  const handleFileClick = (selection: { path: string; isNew?: boolean }) => {
    onFileSelect(selection);
  };

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
    } catch (err: unknown) {
      console.error(`Error creating ${createItemType}:`, err);
      toast({ 
        title: `Error creating ${createItemType}`,
        description: err instanceof Error ? err.message : 'An unexpected error occurred',
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
        } catch (err: unknown) {
          console.error(`Failed to fetch and update directory ${dirPath}:`, err);
          toast({ 
              title: "Error Updating Directory", 
              description: `Could not refresh "${dirPath}". ${err instanceof Error ? err.message : 'Please try again.'}`, 
              variant: "destructive" 
          });
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
      } catch (err: unknown) {
          console.error(`Failed to delete ${itemType} ${itemPath}:`, err);
          const message = err instanceof Error ? err.message : 'An unexpected error occurred';
          setDeleteError(message);
          toast({
              title: `Error Deleting ${itemType === 'dir' ? 'Folder' : 'File'}`,
              description: message,
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
      } catch (err: unknown) {
          console.error(`Failed to rename file ${oldPath} to ${newPath}:`, err);
          const message = err instanceof Error ? err.message : 'An unexpected error occurred';
          toast({
              title: "Error Renaming File",
              description: message,
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
    <div {...getRootContainerProps()} className="h-full flex flex-col relative">
      {isRootDragActive && (
        <div className="absolute inset-0 bg-green-100/50 dark:bg-green-900/50 border-2 border-dashed border-green-500 rounded-md z-10 pointer-events-none flex items-center justify-center text-green-700 dark:text-green-300">
            Drop files here to add to root
        </div>
      )}
      <div className="flex-shrink-0 flex justify-between items-center p-2 border-b">
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
      <div className="flex-grow overflow-auto py-1 pr-1">
        {treeData.length === 0 && !isInitialLoading && (
         <p className="text-muted-foreground px-2 text-sm">Repository is empty.</p>
        )}
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
              onFileDrop={onFileDrop}
            />
          ))}
        </ul>
      </div>
      <CreateItemDialog 
        open={isCreateDialogOpen}
        onOpenChange={setIsCreateDialogOpen}
        itemType={createItemType}
        targetDirectory={createItemTargetDir}
        onCreateConfirm={handleConfirmCreate}
      />
      <DeleteConfirmationDialog 
        open={isDeleteDialogOpen}
        onOpenChange={setIsDeleteDialogOpen}
        itemToDelete={itemToDelete}
        deleteError={deleteError}
        onConfirmDelete={handleConfirmDelete}
        onClearError={() => setDeleteError(null)}
      />
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