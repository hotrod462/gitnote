'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { checkUserConnectionStatus, ConnectionStatus } from '@/lib/actions/githubConnections';
import ConnectRepoPrompt from '@/components/ConnectRepoPrompt';
import SelectRepoPrompt from '@/components/SelectRepoPrompt';
import { ThemeToggleButton } from '@/components/theme-toggle-button';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import FileTree from '@/components/FileTree';
import Editor, { EditorRef } from '@/components/Editor';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { useDropzone } from 'react-dropzone';
import * as Diff from 'diff';
import { getFileContent, commitMultipleFiles, StagedFileCommitDetails } from '@/lib/actions/githubApi';
import CommitMessageModal from '@/components/CommitMessageModal';

// Simplify view modes
type ViewMode = 'edit' | 'history_view';

interface SelectedFileState {
  path: string | null;
  isNew: boolean;
}

export default function NotesPage() {
  const [connection, setConnection] = useState<ConnectionStatus | null>(null);
  const [isLoadingConnection, setIsLoadingConnection] = useState(true);
  const [selectedFile, setSelectedFile] = useState<SelectedFileState>({ path: null, isNew: false });
  const [currentFileSha, setCurrentFileSha] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('edit');
  const [historicalCommitSha, setHistoricalCommitSha] = useState<string | null>(null);
  const router = useRouter();
  const editorRef = useRef<EditorRef>(null);
  const [stagedFiles, setStagedFiles] = useState<Map<string, { content: ArrayBuffer | string }>>(new Map());
  const [isDragging, setIsDragging] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [commitModalOpen, setCommitModalOpen] = useState(false);
  const [generatedCommitMsg, setGeneratedCommitMsg] = useState('');
  const [stagedPathsForModal, setStagedPathsForModal] = useState<string[]>([]);

  // Wrap the fetching logic in a useCallback for reuse
  const fetchConnectionStatus = useCallback(async () => {
    console.log('Fetching connection status...');
    setIsLoadingConnection(true);
    try {
      const status = await checkUserConnectionStatus();
      console.log('Connection status fetched:', status);
      setConnection(status);
    } catch (error) {
      console.error("Failed to fetch connection status:", error);
      toast.error("Could not check repository connection status. Please try again later.");
      setConnection({ status: 'NO_CONNECTION' }); // Set to a default error state
    } finally {
      setIsLoadingConnection(false);
    }
  }, []);

  // Initial fetch on mount
  useEffect(() => {
    fetchConnectionStatus();
  }, [fetchConnectionStatus]); // Dependency: the fetch function itself

  // Handler for successful repository selection
  const handleRepoSelected = useCallback(() => {
    console.log('Repository selected, refreshing connection status...');
    // Re-fetch the connection status after selection
    fetchConnectionStatus(); 
  }, [fetchConnectionStatus]);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login'); // Consider using '/' if that's the main login/landing page
  };

  const handleFileSelect = useCallback((selection: { path: string; isNew?: boolean }) => {
    const newPath = selection.path || null;
    const isNew = selection.isNew || false;
    console.log('File selected:', { newPath, isNew });
    
    setViewMode('edit');
    setHistoricalCommitSha(null);
    setSelectedFile({ path: newPath, isNew });
    setCurrentFileSha(null); 

    if (newPath) {
        if (isNew) {
            editorRef.current?.handleNewFile(newPath);
        } else {
            editorRef.current?.loadContent(newPath);
        }
    }
  }, [editorRef]);

  const handleContentLoaded = useCallback((sha: string) => {
    setCurrentFileSha(sha);
    setSelectedFile(prev => ({ ...prev, isNew: false }));
  }, [setCurrentFileSha, setSelectedFile]);

  const handleEnterHistoryView = useCallback((commitSha: string) => {
      const filePath = selectedFile.path;
      if (!filePath) return;
      console.log(`Entering history view for file ${filePath}, commit ${commitSha}`);
      setViewMode('history_view');
      setHistoricalCommitSha(commitSha);
      queueMicrotask(() => { 
         editorRef.current?.loadHistoricalContent(filePath, commitSha);
      });
  }, [selectedFile.path, editorRef]);

  const handleExitHistoryView = useCallback(() => {
      const filePath = selectedFile.path;
      console.log('Exiting history view');
      setViewMode('edit');
      setHistoricalCommitSha(null);
      if (filePath) {
          queueMicrotask(() => {
             editorRef.current?.loadContent(filePath);
          });
      }
  }, [selectedFile.path, editorRef]);

  const handleFileDrop = useCallback((acceptedFiles: File[], targetFolder: string = '') => {
    console.log(`Files dropped into folder: '${targetFolder}'`, acceptedFiles);
    acceptedFiles.forEach((file) => {
      const reader = new FileReader();

      reader.onabort = () => console.log('file reading was aborted');
      reader.onerror = () => console.error('file reading has failed');
      reader.onload = () => {
        const binaryStr = reader.result;
        if (binaryStr) {
            setStagedFiles(prev => {
                const newMap = new Map(prev);
                const relPath = targetFolder ? `${targetFolder}/${file.name}` : file.name;
                const cleanPath = relPath.replace(/\\/g, '/').replace(/^\/+/,'');
                console.log(`Staging file: ${cleanPath}`);
                newMap.set(cleanPath, { content: binaryStr });
                return newMap;
            });
        } else {
            console.error("FileReader result was null or undefined for file:", file.name);
            toast.error("Could not read the content of " + file.name + ".");
        }
      };
      reader.readAsArrayBuffer(file);
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = async (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault(); // Prevent browser save dialog

        if (stagedFiles.size === 0) {
          console.log("Ctrl+S pressed, but no files are staged.");
          // Optionally show a toast?
          // toast({ title: "Nothing to commit", description: "Drag files to stage them first." });
          return;
        }

        if (isCommitting) {
            console.log("Commit already in progress.");
            return;
        }

        console.log("Ctrl+S detected, initiating commit process...");
        setIsCommitting(true);
        setGeneratedCommitMsg(''); // Clear previous message
        const commitToastId = toast.loading("Preparing commit...");

        try {
          // 1. Fetch original content and compute diffs
          console.log("Fetching original content and calculating diffs...");
          const patches: string[] = [];
          for (const [path, { content }] of Array.from(stagedFiles.entries())) {
            try {
              // Fetch original content (null if new file)
              const originalContentResult = await getFileContent(path);
              const originalText = originalContentResult?.content ?? ''; // Default to empty string for new files

              // Convert staged content (ArrayBuffer or string) to string
              let stagedText: string;
              if (content instanceof ArrayBuffer) {
                  stagedText = new TextDecoder().decode(content); // Assuming UTF-8
              } else {
                  stagedText = content;
              }

              // Create patch using Diff.createPatch
              const patch = Diff.createPatch(path, originalText, stagedText);
              patches.push(patch);
              console.log(`Calculated diff for: ${path}`);

            } catch (fetchError) {
                console.error(`Error fetching content for ${path}:`, fetchError);
                // Decide how to handle: skip file, abort commit, etc.
                // For now, let's try to continue but log the error
                patches.push(`--- Error fetching ${path} ---\n+++ ${path} (staged) +++\n@@ -0,0 +1 @@\n+ (Content could not be compared due to error)`);
            }
          }
          const combinedDiff = patches.join('\n');
          console.log("Combined Diff:", combinedDiff);

          // 2. Generate Commit Message via API route
          let commitMessage = 'Update files'; // Default message
          if (combinedDiff.trim()) { // Only call LLM if there are actual changes
              console.log("Calling API to generate commit message...");
              try {
                  const response = await fetch('/api/generate-commit', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ diff: combinedDiff }),
                  });

                  if (!response.ok) {
                      const errorData = await response.json();
                      throw new Error(errorData.error || `API request failed with status ${response.status}`);
                  }

                  const result = await response.json();
                  commitMessage = result.message || commitMessage; // Use generated or fallback
                  console.log("Generated Commit Message:", commitMessage);
              } catch (apiError) {
                  console.error("Error generating commit message via API:", apiError);
                  toast.error("Could not generate commit message suggestion. Using default.", { id: commitToastId });
                  // Proceed with default message
              }
          }

          // 3. Prepare and open Commit Modal
          setGeneratedCommitMsg(commitMessage);
          setStagedPathsForModal(Array.from(stagedFiles.keys()));
          toast.dismiss(commitToastId); // Dismiss loading toast before opening modal
          setCommitModalOpen(true);

        } catch (error) {
          console.error("Error during commit preparation:", error);
          toast.error(`Error preparing commit: ${error instanceof Error ? error.message : 'Unknown error'}`, { id: commitToastId });
        } finally {
          setIsCommitting(false); // Ensure loading state is turned off
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    // Cleanup listener on unmount
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  // Depend on stagedFiles to re-bind if needed, and isCommitting to prevent double triggers
  }, [stagedFiles, isCommitting]);

  const handleConfirmMultiFileCommit = async (commitMessage: string) => {
      if (!commitMessage.trim()) {
          toast.error("Commit message cannot be empty.");
          return;
      }
      if (isCommitting) return; // Prevent double commit

      console.log("Confirming multi-file commit with message:", commitMessage);
      setIsCommitting(true);
      const commitToastId = toast.loading("Committing staged files...");

      // Prepare data for the server action
      const filesToCommit: StagedFileCommitDetails[] = Array.from(stagedFiles.entries())
          .map(([path, { content }]) => ({ path, content }));

      try {
          // Call the server action
          const result = await commitMultipleFiles(filesToCommit, commitMessage);

          if (result.success) {
              toast.success("Commit created successfully!", {
                  id: commitToastId,
                  description: `Commit URL: ${result.commitUrl || 'N/A'}`,
                  duration: 5000,
              });
              setStagedFiles(new Map()); // Clear staged files on success
              setCommitModalOpen(false);
              // Optionally: Trigger a refresh of the file tree?
              // Might need a way to call a refresh function on FileTree component
          } else {
              console.error("Commit failed:", result.error);
              toast.error(`Commit failed: ${result.error || 'Unknown error'}`, {
                  id: commitToastId,
                  duration: 8000, // Keep error toast longer
              });
          }
      } catch (error) {
          console.error("Error calling commitMultipleFiles action:", error);
          toast.error(`Commit failed: ${error instanceof Error ? error.message : 'Client-side error'}`, { id: commitToastId });
      } finally {
          setIsCommitting(false);
      }
  };

  if (isLoadingConnection) {
    return (
      <div className="flex flex-col h-screen">
        <header className="flex justify-between items-center p-4 border-b">
          <h1 className="text-xl font-bold">GitNote</h1>
          <Skeleton className="h-8 w-20" />
        </header>
        <div className="flex flex-grow p-4">
          <Skeleton className="w-64 h-full mr-4" />
          <Skeleton className="flex-grow h-full" />
        </div>
      </div>
    );
  }

  if (connection?.status === 'NO_CONNECTION') {
    return <ConnectRepoPrompt />;
  }

  if (connection?.status === 'CONNECTION_NO_REPO') {
    return <SelectRepoPrompt installationId={connection.installationId} onSuccess={handleRepoSelected} />;
  }

  if (connection?.status === 'CONNECTED') {
    return (
      <div className="flex flex-col h-screen">
        <header className="flex justify-between items-center p-4 border-b">
          <h1 className="text-xl font-bold">GitNote - {connection.repoFullName}</h1>
          <div className="flex items-center gap-2">
            <ThemeToggleButton />
            <form action={handleSignOut}>
              <Button type="submit" variant="outline">Sign Out</Button>
            </form>
          </div>
        </header>
        <div className="flex-1 flex flex-col min-h-0">
          <ResizablePanelGroup direction="horizontal" className="flex-grow">
            <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
              <div className="h-full overflow-auto p-2">
                <FileTree
                  selectedFilePath={selectedFile?.path}
                  onFileSelect={handleFileSelect}
                  onFileDrop={handleFileDrop}
                />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={75}>
              <div className="h-full">
                <Editor
                  ref={editorRef}
                  selectedFilePath={selectedFile?.path}
                  isNewFile={selectedFile?.isNew}
                  currentFileSha={currentFileSha}
                  onContentLoaded={handleContentLoaded}
                  repoFullName={connection.repoFullName}
                  viewMode={viewMode}
                  historicalCommitSha={historicalCommitSha}
                  onExitHistoryView={handleExitHistoryView}
                  onEnterHistoryViewRequest={handleEnterHistoryView}
                />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
          {stagedFiles.size > 0 && (
            <div className="p-4 border-t bg-background flex-shrink-0">
                <div className='flex justify-between items-center mb-2'>
                    <h3 className="font-semibold">Staged Files ({stagedFiles.size})</h3>
                    <Button variant="outline" size="sm" onClick={() => setStagedFiles(new Map())}>
                        Clear Staged
                    </Button>
                </div>
                <ul className="max-h-32 overflow-y-auto text-sm space-y-1">
                    {Array.from(stagedFiles.keys()).map(path => (
                        <li key={path} className="font-mono truncate bg-muted p-1 rounded text-muted-foreground">
                            {path}
                        </li>
                    ))}
                </ul>
                <div className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-md text-sm shadow z-50">
                   Press Ctrl+S to commit staged files.
                </div>
            </div>
          )}
          <CommitMessageModal
             open={commitModalOpen}
             onOpenChange={setCommitModalOpen}
             onConfirmCommit={handleConfirmMultiFileCommit}
             stagedFilePaths={stagedPathsForModal}
             initialMessage={generatedCommitMsg}
             title="Commit Staged Files"
             isLoading={isCommitting}
           />
        </div>
      </div>
    );
  }

  return <div>Loading or unexpected state...</div>;
} 