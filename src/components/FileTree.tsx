'use client'

import React, { useState, useEffect, useCallback } from 'react';
import { getFileTree, type FileTreeItem } from '@/lib/actions/githubApi';
import { Skeleton } from "@/components/ui/skeleton";
import { File, Folder, FolderOpen, ChevronRight, ChevronDown, Loader2 } from 'lucide-react'; // Add FolderOpen, ChevronRight, ChevronDown, and Loader2

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
}

const RenderTreeItem: React.FC<RenderTreeItemProps> = React.memo(({
  item,
  level,
  selectedFilePath,
  expandedFolders,
  loadingFolders,
  childrenCache,
  onFolderToggle,
  onFileClick
}) => {
  const isExpanded = expandedFolders.has(item.path);
  const isLoading = loadingFolders.has(item.path);
  const children = childrenCache[item.path];
  const indentStyle = { paddingLeft: `${level * 1.25}rem` }; // Indentation based on level

  const handleClick = () => {
    if (item.type === 'dir') {
      onFolderToggle(item.path);
    } else {
      onFileClick(item.path);
    }
  };

  return (
    <li key={item.path}>
      <button
        onClick={handleClick}
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
        <span>{item.name}</span>
      </button>
      {/* Render children if expanded and available */} 
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
            />
          ))}
        </ul>
      )}
      {/* Render loading skeleton specifically for children if expanded but loading */}
      {isExpanded && isLoading && (
         <div className="space-y-1 pl-4 mt-1" style={{ paddingLeft: `${(level + 1) * 1.25}rem` }}>
           <Skeleton className="h-4 w-10/12" />
           <Skeleton className="h-4 w-8/12" />
         </div>
      )}
    </li>
  );
});

// Main FileTree component
export default function FileTree({ selectedFilePath, onFileSelect }: FileTreeProps) {
  const [treeData, setTreeData] = useState<FileTreeItem[]>([]);
  const [childrenCache, setChildrenCache] = useState<Record<string, FileTreeItem[]>>({});
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="h-full w-full p-2 border-r bg-muted/40 overflow-y-auto">
      <h2 className="text-lg font-semibold mb-2 px-2">Explorer</h2>
      
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
          {/* Use the recursive component to render the root items */} 
          {treeData.map((item) => (
            <RenderTreeItem
              key={item.path}
              item={item}
              level={0} // Start at level 0
              selectedFilePath={selectedFilePath}
              expandedFolders={expandedFolders}
              loadingFolders={loadingFolders}
              childrenCache={childrenCache}
              onFolderToggle={handleFolderToggle}
              onFileClick={handleFileClick}
            />
          ))}
        </ul>
      )}
    </div>
  );
} 

// TODO: Define Recursive Tree Item Component (RenderTreeItem) 