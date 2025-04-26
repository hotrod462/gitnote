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
import CommitMessageModal from '@/components/CommitMessageModal';
import { useFileStagingAndCommit } from '@/hooks/useFileStagingAndCommit';
import { PanelRightOpen } from 'lucide-react';
import { usePostHog } from 'posthog-js/react';

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
  const [fileTreeKey, setFileTreeKey] = useState(Date.now());
  const [isEditorVisible, setIsEditorVisible] = useState(false);
  const posthog = usePostHog();

  const {
      stagedFiles,
      isCommitting,
      commitModalOpen,
      generatedCommitMsg,
      stagedPathsForModal,
      isFetchingCommitMsg,
      handleFileDrop,
      setCommitModalOpen,
      handleConfirmMultiFileCommit,
      clearStagedFiles
  } = useFileStagingAndCommit({
    onCommitSuccess: () => {
      console.log('[NotesPage] Commit successful, updating FileTree key.');
      setFileTreeKey(Date.now());
      posthog.capture('commit_success', { count: stagedFiles.size });
    }
  });

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

  // PostHog Pageview Tracking
  useEffect(() => {
    posthog.capture('$pageview');
    // Track pageleave on unmount
    return () => {
      posthog.capture('$pageleave');
    };
  }, [posthog]); // Dependency: posthog instance

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

    // Check if it's the root placeholder or looks like a file
    const isRootPlaceholder = newPath === '.';
    const looksLikeFile = newPath && !isRootPlaceholder && /\.(tsx|ts|js|jsx|md|json|html|css|gitignore|env|example|lock|mjs)$/i.test(newPath);

    // Show editor only when a file-like path is selected
    if (newPath && looksLikeFile && !isEditorVisible) {
        setIsEditorVisible(true);
    }

    // Don't try to load content for the root placeholder
    if (newPath && !isRootPlaceholder) {
        if (isNew) {
            // Assuming new files are always files
            editorRef.current?.handleNewFile(newPath);
            if (!isEditorVisible) setIsEditorVisible(true);
        } else if (looksLikeFile) {
            // Only load content if it looks like a file
            editorRef.current?.loadContent(newPath);
        }
    }
  }, [editorRef, isEditorVisible]);

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

  if (isLoadingConnection) {
    return (
      <div className="flex flex-col h-screen">
        <header className="flex justify-between items-center p-4 border-b">
          <h1 className="text-xl font-bold">GitSync</h1>
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
          <h1 className="text-xl font-bold">GitSync - {connection.repoFullName}</h1>
          <div className="flex items-center gap-2">
            <ThemeToggleButton />
            <form action={handleSignOut}>
              <Button type="submit" variant="outline">Sign Out</Button>
            </form>
          </div>
        </header>
        <div className="flex-1 flex flex-row min-h-0">
          <ResizablePanelGroup 
            direction="horizontal" 
            className="flex-grow"
          >
            <ResizablePanel 
              defaultSize={isEditorVisible ? 50 : 100} 
              minSize={isEditorVisible ? 15 : 100}
              order={1}
            >
              <div className="h-full overflow-auto">
                <FileTree
                  key={fileTreeKey}
                  selectedFilePath={selectedFile?.path}
                  onFileSelect={handleFileSelect}
                  onFileDrop={handleFileDrop}
                />
              </div>
            </ResizablePanel>
            {isEditorVisible && (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel 
                  defaultSize={50} 
                  minSize={0}
                  order={2}
                >
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
              </>
            )}
          </ResizablePanelGroup>
          <div className="flex-shrink-0 w-12 flex flex-col items-center p-2 border-l space-y-2">
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setIsEditorVisible(!isEditorVisible)} 
              title={isEditorVisible ? "Hide Editor" : "Show Editor"}
            >
              <PanelRightOpen className="h-5 w-5" /> 
            </Button>
          </div>
        </div>
        {stagedFiles.size > 0 && (
          <div className="p-4 border-t bg-background flex-shrink-0">
              <div className='flex flex-wrap justify-between items-center gap-2 mb-2'>
                  <h3 className="font-semibold">Staged Files ({stagedFiles.size})</h3>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={clearStagedFiles}
                      className="text-red-600 border-red-600/50 hover:text-red-700 hover:bg-red-50 dark:text-red-500 dark:border-red-500/50 dark:hover:text-red-400 dark:hover:bg-red-950"
                    >
                        Clear Staged
                    </Button>
                    <Button 
                      size="sm" 
                      onClick={() => setCommitModalOpen(true)} 
                      disabled={isCommitting || isFetchingCommitMsg}
                      className="bg-green-100 text-green-900 hover:bg-green-200 dark:bg-green-800 dark:text-green-50 dark:hover:bg-green-700"
                    >
                      Commit Staged
                    </Button>
                  </div>
              </div>
              <ul className="max-h-32 overflow-y-auto text-sm space-y-1 mb-2">
                  {(Array.from(stagedFiles.keys()) as string[]).map((path: string) => (
                      <li key={path} className="font-mono truncate bg-muted p-1 rounded text-muted-foreground">
                          {path}
                      </li>
                  ))}
              </ul>
              <div className="hidden sm:block fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-primary text-primary-foreground px-3 py-1 rounded-md text-sm shadow z-50">
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
           isFetchingMessage={isFetchingCommitMsg}
         />
      </div>
    );
  }

  return <div>Loading or unexpected state...</div>;
} 