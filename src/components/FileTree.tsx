'use client'

import React, { useState, useEffect } from 'react';
import { getFileTree, type FileTreeItem } from '@/lib/actions/githubApi';
import { Skeleton } from "@/components/ui/skeleton";
import { File, Folder } from 'lucide-react'; // Import icons

// Define props interface
interface FileTreeProps {
  selectedFilePath: string | null;
  onFileSelect: (filePath: string) => void;
}

// Accept props
export default function FileTree({ selectedFilePath, onFileSelect }: FileTreeProps) {
  const [treeData, setTreeData] = useState<FileTreeItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadInitialTree() {
      setIsLoading(true);
      setError(null);
      try {
        // Fetch root directory content
        const rootItems = await getFileTree(''); 
        setTreeData(rootItems);
      } catch (err: any) {
        console.error("Failed to load file tree:", err);
        setError(err.message || "Could not load file tree.");
      } finally {
        setIsLoading(false);
      }
    }
    loadInitialTree();
  }, []); // Run only on initial mount

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
      
      {isLoading && (
        <div className="space-y-2 p-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-11/12" />
          <Skeleton className="h-5 w-10/12" />
        </div>
      )}

      {error && (
        <p className="text-destructive px-2">Error: {error}</p>
      )}

      {!isLoading && !error && treeData.length === 0 && (
         <p className="text-muted-foreground px-2 text-sm">Repository is empty.</p>
      )}

      {!isLoading && !error && treeData.length > 0 && (
        <ul className="space-y-1">
          {treeData.map((item) => (
            <li key={item.path}>
              <button
                onClick={() => item.type === 'dir' ? handleFolderClick(item.path) : handleFileClick(item.path)}
                className={`flex items-center space-x-2 p-1 rounded w-full text-left text-sm hover:bg-accent ${selectedFilePath === item.path ? 'bg-accent font-medium' : ''}`}
              >
                {item.type === 'dir' ? (
                  <Folder size={16} className="text-sky-600" /> 
                ) : (
                  <File size={16} className="text-muted-foreground" />
                )}
                <span>{item.name}</span>
              </button>
              {/* TODO: Add recursive rendering for expanded folders */}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
} 