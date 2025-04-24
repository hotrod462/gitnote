'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
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
import { Button } from '@/components/ui/button'; // Import Button

// Define props interface
interface EditorProps {
  selectedFilePath: string | null;
  currentFileSha: string | null; // Keep track of the SHA for saving later
  onContentLoaded: (sha: string) => void; // Callback when content loads
  // Add isNew flag (will be passed from NotesPage later)
  isNewFile?: boolean; 
  repoFullName: string | null; // Need repo name for saving
}

// Debounce time for autosave
const AUTOSAVE_DEBOUNCE_MS = 1000; // 1 second

// Accept props
export default function Editor({ selectedFilePath, currentFileSha, onContentLoaded, isNewFile, repoFullName }: EditorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false); // State for save operation
  const [isCommitModalOpen, setIsCommitModalOpen] = useState(false); // State for modal
  const [externalChangeDetected, setExternalChangeDetected] = useState(false);
  const [isCheckingSha, setIsCheckingSha] = useState(false); // Loading state for SHA check

  // Ref to store the debounced save function
  const debouncedSave = useRef<
    ReturnType<typeof debounce<(content: string) => void>> | undefined
  >(undefined);

  const editor = useEditor({
    extensions: [
      StarterKit, // Includes Bold, Italic, Paragraph, etc.
      // TODO: Add other extensions later if needed (e.g., Link, Table, TaskList)
    ],
    content: '', // Initial content is empty
    // Basic editor appearance
    editorProps: {
      attributes: {
        // Adjusted classes for better integration within the panel
        class: 'prose dark:prose-invert prose-sm sm:prose-base lg:prose-lg xl:prose-2xl focus:outline-none flex-grow p-4 border rounded-b-md overflow-y-auto',
      },
    },
    // Make editor initially read-only until content loads or new file
    editable: false, 

    // Autosave onUpdate handler
    onUpdate: ({ editor }) => {
      // Trigger the debounced save function
      if (selectedFilePath && debouncedSave.current) {
          // Use getHTML() or getText() depending on desired format
          debouncedSave.current(editor.getHTML()); 
      }
    },
  });

  // Effect to initialize debounced save function
  useEffect(() => {
    if (!selectedFilePath) {
      // If no file selected, cancel any pending saves
      debouncedSave.current?.cancel();
      return;
    }
    
    // Create the debounced function for the current selected file path
    debouncedSave.current = debounce((content: string) => {
      console.log(`Autosaving to IndexedDB for: ${selectedFilePath}`);
      idbSet(selectedFilePath, content)
        .then(() => console.log(`Autosave successful for ${selectedFilePath}`))
        .catch((err) => console.error(`Autosave failed for ${selectedFilePath}:`, err));
    }, AUTOSAVE_DEBOUNCE_MS);

    // Cleanup function to cancel debounced save on component unmount or path change
    return () => {
      debouncedSave.current?.flush(); // Save any pending changes immediately before changing file/unmounting
      debouncedSave.current?.cancel(); // Cancel subsequent calls
    };
  }, [selectedFilePath]); // Recreate when file path changes

  // Encapsulate content loading logic for reuse
  const loadContent = useCallback(async (filePath: string) => {
    if (!editor) return;
    setIsLoading(true);
    setError(null);
    setExternalChangeDetected(false); // Reset external change flag on load
    editor.setEditable(false);
    try {
      console.log(`Loading existing file content for: ${filePath}`);
      const data = await getFileContent(filePath);
      if (data) {
        editor.commands.setContent(data.content);
        onContentLoaded(data.sha);
        editor.setEditable(true);
      } else {
        setError(`File not found on GitHub: ${filePath}`);
        editor.commands.clearContent();
      }
    } catch (err: any) {
      console.error("Failed to load file content from GitHub:", err);
      setError(err.message || "Could not load file content.");
      editor.commands.clearContent();
    } finally {
      setIsLoading(false);
    }
  }, [editor, onContentLoaded]);

  // Effect to load content OR handle new file
  useEffect(() => {
    if (!editor) return;

    // Clear editor and stop if no file is selected
    if (!selectedFilePath) {
      editor?.commands.clearContent();
      editor?.setEditable(false);
      setIsLoading(false);
      setError(null);
      return;
    }

    // --- Handle New File Case --- 
    if (isNewFile) {
        console.log(`Handling new file creation for: ${selectedFilePath}`);
        setIsLoading(false);
        setError(null);
        editor?.commands.clearContent();
        editor?.setEditable(true);
        // Initialize IndexedDB entry
        idbSet(selectedFilePath, '')
            .then(() => console.log(`Initialized IndexedDB for new file: ${selectedFilePath}`))
            .catch((err) => console.error(`Failed to initialize IndexedDB for ${selectedFilePath}:`, err));
        return; // Skip fetching from GitHub
    }
    // --- End New File Case --- 

    // --- Existing File Loading Logic --- 
    // Use the encapsulated loadContent function
    loadContent(selectedFilePath);

  }, [selectedFilePath, editor, onContentLoaded, isNewFile, loadContent]); // Add loadContent dependency

  // Effect for proactive SHA check on window focus
  useEffect(() => {
    const handleFocus = async () => {
        if (!selectedFilePath || isNewFile || !editor || isCheckingSha || !currentFileSha) {
             // Don't check if no file, new file, no editor, already checking, or no initial SHA loaded
            return; 
        }

        console.log('Window focused, checking for external changes...');
        setIsCheckingSha(true);
        try {
            const result = await getLatestFileSha(selectedFilePath);
            if (result.sha && result.sha !== currentFileSha) {
                console.warn(`External change detected! Local SHA: ${currentFileSha}, Remote SHA: ${result.sha}`);
                setExternalChangeDetected(true);
            } else if (result.error) {
                console.error('Error checking latest SHA:', result.error);
                 // Optionally show a subtle error to the user?
            }
        } catch (err) {
            console.error('Unexpected error during SHA check:', err);
        } finally {
            setIsCheckingSha(false);
        }
    };

    window.addEventListener('focus', handleFocus);

    // Cleanup listener on component unmount or when dependencies change
    return () => {
        window.removeEventListener('focus', handleFocus);
    };
  }, [selectedFilePath, currentFileSha, isNewFile, editor, isCheckingSha]); // Dependencies for the focus check

  // Handler to manually refresh content
  const handleRefreshContent = () => {
    if (selectedFilePath) {
      loadContent(selectedFilePath);
    }
  };

  // Handler to open the commit message modal
  const handleRequestSave = () => {
    if (!editor || !selectedFilePath || !repoFullName) {
      console.error("Missing editor, file path, or repo name for save.");
      toast.error("Cannot save: Missing required information.");
      return;
    }
     // Get latest content from editor immediately, don't wait for debounce
    const currentContent = editor.getHTML(); 
    console.log("Requesting save. Current content:", currentContent); // Log content being considered for save
    // Ensure latest content is saved to IndexedDB before opening modal
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

  // Handler for confirming save from the modal
  const handleConfirmSave = async (commitMessage: string) => {
    if (!editor || !selectedFilePath || !repoFullName) {
      console.error("Save confirmation failed: Missing editor, path, or repo name.");
      toast.error("Save failed: Missing required information.");
      return;
    }
    setIsSaving(true);
    const toastId = toast.loading(`Saving draft: ${selectedFilePath}`);
    try {
      // Retrieve the latest content from IndexedDB
      const contentToSave = await idbGet(selectedFilePath);
      if (contentToSave === undefined) {
        throw new Error("Could not retrieve content from local storage for saving.");
      }
      
      console.log(`Saving draft for ${selectedFilePath} with SHA ${currentFileSha || 'null (new file)'}`);
      console.log("Content being saved:", contentToSave); // Log content being sent

      // Call the server action
      const result = await saveDraft(
          selectedFilePath, 
          contentToSave, 
          isNewFile ? undefined : currentFileSha || undefined, // Pass sha as 3rd arg
          commitMessage // Pass commitMessage as 4th arg
      );

      // Check the result of the save operation
      if (result.success) {
          // Update SHA if successful and a new SHA was returned
          if (result.sha) {
              onContentLoaded(result.sha); // Update parent state with new SHA
          }
          toast.success(`Draft saved successfully: ${selectedFilePath}`, { id: toastId });
          setIsCommitModalOpen(false); // Close modal on success
      } else {
          // Handle specific errors reported by the server action
          if (result.isConflict) {
             toast.error('Save Conflict: File changed on server. Please copy changes, refresh, and re-apply.', { id: toastId, duration: 10000 });
          } else {
             // Use error message from result if available, otherwise generic
             toast.error(`Error saving draft: ${result.error || 'Unknown server error'}`, { id: toastId });
          }
          // Keep modal open on error
      }

    } catch (err: any) { 
        // Catch unexpected errors during the process (e.g., network issues before server action completes)
        console.error("Failed to save draft (catch block):", err);
        toast.error(`Error saving draft: ${err.message || 'An unexpected error occurred'}`, { id: toastId });
        // Keep modal open on unexpected errors
    } finally {
        // Reset saving state regardless of outcome
        setIsSaving(false);
    }
  };

  // Render logic based on state
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
  } else if (!selectedFilePath) {
    contentArea = (
      <div className="flex-grow flex items-center justify-center text-muted-foreground">
        <p>Select a file from the tree or create a new one.</p>
      </div>
    );
  } else {
    // Render editor content only when not loading, no error, and a file is selected
    contentArea = <EditorContent editor={editor} className="flex-grow overflow-y-auto"/>;
  }

  return (
    // Ensure the outer div takes full height and uses flex column
    <div className="w-full h-full flex flex-col">
      {/* External Change Alert */}  
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

      {/* Pass onRequestSave and selectedFilePath to Toolbar */} 
      {editor && editor.isEditable && repoFullName && !externalChangeDetected && (
        <Toolbar 
          editor={editor} 
          onRequestSave={handleRequestSave} 
          selectedFilePath={selectedFilePath}
        />
      )}
      {/* Render the appropriate content area */} 
      {contentArea}
      {/* Render the commit modal */} 
      {selectedFilePath && repoFullName && (
         <CommitMessageModal
           open={isCommitModalOpen}
           onOpenChange={setIsCommitModalOpen} // Use onOpenChange
           onConfirmCommit={handleConfirmSave} // Correct prop name
           fileName={selectedFilePath || 'New File'} // Correct prop name
           // isLoading prop is removed as modal handles internal state
         />
      )}
    </div>
  );
}
