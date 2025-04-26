'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { getFileTree, createFolder, createOrUpdateFile, deleteFile, renameFile } from '@/lib/actions/githubApi';
import type { FileTreeItem } from '@/lib/actions/github/fileTree';
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
import { useDropzone } from 'react-dropzone'
import RenderTreeItem from './RenderTreeItem';
import { useFileTreeDialogs } from '@/hooks/useFileTreeDialogs';
import { useFileTreeData } from '@/hooks/useFileTreeData';
import FileUploadButton from './FileUploadButton';

// Define props interface
interface FileTreeProps {
  selectedFilePath: string | null;
  onFileSelect: (selection: { path: string; isNew?: boolean }) => void;
  onFileDrop: (files: File[], targetFolder: string) => void;
}

// Helper function to get parent directory
const getParentDirectory = (filePath: string | null): string => {
  if (!filePath) return '';
  const lastSlash = filePath.lastIndexOf('/');
  if (lastSlash === -1) return '';
  return filePath.substring(0, lastSlash);
};

// Main FileTree component
export default function FileTree({ selectedFilePath, onFileSelect, onFileDrop }: FileTreeProps) {
  const {
    treeData,
    childrenCache,
    expandedFolders,
    loadingFolders,
    isInitialLoading,
    error,
    handleFolderToggle,
    fetchAndUpdateDirectory,
    setTreeData,
    setChildrenCache
  } = useFileTreeData();

  const fileListRef = useRef<HTMLUListElement>(null);

  const {
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
  } = useFileTreeDialogs({
      selectedFilePath,
      treeData,
      childrenCache,
      onFileSelect,
      onDirectoryUpdateNeeded: fetchAndUpdateDirectory,
      setTreeDataOptimistic: setTreeData,
      setChildrenCacheOptimistic: setChildrenCache,
  });

  const getCurrentTargetDirectory = useCallback(() => {
    // Target root if nothing selected or '.' selected
    if (!selectedFilePath || selectedFilePath === '.') {
      return '';
    }
    // Basic heuristic to check if the selected path looks like a file
    // Add any other relevant extensions for your project here
    const looksLikeFile = /\.(tsx|ts|js|jsx|md|json|html|css|gitignore|env|example|lock|mjs)$/i.test(selectedFilePath);

    if (looksLikeFile) {
      // If it looks like a file, use its parent directory
      return getParentDirectory(selectedFilePath);
    } else {
      // Otherwise, assume it's a directory and upload directly into it
      return selectedFilePath;
    }
  }, [selectedFilePath]);

  const handleFileClick = (selection: { path: string; isNew?: boolean }) => {
    onFileSelect(selection);
  };
 
  const { getRootProps: getRootContainerProps, isDragActive: isRootDragActive } = useDropzone({
    onDrop: (acceptedFiles) => onFileDrop(acceptedFiles, ''),
    noClick: true,
    noKeyboard: true,
  });

  return (
    <div
      {...getRootContainerProps()}
      data-is-root-dropzone="true"
      className="h-full flex flex-col relative outline-none"
    >
      {isRootDragActive && (
        <div className="absolute inset-0 bg-green-100/50 dark:bg-green-900/50 border-2 border-dashed border-green-500 rounded-md z-10 pointer-events-none flex items-center justify-center text-green-700 dark:text-green-300">
            Drop files here to add to root
        </div>
      )}
      <div className="flex-shrink-0 flex justify-between items-center p-2 border-b">
        <h2 className="text-lg font-semibold">Explorer</h2>
        <div className="flex items-center space-x-1">
           <FileUploadButton 
             onFileDrop={onFileDrop} 
             getTargetDirectory={getCurrentTargetDirectory} 
           />
           <Button variant="ghost" size="icon" onClick={handleRequestCreateFile} title="New File">
              <FilePlus className="h-4 w-4" />
           </Button>
           <Button variant="ghost" size="icon" onClick={handleRequestCreateFolder} title="New Folder">
               <FolderPlus className="h-4 w-4" />
           </Button>
        </div>
      </div>
      <div className="flex-grow overflow-auto py-1 pr-1 flex justify-center">
        {isInitialLoading ? (
          <div className="w-full px-2 py-1 space-y-2 mt-1">
            <Skeleton className="h-5 w-11/12" />
            <Skeleton className="h-5 w-10/12" />
            <Skeleton className="h-5 w-9/12 ml-4" />
            <Skeleton className="h-5 w-8/12" />
            <Skeleton className="h-5 w-7/12 ml-4" />
            <Skeleton className="h-5 w-6/12 ml-4" />
            <Skeleton className="h-5 w-10/12" />
          </div>
        ) : treeData.length === 0 ? (
          <p className="text-muted-foreground px-2 text-sm mt-4">Repository is empty.</p>
        ) : (
          <ul ref={fileListRef} className="space-y-1 inline-block w-full">
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
                isOuterDragActive={isRootDragActive}
              />
            ))}
          </ul>
        )}
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
        onClearError={clearDeleteError}
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