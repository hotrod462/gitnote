'use client';

import React, { useEffect, useState, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Toolbar from './Toolbar'; // Import the toolbar
import { getFileContent, saveDraft, getLatestFileSha } from '@/lib/actions/githubApi'; // Import actions
import { Skeleton } from '@/components/ui/skeleton'; // For loading state
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Correct the import path
import { Terminal, AlertCircle } from 'lucide-react'; // Add AlertCircle for banners
import { set as idbSet, get as idbGet } from 'idb-keyval'; // Import idb-keyval functions
import debounce from 'lodash.debounce'; // Import debounce
import CommitMessageModal from '@/components/CommitMessageModal'; // Use default import
import { toast } from 'sonner'; // Import toast
import { Button } from '@/components/ui/button';
import { Markdown } from 'tiptap-markdown';
import posthog from 'posthog-js'; // Import PostHog

// Define possible view modes
type ViewMode = 'edit' | 'history_view';

// Define props interface
interface EditorProps {
  selectedFilePath: string | null;
  currentFileSha: string | null;
  onContentLoaded: (sha: string) => void;
  isNewFile?: boolean;
  repoFullName: string | null;

  // History View Props
  viewMode: ViewMode;
  historicalCommitSha: string | null;
  onExitHistoryView: () => void;
  onEnterHistoryViewRequest: (sha: string) => void; // Function to request history view
}

// Debounce time for autosave
const AUTOSAVE_DEBOUNCE_MS = 1000; // 1 second

// Define the interface for the functions exposed via the ref
export interface EditorRef {
  loadContent: (filePath: string) => void;
  loadHistoricalContent: (filePath: string, commitSha: string) => void; // Add history loader
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
    historicalCommitSha,
    onExitHistoryView,
    onEnterHistoryViewRequest // Received from NotesPage
  },
  ref
) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false);
  const [externalChangeDetected, setExternalChangeDetected] = useState(false);
  const [isCheckingSha, setIsCheckingSha] = useState(false);

  const debouncedSave = useRef<
    ReturnType<typeof debounce<(content: string) => void>> | undefined
  >(undefined);

  // Setup debounced autosave for Markdown
  useEffect(() => {
    debouncedSave.current = debounce((markdownContent: string) => {
      if (selectedFilePath && viewMode === 'edit') { // Only autosave in edit mode
        console.log("[Autosave IDB] Saving Markdown:", markdownContent.substring(0, 100) + "..."); // Log content being saved
        idbSet(selectedFilePath, markdownContent)
          .catch(err => console.error("Autosave to IndexedDB failed:", err));
      }
    }, AUTOSAVE_DEBOUNCE_MS);

    // Cleanup function
    return () => {
      debouncedSave.current?.cancel();
    };
  }, [selectedFilePath, viewMode]); // Depend on file path and view mode

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      Markdown.configure({
          html: false, // Ensure HTML is not parsed/output by the Markdown extension
          tightLists: true,
      }),
      StarterKit.configure({
        // Basic starter kit config
      }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert prose-sm sm:prose-base max-w-none focus:outline-none flex-grow p-4 border rounded-b-md overflow-y-auto',
      },
    },
    editable: viewMode === 'edit' && !isLoading,
    onUpdate: ({ editor }) => {
        // Autosave Markdown in edit mode
        if (viewMode === 'edit' && selectedFilePath && debouncedSave.current) {
            try {
                const markdownContent = editor.storage.markdown.getMarkdown();
                console.log("[onUpdate] Got Markdown from editor:", markdownContent.substring(0, 100) + "...");
                debouncedSave.current(markdownContent); // Call the debounced function with Markdown
            } catch (error) {
                console.error("Error getting markdown for autosave:", error);
            }
        }
    },
  });

  // Function to load current content
  const loadContentInternal = useCallback(async (filePath: string) => {
    if (!editor) return;
    console.log(`loadContentInternal called for EDIT: ${filePath}`);
    setIsLoading(true);
    setError(null);
    setExternalChangeDetected(false);

    editor.setEditable(false);
    try {
       console.log(`Loading content for EDIT: ${filePath}`);
       const data = await getFileContent(filePath);
       console.log("<<< RAW CONTENT FROM getFileContent >>>:", data);
       if (data) {
         // Use emitUpdate: false to prevent triggering onUpdate during load
         editor.commands.setContent(data.content, false); // Load content (should be Markdown from GH)
         onContentLoaded(data.sha);
         editor.setEditable(true);
       } else {
         setError(`File not found on GitHub: ${filePath}`);
         editor.commands.clearContent();
       }
    } catch (err: unknown) {
       console.error("Failed to load file content:", err);
       setError(err instanceof Error ? err.message : "Could not load file content.");
       editor.commands.clearContent();
    } finally {
      setIsLoading(false);
    }
  }, [editor, onContentLoaded]);

  // Function to load historical content (read-only)
  const loadHistoricalContentInternal = useCallback(async (filePath: string, commitSha: string) => {
    if (!editor) return;
    console.log(`loadHistoricalContentInternal called for HISTORY: ${filePath}, SHA: ${commitSha}`);
    setIsLoading(true);
    setError(null);
    setExternalChangeDetected(false); // Don't show external changes when viewing history

    editor.setEditable(false); // Ensure read-only
    try {
       console.log(`Loading historical content for: ${filePath} @ ${commitSha}`);
       const data = await getFileContent(filePath, commitSha); // Fetch historical content
       if (data) {
         // Use emitUpdate: false here too
         editor.commands.setContent(data.content, false); // Load historical content
         // DO NOT call onContentLoaded here
       } else {
         setError(`File content not found for commit ${commitSha.substring(0, 7)}`);
         editor.commands.clearContent();
       }
    } catch (err: unknown) {
       console.error("Failed to load historical file content:", err);
       setError(err instanceof Error ? err.message : "Could not load historical file content.");
       editor.commands.clearContent();
    } finally {
      setIsLoading(false);
    }
  }, [editor]);

  // Function to handle setting up a new file
  const handleNewFileInternal = useCallback((filePath: string) => {
      if (!editor) return;
      console.log(`Handling new file creation for: ${filePath}`);
      setIsLoading(false);
      setError(null);
      editor.commands.clearContent();
      editor.setEditable(true);
      setExternalChangeDetected(false);
      // Initialize IndexedDB with empty string for new files
      idbSet(filePath, '')
          .then(() => console.log(`Initialized IndexedDB (empty Markdown) for new file: ${filePath}`))
          .catch((err) => console.error(`Failed to initialize IndexedDB for ${filePath}:`, err));
  }, [editor]);

  // Expose functions via ref
  useImperativeHandle(ref, () => ({
    loadContent: (filePath: string) => {
        loadContentInternal(filePath);
    },
    loadHistoricalContent: (filePath: string, commitSha: string) => {
        loadHistoricalContentInternal(filePath, commitSha);
    },
    handleNewFile: (filePath: string) => {
        handleNewFileInternal(filePath);
    }
  }), [loadContentInternal, handleNewFileInternal, loadHistoricalContentInternal]);

  // Effect to handle initial setup for new files explicitly
  useEffect(() => {
    // This effect specifically handles the transition TO a new file state
    if (isNewFile && selectedFilePath && editor && viewMode === 'edit') {
        // Ensure editor is ready for a new file state when isNewFile becomes true
        console.log("useEffect[isNewFile]: Handling new file setup");
        handleNewFileInternal(selectedFilePath);
    }
  }, [isNewFile, selectedFilePath, editor, viewMode, handleNewFileInternal]);

  // Main useEffect to INITIATE loading based on identifying props
  useEffect(() => {
    if (!editor || !selectedFilePath) {
        // Clear things if no file/editor
        if(editor) {
            editor.commands.clearContent(false); // Don't trigger update
            editor.setEditable(false);
        }
        setIsLoading(false); // Ensure loading is false
        setError(null);
        return; // Exit early if no file path or editor
    }

    // Decide what to load based on viewMode and file path
    // This effect runs primarily when the file or view mode *changes*
    if (viewMode === 'edit') {
        if (isNewFile) {
             // Handled by the isNewFile-specific effect above
             return; // Don't load if it's designated as new
        }
        // Load current content if in edit mode and not a new file
        console.log("useEffect[loadTrigger]: Triggering loadContentInternal");
        loadContentInternal(selectedFilePath); // This sets isLoading=true internally
    } else if (viewMode === 'history_view' && historicalCommitSha) {
        // Load historical content if in history view mode
        console.log("useEffect[loadTrigger]: Triggering loadHistoricalContentInternal");
        loadHistoricalContentInternal(selectedFilePath, historicalCommitSha); // This sets isLoading=true internally
    } else {
        // Should not happen if selectedFilePath exists? Clear anyway.
        if(editor) {
            editor.commands.clearContent(false);
            editor.setEditable(false);
        }
        console.warn("Editor load trigger effect: Unexpected state, clearing content.", { viewMode, selectedFilePath, historicalCommitSha });
    }

  // Dependencies: Trigger load ONLY when these identity props change, or editor becomes available.
  // Removed isLoading from here.
  }, [selectedFilePath, editor, viewMode, historicalCommitSha, isNewFile, loadContentInternal, loadHistoricalContentInternal]);

  // Separate useEffect to manage the editor's editable state
  useEffect(() => {
      if (!editor) return;
      // Update editable state whenever viewMode or isLoading changes
      console.log(`useEffect[editable]: Setting editable based on viewMode='${viewMode}', isLoading=${isLoading}`);
      editor.setEditable(viewMode === 'edit' && !isLoading);
  }, [editor, viewMode, isLoading]);

  // useEffect for external change detection
  useEffect(() => {
    const handleVisibilityChange = async () => {
        if (document.visibilityState !== 'visible') {
            return;
        }

        // Only check for external changes if in edit mode and not currently checking
        if (viewMode !== 'edit' || !selectedFilePath || isNewFile || !editor || isCheckingSha || !currentFileSha) {
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
  }, [selectedFilePath, currentFileSha, isNewFile, editor, isCheckingSha, viewMode]); // Include viewMode

  // Function to handle refresh request
  const handleRefreshContent = () => {
    // Reload the current file content when in edit mode
    if (selectedFilePath && viewMode === 'edit') {
      console.log("handleRefreshContent: Reloading current content");
      loadContentInternal(selectedFilePath);
    } else {
      console.warn("Refresh requested but not in editable state or no file selected.");
    }
  };

  // Function to initiate save process
  const handleRequestSave = () => {
    if (!editor || !selectedFilePath || !repoFullName || viewMode !== 'edit') {
      console.error("Cannot save: Invalid state (editor, path, repo, mode).");
      toast.error("Cannot save: Editor not ready or not in edit mode.");
      return;
    }
    // Save Markdown to IndexedDB before showing modal
    try {
        const markdownContent = editor.storage.markdown.getMarkdown();
        console.log("[handleRequestSave] Got Markdown from editor:", markdownContent.substring(0, 100) + "...");
        console.log("[handleRequestSave] Forcing save to IDB before modal...");
        idbSet(selectedFilePath, markdownContent)
            .then(() => {
              console.log(`[handleRequestSave] Markdown content for ${selectedFilePath} saved to IndexedDB before opening modal.`);
              setIsCommitModalOpen(true); // Open modal only after IDB save succeeds
            })
            .catch(err => {
              console.error(`Failed to save Markdown to IndexedDB before opening modal for ${selectedFilePath}:`, err);
              toast.error("Failed to save content locally before committing.");
            });
    } catch (error) {
        console.error("Error getting markdown for save request:", error);
        toast.error("Could not get current Markdown content to save.");
    }
  };

  // Function to confirm save and call server action
  const handleConfirmSave = async (commitMessage: string) => {
    if (!editor || !selectedFilePath || !repoFullName || viewMode !== 'edit') {
      console.error("Save confirmation failed: Invalid state.");
      toast.error("Save failed: Editor not ready or not in edit mode.");
      return;
    }
    const toastId = toast.loading(`Saving draft: ${selectedFilePath}`);
    try {
      // Retrieve Markdown from IndexedDB
      const contentToSave = await idbGet(selectedFilePath);
      console.log("[handleConfirmSave] Retrieved content from IDB:", typeof contentToSave, (contentToSave || 'undefined').substring(0, 100) + "...");
      if (contentToSave === undefined || typeof contentToSave !== 'string') {
        // If IDB content is missing or not a string, try getting directly from editor as fallback
        console.warn("[handleConfirmSave] Content missing/invalid in IDB, attempting fallback to editor.storage.markdown.getMarkdown()");
        try {
             const fallbackContent = editor.storage.markdown.getMarkdown();
             console.log("[handleConfirmSave] Fallback content from editor:", fallbackContent.substring(0,100) + "...");
             if(typeof fallbackContent === 'string'){
                 // Note: We proceed with fallback but IDB state is potentially problematic
                 await saveToServer(selectedFilePath, fallbackContent, currentFileSha, commitMessage, toastId);
             } else {
                 throw new Error("Fallback content retrieval failed.");
             }
        } catch(fallbackError) {
             console.error("[handleConfirmSave] Fallback content retrieval failed:", fallbackError);
             throw new Error("Could not retrieve content from local storage or editor for saving.");
        }
      } else {
         // Proceed with content retrieved from IndexedDB (expected path)
         await saveToServer(selectedFilePath, contentToSave, currentFileSha, commitMessage, toastId);
      }
    } catch (err: unknown) {
        console.error("Failed to save draft (catch block in handleConfirmSave):", err);
        const message = err instanceof Error ? err.message : 'An unexpected error occurred';
        toast.error(`Error saving draft: ${message}`, { id: toastId });
        // Capture generic save error
        posthog.capture('note_save_failed', {
             file_path: selectedFilePath,
             error: message,
             is_conflict: false // Unlikely a conflict if caught here
         });
    }
  };

  // Helper function for the actual server call part of saving
  const saveToServer = async (
      filePath: string, 
      content: string, 
      sha: string | null, 
      commitMessage: string, 
      toastId: string | number | undefined
  ) => {
      console.log(`[saveToServer] Saving draft for ${filePath} with SHA ${sha || 'null (new file?)'}`);
      // Note: currentFileSha from state is used, isNewFile prop isn't strictly needed here if currentFileSha is null for new files
      const result = await saveDraft(
          filePath,
          content,
          sha || undefined, // Pass undefined if SHA is null (for creates)
          commitMessage
      );

      if (result.success) {
          if (result.sha) {
              onContentLoaded(result.sha); // Update SHA state in NotesPage
          }
          toast.success(`Draft saved successfully: ${filePath}`, { id: toastId });
          setIsCommitModalOpen(false);
          setExternalChangeDetected(false); // Clear flag after successful save

          // Capture successful save event
          posthog.capture('note_saved', { file_path: filePath });

      } else {
          // Capture failed save event
          posthog.capture('note_save_failed', {
              file_path: filePath,
              error: result.error,
              is_conflict: result.isConflict
          });
          if (result.isConflict) {
             toast.error('Save Conflict: File changed on server. Please copy changes, refresh, and re-apply.', { id: toastId, duration: 10000 });
             setExternalChangeDetected(true); // Explicitly set flag on conflict
          } else {
             toast.error(`Error saving draft: ${result.error || 'Unknown server error'}`, { id: toastId });
          }
          // Re-throw the error if needed for the outer catch block, though maybe not necessary here
          // throw new Error(result.error || 'Save failed');
      }
  };

  // Determine what content to display
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
  } else if (!selectedFilePath && viewMode === 'edit') { // Show placeholder only in edit mode
    contentArea = (
      <div className="flex-grow flex items-center justify-center text-muted-foreground">
        <p>Select a file from the tree or create a new one.</p>
      </div>
    );
  } else { // Render editor content if loading is done, no error, and either file selected or in history view
    contentArea = <EditorContent editor={editor} className="flex-grow overflow-y-auto"/>;
  }

  return (
    <div
       key={`view-${viewMode}-${selectedFilePath || 'no-file'}-${historicalCommitSha || 'current'}`}
       className="w-full h-full flex flex-col"
    >
      {/* History View Alert Banner */}
      {viewMode === 'history_view' && historicalCommitSha && (
         <Alert variant="default" className="m-2 flex items-center justify-between border-blue-500">
           <Terminal className="h-4 w-4 text-blue-600" />
           <div className='flex-grow mx-2'>
             <AlertTitle className='text-blue-700'>Viewing History</AlertTitle>
             <AlertDescription>
               You are viewing the content from commit <code className='font-mono bg-muted px-1 rounded'>{historicalCommitSha.substring(0, 7)}</code>. This view is read-only.
             </AlertDescription>
           </div>
           <Button variant="outline" size="sm" onClick={onExitHistoryView}>
             Exit History View
           </Button>
         </Alert>
      )}

      {/* External Change Alert (only show in edit mode) */}
      {viewMode === 'edit' && externalChangeDetected && (
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

      {/* Toolbar: Show only when editing and editor exists */}
      {editor && viewMode === 'edit' && repoFullName && !externalChangeDetected && (
        <Toolbar
          editor={editor}
          onRequestSave={handleRequestSave}
          selectedFilePath={selectedFilePath}
          onSelectCommit={onEnterHistoryViewRequest} // Pass history request handler
        />
      )}

      {contentArea}

      {/* Commit Modal (only relevant for edit mode) */}
      {viewMode === 'edit' && selectedFilePath && repoFullName && (
         <CommitMessageModal
           open={isCommitModalOpen}
           onOpenChange={setIsCommitModalOpen}
           onConfirmCommit={handleConfirmSave}
           fileName={selectedFilePath.split('/').pop() || 'New File'} // Get filename
         />
      )}
    </div>
  );
})

Editor.displayName = 'Editor';

export default Editor;
