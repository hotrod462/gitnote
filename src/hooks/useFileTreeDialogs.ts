'use client';

import { useState, useCallback } from 'react';
import { useToast } from "@/hooks/use-toast";
import { FileTreeItem, createFolder, createOrUpdateFile, deleteFile, renameFile, getFileTree } from '@/lib/actions/githubApi';
import posthog from 'posthog-js';

// Helper function (copied from FileTree.tsx for now, might centralize later)
const getParentDirectory = (filePath: string | null): string => {
    if (!filePath) return '';
    const lastSlash = filePath.lastIndexOf('/');
    if (lastSlash === -1) return '';
    return filePath.substring(0, lastSlash);
};

// Props for the hook - includes callbacks for external actions
interface UseFileTreeDialogsProps {
    selectedFilePath: string | null;
    treeData: FileTreeItem[]; // Needed for optimistic delete revert
    childrenCache: Record<string, FileTreeItem[]>; // Needed for optimistic delete/rename revert
    onFileSelect: (selection: { path: string; isNew?: boolean }) => void;
    // Callback to refresh a directory's content in the parent component's state
    onDirectoryUpdateNeeded: (dirPath: string) => Promise<void>; 
     // Callback to update parent state after optimistic UI changes
    setTreeDataOptimistic: (updater: (prev: FileTreeItem[]) => FileTreeItem[]) => void;
    setChildrenCacheOptimistic: (updater: (prev: Record<string, FileTreeItem[]>) => Record<string, FileTreeItem[]>) => void;
}

// Return type of the hook
export interface UseFileTreeDialogsReturn {
    // Dialog open states
    isCreateDialogOpen: boolean;
    isDeleteDialogOpen: boolean;
    isRenameDialogOpen: boolean;

    // Data for dialogs
    createItemType: 'file' | 'folder' | null;
    createItemTargetDir: string;
    itemToDelete: FileTreeItem | null;
    itemToRename: FileTreeItem | null;
    deleteError: string | null;

    // Dialog open handlers
    handleRequestCreateFile: () => void;
    handleRequestCreateFolder: () => void;
    handleRequestDelete: (item: FileTreeItem) => void;
    handleRequestRename: (item: FileTreeItem) => void;

    // Dialog confirmation handlers
    handleConfirmCreate: (itemName: string) => Promise<void>;
    handleConfirmDelete: () => Promise<void>;
    handleConfirmRename: (newName: string) => Promise<void>;

    // Dialog close/cancel handlers
    setIsCreateDialogOpen: (open: boolean) => void;
    setIsDeleteDialogOpen: (open: boolean) => void;
    setIsRenameDialogOpen: (open: boolean) => void;
    clearDeleteError: () => void;
}

