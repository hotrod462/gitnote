'use client'

import React, { useRef } from 'react'; // Add useRef
// import { FileTreeItem } from '@/lib/actions/githubApi';
import type { FileTreeItem } from '@/lib/actions/github/fileTree'; // Import type directly
import { Skeleton } from "@/components/ui/skeleton";
import { File, Folder, FolderOpen, ChevronRight, ChevronDown, Loader2, MoreHorizontal, Trash2, Pencil } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from "@/components/ui/dropdown-menu";
import { useDropzone, DropEvent } from 'react-dropzone';
import { cn } from '@/lib/utils';

// Define props interface (copied from FileTree.tsx)
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
  isOuterDragActive: boolean;
}

// The RenderTreeItem component logic (copied from FileTree.tsx)
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
  onFileDrop,
  isOuterDragActive
}) => {
  if (item.path === '.') {
    return (
      <li key="." className="group relative">
         <div className={`flex items-center justify-between w-full rounded hover:bg-accent pr-1 ${selectedFilePath === '.' ? 'bg-accent font-medium' : ''}`}>
           <button
             onClick={() => onFileClick({ path: '.' })}
             className={`flex flex-grow items-center space-x-1 p-1 text-left text-base`}
           >
             {/* No indent for root */}
             <span className="flex items-center space-x-1 flex-grow min-w-0">
               {/* No chevron for root */}
               <span className="inline-block w-[16px]"></span> 
               <Folder size={16} className="text-sky-600" />
               <span className="truncate flex-shrink min-w-0">{item.name}</span>
             </span>
           </button>
           {/* No dropdown menu for root */}
         </div>
      </li>
    );
  }

  const isExpanded = expandedFolders.has(item.path);
  const isLoading = loadingFolders.has(item.path);
  const children = childrenCache[item.path];
  const indentStyle = { paddingLeft: `${level * 1.25}rem` };

  const isFolder = item.type === 'dir';
  const { getRootProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles, _fileRejections, event: DropEvent) => {
      if (event && typeof (event as React.DragEvent).stopPropagation === 'function') {
        (event as React.DragEvent).stopPropagation();
      }

      if (isFolder) {
        console.log(`[ITEM DROP HANDLER] Fired for: ${item.path}`);
        onFileDrop(acceptedFiles, item.path);
      }
    },
    onDragEnter: (event: React.DragEvent) => { // Keep explicit type
      if (isFolder) {
        event.stopPropagation();
      }
    },
    onDragOver: (event: React.DragEvent) => { // Keep explicit type
      if (isFolder) {
        event.stopPropagation();
        event.preventDefault();
      }
    },
    noClick: true,
    noKeyboard: true,
    disabled: !isFolder,
  });

  const handleItemClick = () => {
    if (item.type === 'dir') {
      onFolderToggle(item.path);
      onFileClick({ path: item.path });
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
          className={`flex flex-grow items-center space-x-1 p-1 text-left text-base ${selectedFilePath === item.path ? 'bg-accent font-medium rounded' : ''}`}
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
        <ul 
          className={cn(
            "ml-6 pl-2 border-l border-gray-200 dark:border-gray-700 space-y-1",
            isOuterDragActive && "pointer-events-none"
          )}
        >
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
              isOuterDragActive={isOuterDragActive}
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

RenderTreeItem.displayName = 'RenderTreeItem';

export default RenderTreeItem;
 