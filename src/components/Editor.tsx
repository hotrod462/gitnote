'use client';

import React, { useEffect, useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Toolbar from './Toolbar'; // Import the toolbar
import { getFileContent, saveDraft, getLatestFileSha } from '@/lib/actions/githubApi'; // Import actions
import { Skeleton } from '@/components/ui/skeleton'; // For loading state
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Correct the import path
import { Terminal, AlertCircle } from 'lucide-react'; // Add AlertCircle
import { set as idbSet, get as idbGet } from 'idb-keyval'; // Import idb-keyval functions
import debounce from 'lodash.debounce'; // Import debounce
import CommitMessageModal from '@/components/CommitMessageModal'; // Use default import
import { toast } from 'sonner'; // Import toast
import { Button } from '@/components/ui/button';
import { diffLines, type Change } from 'diff'; // Import diffLines and Change from the correct package
import { DiffHighlightExtension } from './editor/DiffHighlightExtension'; // Import the custom extension
import { Markdown } from 'tiptap-markdown';
import { pluginKey } from './editor/DiffHighlightExtension'; // Import the plugin key

// Define possible view modes (also defined in NotesPage, consider centralizing)
type ViewMode = 'edit' | 'diff'; 

// Define props interface
interface EditorProps {
  selectedFilePath: string | null;
  currentFileSha: string | null; // Keep track of the SHA for saving later
  onContentLoaded: (sha: string) => void; // Callback when content loads
  // Add isNew flag (will be passed from NotesPage later)
  isNewFile?: boolean; 
  repoFullName: string | null; // Need repo name for saving
  
  // Add props for diff view
  viewMode: ViewMode;
  diffCommitSha: string | null;
  onExitDiffMode: () => void;
  onEnterDiffModeRequest: (sha: string) => void; // Renamed prop
}

// Debounce time for autosave
const AUTOSAVE_DEBOUNCE_MS = 1000; // 1 second

// Define the interface for the functions exposed via the ref
export interface EditorRef {
  loadContent: (filePath: string) => void;
  loadDiffContent: (filePath: string, commitSha: string) => void;
  handleNewFile: (filePath: string) => void;
}

// Wrap component with forwardRef to accept a ref
const Editor = forwardRef<EditorRef, EditorProps>((
  { 
    selectedFilePath, 
    currentFileSha, 
    onContentLoaded, 
    isNewFile, 
    repoFullName, 
    viewMode, 
    diffCommitSha, 
    onExitDiffMode, 
    onEnterDiffModeRequest
  },
  ref
) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
  const [externalChangeDetected, setExternalChangeDetected] = useState(false);
  const [isCheckingSha, setIsCheckingSha] = useState(false);
  const [diffResult, setDiffResult] = useState<Change[] | null>(null);

  const debouncedSave = useRef<
    ReturnType<typeof debounce<(content: string) => void>> | undefined
  >(undefined);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      Markdown.configure({
          html: false, 
          tightLists: true, 
      }),
      StarterKit.configure({
        // Heading is enabled here
      }),
      DiffHighlightExtension.configure({
        diffResult: diffResult,
      })
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert prose-sm sm:prose-base lg:prose-lg xl:prose-2xl focus:outline-none flex-grow p-4 border rounded-b-md overflow-y-auto',
      },
    },
    editable: viewMode === 'edit' && !isLoading,
    onUpdate: ({ editor }) => {
        if (viewMode === 'edit' && selectedFilePath && debouncedSave.current) {
            debouncedSave.current(editor.getHTML()); 
        }
    },
  });

  const loadContentInternal = useCallback(async (filePath: string, mode: ViewMode, historicalSha: string | null) => {
    if (!editor) return;
    console.log(`loadContentInternal called`, { filePath, mode, historicalSha });
    setIsLoading(true);
    setError(null);
    setExternalChangeDetected(false);
    // No longer set diffResult state directly here
    // setDiffResult(null); 
    
    // Clear previous diff state in plugin when loading new content
    // Check view and state exist before dispatching on init/clear
    if (editor.view && editor.state) { // Simplified check
        try {
             editor.view.dispatch(
                 editor.state.tr.setMeta(pluginKey, null) // Send null to clear
             );
        } catch (e) {
            console.warn("Dispatch failed on clear, editor state might not be ready:", e);
        }
    }

    editor.setEditable(false); 
    try {
      if (mode === 'diff' && historicalSha) {
          console.log(`Loading content for DIFF: ${filePath}, Commit: ${historicalSha}`);
          const [historicalData, currentData] = await Promise.all([
              getFileContent(filePath, historicalSha),
              getFileContent(filePath)
          ]);
          if (historicalData && currentData) {
              // Set content WITHOUT emitting update immediately, wait for transaction
              editor.commands.setContent(historicalData.content, false);
              const diff = diffLines(historicalData.content, currentData.content);
              console.log('Diff calculated:', diff);
              
              // Dispatch transaction with diff data AFTER setting content
              // Ensure view and state are available
              if (editor.view && editor.state) { // Simplified check
                  try {
                       editor.view.dispatch(
                           editor.state.tr.setMeta(pluginKey, diff)
                       );
                       console.log('Dispatched transaction with diff metadata');
                  } catch (e) {
                       console.error('Dispatch failed when sending diff metadata:', e);
                  }
              } else {
                   console.error('Editor view/state not ready to dispatch diff metadata');
              }

          } else {
              setError(`Could not load content for diff. Hist: ${!!historicalData}, Curr: ${!!currentData}`);
              editor.commands.clearContent();
          }
      } else { 
           // EDIT MODE
           console.log(`Loading content for EDIT: ${filePath}`);
           // Ensure diff state is cleared when entering edit mode
           if (editor.view && editor.state) { // Simplified check
                try {
                     editor.view.dispatch(
                         editor.state.tr.setMeta(pluginKey, null) // Send null to clear
                     );
                } catch (e) {
                    console.warn("Dispatch failed on entering edit mode, editor state might not be ready:", e);
                }
           }
           const data = await getFileContent(filePath);
           if (data) {
             // Set content AND emit update for edit mode
             editor.commands.setContent(data.content);
             onContentLoaded(data.sha);
             editor.setEditable(true); 
           } else {
             setError(`File not found on GitHub: ${filePath}`);
             editor.commands.clearContent();
           }
      }
    } catch (err: any) {
       console.error("Failed to load file content:", err);
       setError(err.message || "Could not load file content.");
       editor.commands.clearContent(); // Clear content on error too
    } finally {
      setIsLoading(false);
    }
  }, [editor, onContentLoaded]);

  const handleNewFileInternal = useCallback((filePath: string) => {
      if (!editor) return;
      console.log(`Handling new file creation for: ${filePath}`);
      setIsLoading(false);
      setError(null);
      editor.commands.clearContent();
      editor.setEditable(true);
      setDiffResult(null); 
      setExternalChangeDetected(false); 
      idbSet(filePath, '')
          .then(() => console.log(`Initialized IndexedDB for new file: ${filePath}`))
          .catch((err) => console.error(`Failed to initialize IndexedDB for ${filePath}:`, err));
  }, [editor]);

  useImperativeHandle(ref, () => ({
    loadContent: (filePath: string) => {
        loadContentInternal(filePath, 'edit', null);
    },
    loadDiffContent: (filePath: string, commitSha: string) => {
        loadContentInternal(filePath, 'diff', commitSha);
    },
    handleNewFile: (filePath: string) => {
        handleNewFileInternal(filePath);
    }
  }), [loadContentInternal, handleNewFileInternal]);

  useEffect(() => {
    if (isNewFile && selectedFilePath && editor && !isLoading && !editor.isFocused) {
        handleNewFileInternal(selectedFilePath);
    }
  }, [isNewFile, selectedFilePath, editor, isLoading, handleNewFileInternal]);

  useEffect(() => {
    if (!editor) return;

    if (!selectedFilePath) {
      editor?.commands.clearContent();
      editor?.setEditable(false);
      setIsLoading(false);
      setError(null);
      return;
    }

    if (isNewFile) {
        console.log(`Handling new file creation for: ${selectedFilePath}`);
        setIsLoading(false);
        setError(null);
        editor?.commands.clearContent();
        editor?.setEditable(true);
        idbSet(selectedFilePath, '')
            .then(() => console.log(`Initialized IndexedDB for new file: ${selectedFilePath}`))
            .catch((err) => console.error(`Failed to initialize IndexedDB for ${selectedFilePath}:`, err));
        return;
    }

    loadContentInternal(selectedFilePath, 'edit', null);

  }, [selectedFilePath, editor, onContentLoaded, isNewFile, loadContentInternal]);

  useEffect(() => {
    const handleVisibilityChange = async () => {
        if (document.visibilityState !== 'visible') {
            return;
        }
        
        if (!selectedFilePath || isNewFile || !editor || isCheckingSha || !currentFileSha || viewMode === 'diff') { 
            return; 
        }

        console.log('Page became visible, checking for external changes...');
        setIsCheckingSha(true);
        try {
            const result = await getLatestFileSha(selectedFilePath);
            if (result.sha && result.sha !== currentFileSha) {
                console.warn(`External change detected! Local SHA: ${currentFileSha}, Remote SHA: ${result.sha}`);
                setExternalChangeDetected(true);
            } else if (result.error) {
                console.error('Error checking latest SHA:', result.error);
            }
        } catch (err) {
            console.error('Unexpected error during SHA check:', err);
        } finally {
            setIsCheckingSha(false);
        }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [selectedFilePath, currentFileSha, isNewFile, editor, isCheckingSha, viewMode]);

  const handleRefreshContent = () => {
    console.warn("Refresh requested. Parent should call editorRef.current.loadContent()."); 
  };

  const handleRequestSave = () => {
    if (!editor || !selectedFilePath || !repoFullName) {
      console.error("Missing editor, file path, or repo name for save.");
      toast.error("Cannot save: Missing required information.");
      return;
    }
     const currentContent = editor.getHTML(); 
    console.log("Requesting save. Current content:", currentContent);
    idbSet(selectedFilePath, currentContent)
      .then(() => {
        console.log(`Content for ${selectedFilePath} saved to IndexedDB before opening modal.`);
        setIsCommitModalOpen(true);
      })
      .catch(err => {
        console.error(`Failed to save to IndexedDB before opening modal for ${selectedFilePath}:`, err);
        toast.error("Failed to save content locally before committing.");
      });
  };

  const handleExitDiffClick = () => {
      onExitDiffMode();
  }

  const handleConfirmSave = async (commitMessage: string) => {
    if (!editor || !selectedFilePath || !repoFullName) {
      console.error("Save confirmation failed: Missing editor, path, or repo name.");
      toast.error("Save failed: Missing required information.");
      return;
    }
    setIsSaving(true);
    const toastId = toast.loading(`Saving draft: ${selectedFilePath}`);
    try {
      const contentToSave = await idbGet(selectedFilePath);
      if (contentToSave === undefined) {
        throw new Error("Could not retrieve content from local storage for saving.");
      }
      
      console.log(`Saving draft for ${selectedFilePath} with SHA ${currentFileSha || 'null (new file)'}`);
      console.log("Content being saved:", contentToSave);

      const result = await saveDraft(
          selectedFilePath, 
          contentToSave, 
          isNewFile ? undefined : currentFileSha || undefined,
          commitMessage
      );

      if (result.success) {
          if (result.sha) {
              onContentLoaded(result.sha);
          }
          toast.success(`Draft saved successfully: ${selectedFilePath}`, { id: toastId });
          setIsCommitModalOpen(false);
      } else {
          if (result.isConflict) {
             toast.error('Save Conflict: File changed on server. Please copy changes, refresh, and re-apply.', { id: toastId, duration: 10000 });
          } else {
             toast.error(`Error saving draft: ${result.error || 'Unknown server error'}`, { id: toastId });
          }
      }

    } catch (err: any) { 
        console.error("Failed to save draft (catch block):", err);
        toast.error(`Error saving draft: ${err.message || 'An unexpected error occurred'}`, { id: toastId });
    } finally {
        setIsSaving(false);
    }
  };

  let contentArea: React.ReactNode;

  if (isLoading) {
    contentArea = (
      <div className="flex-grow flex items-center justify-center p-4">
        <Skeleton className="h-full w-full" />
      </div>
    );
  } else if (error) {
    contentArea = (
      <div className="flex-grow flex items-center justify-center p-4">
         <Alert variant="destructive" className="max-w-lg">
            <Terminal className="h-4 w-4" />
            <AlertTitle>Error Loading File</AlertTitle>
            <AlertDescription>
              {error}
            </AlertDescription>
          </Alert>
      </div>
    );
  } else if (!selectedFilePath && viewMode === 'edit') {
    contentArea = (
      <div className="flex-grow flex items-center justify-center text-muted-foreground">
        <p>Select a file from the tree or create a new one.</p>
      </div>
    );
  } else {
    contentArea = <EditorContent editor={editor} className="flex-grow overflow-y-auto"/>;
  }

  return (
    <div 
      key={`${viewMode}-${selectedFilePath || 'no-file'}-${diffCommitSha || 'no-diff'}`}
      className="w-full h-full flex flex-col"
    >
      {viewMode === 'diff' && diffCommitSha && (
          <Alert variant="default" className="m-2 flex items-center justify-between bg-blue-100 dark:bg-blue-900">
            <div className="flex items-center">
                <AlertCircle className="h-4 w-4 mr-2 text-blue-700 dark:text-blue-300" />
                <div>
                  <AlertTitle className="text-blue-800 dark:text-blue-200">Viewing History</AlertTitle>
                  <AlertDescription className="text-blue-700 dark:text-blue-300">
                    Viewing content from commit {diffCommitSha.substring(0, 7)}. Editor is read-only.
                  </AlertDescription>
                </div>
            </div>
            <Button variant="outline" size="sm" onClick={handleExitDiffClick}> 
              Exit Diff View
            </Button>
          </Alert>
      )}

      {externalChangeDetected && (
        <Alert variant="destructive" className="m-2 flex items-center justify-between">
          <div className="flex items-center">
              <AlertCircle className="h-4 w-4 mr-2" />
              <div>
                <AlertTitle>External Change Detected</AlertTitle>
                <AlertDescription>
                  This file has been modified on GitHub since you opened it. Refresh to load the latest version.
                </AlertDescription>
              </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefreshContent}>
            Refresh File
          </Button>
        </Alert>
      )}

      {editor && viewMode === 'edit' && repoFullName && !externalChangeDetected && (
        <Toolbar 
          editor={editor} 
          onRequestSave={handleRequestSave} 
          selectedFilePath={selectedFilePath}
          onSelectCommit={onEnterDiffModeRequest}
        />
      )}
      {contentArea}
      {selectedFilePath && repoFullName && (
         <CommitMessageModal
           open={isCommitModalOpen}
           onOpenChange={setIsCommitModalOpen}
           onConfirmCommit={handleConfirmSave}
           fileName={selectedFilePath || 'New File'}
         />
      )}
    </div>
  );
})

Editor.displayName = 'Editor';

export default Editor;
