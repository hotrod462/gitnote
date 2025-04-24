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
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();

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
      toast({
          title: "Connection Error",
          description: "Could not check repository connection status. Please try again later.",
          variant: "destructive"
      });
      setConnection({ status: 'NO_CONNECTION' }); // Set to a default error state
    } finally {
      setIsLoadingConnection(false);
    }
  }, [toast]);

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
        <ResizablePanelGroup direction="horizontal" className="flex-grow">
          <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
            <div className="h-full overflow-auto p-2">
              <FileTree
                selectedFilePath={selectedFile?.path}
                onFileSelect={handleFileSelect}
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
      </div>
    );
  }

  return <div>Loading or unexpected state...</div>;
} 