'use client';

import { useState, useEffect, useCallback } from 'react';
// Fix import paths
// import { getFileTree, type FileTreeItem } from '@/lib/actions/githubApi';
// import { getFileTree } from '@/lib/actions/githubApi';
import { getFileTree, type FileTreeItem } from '@/lib/actions/github/fileTree'; // Correct path
import { useToast } from "@/hooks/use-toast"; // Toast might be needed for fetch errors here

// Define the static root item
const rootItem: FileTreeItem = {
    name: '.',
    path: '.', // Use '.' for UI selection/key
    type: 'dir',
    sha: '__root__' // Unique identifier
};

// Return type of the hook
export interface UseFileTreeDataReturn {
    treeData: FileTreeItem[];
    childrenCache: Record<string, FileTreeItem[]>;
    expandedFolders: Set<string>;
    loadingFolders: Set<string>;
    isInitialLoading: boolean;
    error: string | null;
    handleFolderToggle: (path: string) => Promise<void>;
    fetchAndUpdateDirectory: (dirPath: string) => Promise<void>; // Expose this for dialog hook
    setTreeData: React.Dispatch<React.SetStateAction<FileTreeItem[]>>; // Needed for optimistic updates
    setChildrenCache: React.Dispatch<React.SetStateAction<Record<string, FileTreeItem[]>>>; // Needed for optimistic updates
}

export function useFileTreeData(/* props: UseFileTreeDataProps = {} */): UseFileTreeDataReturn {
    const [treeData, setTreeData] = useState<FileTreeItem[]>([rootItem]); // Initialize with root item
    const [childrenCache, setChildrenCache] = useState<Record<string, FileTreeItem[]>>({});
    const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
    const [loadingFolders, setLoadingFolders] = useState<Set<string>>(new Set());
    const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const { toast } = useToast();

    // Fetch initial root tree data
    useEffect(() => {
        async function loadInitialTree() {
            console.log("[Hook] Loading initial tree...");
            setIsInitialLoading(true);
            setError(null);
            // Reset other states if needed, keep root item in treeData
            setTreeData([rootItem]);
            setLoadingFolders(new Set());
            setExpandedFolders(new Set());
            setChildrenCache({});
            try {
                const rootApiItems = await getFileTree(''); // Fetch actual root content
                setTreeData([rootItem, ...rootApiItems]); // Prepend root item to fetched data
                console.log("[Hook] Initial tree loaded.");
            } catch (err: unknown) {
                console.error("[Hook] Failed to load initial file tree:", err);
                const message = err instanceof Error ? err.message : "Could not load initial file tree.";
                setError(message);
                toast({ title: "Error Loading Tree", description: message, variant: "destructive" });
            } finally {
                setIsInitialLoading(false);
            }
        }
        loadInitialTree();
    }, [toast]); // Include toast in dependencies

    // Function to handle folder toggle and fetch children if needed
    const handleFolderToggle = useCallback(async (path: string) => {
        if (path === '.') return; // Don't toggle the static root
        console.log(`[Hook] Toggling folder: ${path}`);
        const isCurrentlyExpanded = expandedFolders.has(path);
        const newExpandedFolders = new Set(expandedFolders);

        if (isCurrentlyExpanded) {
            newExpandedFolders.delete(path);
        } else {
            newExpandedFolders.add(path);
            if (!childrenCache[path] && !loadingFolders.has(path)) {
                setLoadingFolders((prev) => new Set(prev).add(path));
                try {
                    console.log(`[Hook] Fetching children for: ${path}`);
                    const childrenItems = await getFileTree(path);
                    setChildrenCache((prev) => ({ ...prev, [path]: childrenItems }));
                     console.log(`[Hook] Children fetched for: ${path}`);
                } catch (err: unknown) {
                    console.error(`[Hook] Failed to load folder content for ${path}:`, err);
                    const message = err instanceof Error ? err.message : 'Please try again.';
                    toast({ title: "Error Loading Folder", description: `Could not load content for "${path}". ${message}`, variant: "destructive" });
                    newExpandedFolders.delete(path); // Remove from expanded if fetch fails
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
    }, [expandedFolders, childrenCache, loadingFolders, toast]); // Keep toast dependency

     // Function to fetch and update a specific directory's content
     const fetchAndUpdateDirectory = useCallback(async (dirPath: string) => {
        console.log(`[Hook] Fetching and updating directory: ${dirPath}`);
        // Use empty string for API call when dirPath is '.' or ''
        const apiPath = (dirPath === '.' || dirPath === '') ? '' : dirPath;
        
        // Decide which loading state to use (folder or initial if root)
        const targetLoadingPath = apiPath === '' ? '__root_loading__' : dirPath; // Use a placeholder for root loading state
        setLoadingFolders((prev) => new Set(prev).add(targetLoadingPath));

         try {
           const childrenItems = await getFileTree(apiPath);
           if (apiPath === '') {
                // If updating root, update treeData directly, keeping root item
                setTreeData([rootItem, ...childrenItems]);
                setChildrenCache({}); // Clear cache as root changed
                setExpandedFolders(new Set()); // Collapse all
            } else {
                // If updating a subdirectory, update the cache
                 setChildrenCache((prev) => ({ ...prev, [dirPath]: childrenItems }));
            }
            console.log(`[Hook] Directory updated: ${dirPath}`);
         } catch (err: unknown) {
             console.error(`[Hook] Failed to fetch and update directory ${dirPath}:`, err);
             const message = err instanceof Error ? err.message : 'Please try again.';
             toast({ title: "Error Updating Directory", description: `Could not refresh "${dirPath}". ${message}`, variant: "destructive" });
         } finally {
           setLoadingFolders((prev) => {
             const next = new Set(prev);
             next.delete(targetLoadingPath);
             return next;
           });
         }
   }, [setTreeData, setChildrenCache, setLoadingFolders, toast]); // Add dependencies

    // Return state and handlers
    return {
        treeData,
        childrenCache,
        expandedFolders,
        loadingFolders,
        isInitialLoading,
        error,
        handleFolderToggle,
        fetchAndUpdateDirectory,
        setTreeData, // Expose setter
        setChildrenCache, // Expose setter
    };
} 