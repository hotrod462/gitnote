'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from '@/lib/actions/auth';
import { Button } from '@/components/ui/button';
import { checkUserConnectionStatus, ConnectionStatus } from '@/lib/actions/githubConnections';
import ConnectRepoPrompt from '@/components/ConnectRepoPrompt';
import SelectRepoPrompt from '@/components/SelectRepoPrompt';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import FileTree from '@/components/FileTree';
import Editor from '@/components/Editor';
import { Skeleton } from '@/components/ui/skeleton';

// Define possible view modes
type ViewMode = 'edit' | 'diff';

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
  const [diffCommitSha, setDiffCommitSha] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    async function fetchConnectionStatus() {
      setIsLoadingConnection(true);
      try {
        const status = await checkUserConnectionStatus();
        setConnection(status);
      } catch (error) {
        console.error("Failed to fetch connection status:", error);
        setConnection({ status: 'NO_CONNECTION' });
      } finally {
        setIsLoadingConnection(false);
      }
    }
    fetchConnectionStatus();
  }, []);

  const handleSignOut = async () => {
    await signOut();
    router.push('/login');
  };

  const handleFileSelect = useCallback((selection: { path: string; isNew?: boolean }) => {
    setSelectedFile({
        path: selection.path || null,
        isNew: selection.isNew || false
    });
    setCurrentFileSha(null); 
  }, [setSelectedFile, setCurrentFileSha]);

  const handleContentLoaded = useCallback((sha: string) => {
    setCurrentFileSha(sha);
    setSelectedFile(prev => ({ ...prev, isNew: false }));
  }, [setCurrentFileSha, setSelectedFile]);

  // Handlers for diff view
  const handleEnterDiffMode = useCallback((commitSha: string) => {
      if (!selectedFile.path) return;
      console.log(`Entering diff mode for file ${selectedFile.path}, commit ${commitSha}`);
      setViewMode('diff');
      setDiffCommitSha(commitSha);
  }, [selectedFile.path]);

  const handleExitDiffMode = useCallback(() => {
      console.log('Exiting diff mode');
      setViewMode('edit');
      setDiffCommitSha(null);
      // Optionally trigger a refresh of the current content? 
      // Or assume Editor handles returning to editable state?
  }, []);

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
    return <SelectRepoPrompt installationId={connection.installationId} />;
  }

  if (connection?.status === 'CONNECTED') {
    return (
      <div className="flex flex-col h-screen">
        <header className="flex justify-between items-center p-4 border-b">
          <h1 className="text-xl font-bold">GitNote - {connection.repoFullName}</h1>
          <form action={handleSignOut}>
            <Button type="submit" variant="outline">Sign Out</Button>
          </form>
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
                selectedFilePath={selectedFile?.path}
                isNewFile={selectedFile?.isNew}
                currentFileSha={currentFileSha}
                onContentLoaded={handleContentLoaded}
                repoFullName={connection.repoFullName}
                viewMode={viewMode}
                diffCommitSha={diffCommitSha}
                onExitDiffMode={handleExitDiffMode}
                onEnterDiffModeRequest={handleEnterDiffMode}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    );
  }

  return <div>Loading or unexpected state...</div>;
} 