export function useFileTreeDialogs({
    selectedFilePath,
    treeData,
    childrenCache,
    onFileSelect,
    onDirectoryUpdateNeeded,
    setTreeDataOptimistic,
    setChildrenCacheOptimistic
}: UseFileTreeDialogsProps): UseFileTreeDialogsReturn {
    const { toast } = useToast();

    // Create Dialog State
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

    // --- Handlers to open dialogs --- 
    const handleRequestCreateFile = useCallback(() => {
        const targetDir = getParentDirectory(selectedFilePath);
        setCreateItemTargetDir(targetDir);
        setCreateItemType('file');
        setIsCreateDialogOpen(true);
    }, [selectedFilePath]);

    const handleRequestCreateFolder = useCallback(() => {
        const targetDir = getParentDirectory(selectedFilePath);
        setCreateItemTargetDir(targetDir);
        setCreateItemType('folder');
        setIsCreateDialogOpen(true);
    }, [selectedFilePath]);

    const handleRequestDelete = useCallback((item: FileTreeItem) => {
        setItemToDelete(item);
        setDeleteError(null);
        setIsDeleteDialogOpen(true);
    }, []);

    const handleRequestRename = useCallback((item: FileTreeItem) => {
        if (item.type !== 'file' || !item.sha) return;
        setItemToRename(item);
        setIsRenameDialogOpen(true);
    }, []);

    const clearDeleteError = useCallback(() => setDeleteError(null), []);

    // --- Handlers for dialog confirmations --- 

    const handleConfirmCreate = useCallback(async (itemName: string) => {
        if (!createItemType || !itemName) return;

        const targetDir = createItemTargetDir;
        const prefix = targetDir ? (targetDir.endsWith('/') ? targetDir : targetDir + '/') : '';
        const fullPath = `${prefix}${itemName}${createItemType === 'file' ? '.md' : ''}`;

        console.log(`[Hook] Attempting to create ${createItemType}: ${fullPath}`);
        setIsCreateDialogOpen(false); // Close dialog optimistically

        try {
            let result;
            if (createItemType === 'folder') {
                result = await createFolder(fullPath);
                if (result.success) posthog.capture('folder_created', { folder_path: fullPath });
                else posthog.capture('folder_create_failed', { folder_path: fullPath, error: result.error });
            } else {
                result = await createOrUpdateFile(fullPath, '', `Create ${itemName}.md`);
                if (result.success) posthog.capture('note_created', { file_path: fullPath });
                else posthog.capture('note_create_failed', { file_path: fullPath, error: result.error });
            }

            if (result.success) {
                toast({ title: `${createItemType === 'folder' ? 'Folder' : 'Note'} created successfully: ${itemName}` });
                await onDirectoryUpdateNeeded(targetDir); // Request parent to refresh directory
                if (createItemType === 'file') {
                    onFileSelect({ path: fullPath, isNew: true });
                }
            } else {
                throw new Error(result.error || `Failed to create ${createItemType}`);
            }
        } catch (err: unknown) {
            console.error(`[Hook] Error creating ${createItemType}:`, err);
            toast({ 
                title: `Error creating ${createItemType}`,
                description: err instanceof Error ? err.message : 'An unexpected error occurred',
                variant: 'destructive' 
            });
             // If creation failed, dialog remains closed, maybe re-open or just show toast?
        }
        // Reset state regardless of success/failure for next use
        setCreateItemTargetDir('');
        setCreateItemType(null);
    }, [createItemType, createItemTargetDir, onDirectoryUpdateNeeded, onFileSelect, toast]);

    const handleConfirmDelete = useCallback(async () => {
        if (!itemToDelete) return Promise.reject("No item selected for deletion");
        
        setDeleteError(null);
        const itemPath = itemToDelete.path;
        const itemType = itemToDelete.type;
        const itemName = itemToDelete.name;
        const itemSha = itemToDelete.sha;
        const parentDir = getParentDirectory(itemPath);

        // --- Optimistic UI (using callbacks to update parent state) --- 
        let originalTreeDataSnapshot: FileTreeItem[] | null = null;
        let originalChildrenCacheSnapshot: Record<string, FileTreeItem[]> | null = null;

        if (parentDir === '') {
            originalTreeDataSnapshot = [...treeData]; // Snapshot before optimistic update
            setTreeDataOptimistic(prev => prev.filter(i => i.path !== itemPath));
        } else {
            originalChildrenCacheSnapshot = {...childrenCache}; // Snapshot before optimistic update
            setChildrenCacheOptimistic(prev => ({
                ...prev,
                [parentDir]: prev[parentDir]?.filter(i => i.path !== itemPath) || []
            }));
        }
        // --- End Optimistic UI --- 

        try {
            let result: { success: boolean; error?: string };
            if (itemType === 'file') {
                if (!itemSha) { throw new Error('File SHA is missing...'); }
                result = await deleteFile(itemPath, itemSha);
            } else { // Folder
                // Need to fetch children to check if empty (could be cached already)
                let children = childrenCache[itemPath];
                if (children === undefined) {
                    children = await getFileTree(itemPath);
                    // No need to update parent state cache here, just needed for check
                }
                const gitkeepItem = children?.find(c => c.name === '.gitkeep');
                const isEmpty = children?.length === 0 || (children?.length === 1 && gitkeepItem);
                if (!isEmpty) { throw new Error('Cannot delete non-empty folder.'); }
                // If empty or only contains .gitkeep, delete .gitkeep if it exists
                if (gitkeepItem && gitkeepItem.sha) {
                    result = await deleteFile(gitkeepItem.path, gitkeepItem.sha, `Delete folder ${itemName}`);
                } else { // Folder is truly empty or API call failed to get children but we assume empty
                    result = { success: true }; // Assume success if no .gitkeep to delete
                }
            }

            if (result.success) {
                toast({ title: "Success", description: `${itemType === 'dir' ? 'Folder' : 'File'} "${itemName}" deleted.` });
                if (selectedFilePath === itemPath) { onFileSelect({ path: '' }); }
                setIsDeleteDialogOpen(false); // Close dialog on success
                setItemToDelete(null);
                // Optimistic UI already applied, no need to call onDirectoryUpdateNeeded unless forced refresh desired
            } else {
                throw new Error(result.error || `Failed to delete ${itemType}.`);
            }
        } catch (err: unknown) {
            console.error(`[Hook] Failed to delete ${itemType} ${itemPath}:`, err);
            const message = err instanceof Error ? err.message : 'An unexpected error occurred';
            setDeleteError(message);
            toast({ title: `Error Deleting ${itemType === 'dir' ? 'Folder' : 'File'}`, description: message, variant: "destructive" });
            
            // --- Revert Optimistic UI --- 
            if (parentDir === '') {
                if (originalTreeDataSnapshot) setTreeDataOptimistic(() => originalTreeDataSnapshot);
            } else {
                if (originalChildrenCacheSnapshot) setChildrenCacheOptimistic(() => originalChildrenCacheSnapshot);
            }
            // --- End Revert --- 
            throw err; // Re-throw to keep dialog open with error
        }
    }, [itemToDelete, childrenCache, treeData, toast, selectedFilePath, onFileSelect, setTreeDataOptimistic, setChildrenCacheOptimistic]);

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
        let originalTreeDataSnapshot: FileTreeItem[] | null = null;
        let originalChildrenCacheSnapshot: Record<string, FileTreeItem[]> | null = null;

        const updateState = (items: FileTreeItem[]): FileTreeItem[] => {
            return items.map(i => i.path === oldPath ? { ...i, name: newNameFromDialog, path: newPath } : i)
                        .sort((a, b) => {
                            if (a.type === 'dir' && b.type !== 'dir') return -1;
                            if (a.type !== 'dir' && b.type === 'dir') return 1;
                            return a.name.localeCompare(b.name);
                        });
        };

        if (parentDir === '') {
            originalTreeDataSnapshot = [...treeData];
            setTreeDataOptimistic(prev => updateState(prev));
        } else {
            originalChildrenCacheSnapshot = {...childrenCache};
            setChildrenCacheOptimistic(prev => ({
                ...prev,
                [parentDir]: updateState(prev[parentDir] || [])
            }));
        }
        // If the renamed item was selected, update the selection optimistically
        if (selectedFilePath === oldPath) {
            onFileSelect({ path: newPath, isNew: false });
        }
        // --- End Optimistic UI --- 

        try {
            const result = await renameFile(oldPath, newPath, oldSha);

            if (result.success) {
                toast({ title: "Success", description: `File renamed to "${newNameFromDialog}".` });
                // Update item with new SHA in parent state
                if (result.newSha) {
                    const finalSha = result.newSha;
                    if (parentDir === '') {
                        setTreeDataOptimistic(prev => prev.map(i => i.path === newPath ? { ...i, sha: finalSha } : i));
                    } else {
                        setChildrenCacheOptimistic(prev => ({
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
            console.error(`[Hook] Failed to rename file ${oldPath} to ${newPath}:`, err);
            const message = err instanceof Error ? err.message : 'An unexpected error occurred';
            toast({ title: "Error Renaming File", description: message, variant: "destructive" });

            // --- Revert Optimistic UI --- 
            if (parentDir === '') {
                if (originalTreeDataSnapshot) setTreeDataOptimistic(() => originalTreeDataSnapshot);
            } else {
                if (originalChildrenCacheSnapshot) setChildrenCacheOptimistic(() => originalChildrenCacheSnapshot);
            }
            // Revert selection if it was changed optimistically
            if (selectedFilePath === newPath) { onFileSelect({ path: oldPath, isNew: false }); }
            // --- End Revert --- 
            throw err; // Re-throw so dialog knows it failed
        }
    }, [itemToRename, treeData, childrenCache, toast, selectedFilePath, onFileSelect, setTreeDataOptimistic, setChildrenCacheOptimistic]);

    // Return state and handlers
    return {
        isCreateDialogOpen,
        isDeleteDialogOpen,
        isRenameDialogOpen,
        createItemType,
        createItemTargetDir,
        itemToDelete,
        itemToRename,
        deleteError,
        handleRequestCreateFile,
        handleRequestCreateFolder,
        handleRequestDelete,
        handleRequestRename,
        handleConfirmCreate,
        handleConfirmDelete,
        handleConfirmRename,
        setIsCreateDialogOpen,
        setIsDeleteDialogOpen,
        setIsRenameDialogOpen,
        clearDeleteError,
    };
} 