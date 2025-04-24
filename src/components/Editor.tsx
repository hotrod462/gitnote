'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Toolbar from './Toolbar'; // Import the toolbar
import { getFileContent } from '@/lib/actions/githubApi'; // Import the action
import { Skeleton } from '@/components/ui/skeleton'; // For loading state
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"; // Correct the import path
import { Terminal } from 'lucide-react';
import { set as idbSet, get as idbGet } from 'idb-keyval'; // Import idb-keyval functions
import debounce from 'lodash.debounce'; // Import debounce

// Define props interface
interface EditorProps {
  selectedFilePath: string | null;
  currentFileSha: string | null; // Keep track of the SHA for saving later
  onContentLoaded: (sha: string) => void; // Callback when content loads
  // Add isNew flag (will be passed from NotesPage later)
  isNewFile?: boolean; 
}

// Debounce time for autosave
const AUTOSAVE_DEBOUNCE_MS = 1000; // 1 second

// Accept props
export default function Editor({ selectedFilePath, currentFileSha, onContentLoaded, isNewFile }: EditorProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  // Effect to load content when selectedFilePath changes
  useEffect(() => {
    // Ensure editor instance exists before proceeding
    if (!editor) return;

    if (!selectedFilePath) {
      // Check editor before calling methods
      editor?.commands.clearContent();
      editor?.setEditable(false);
      setIsLoading(false);
      setError(null);
      return;
    }

    // TODO: Add logic here to check isNewFile flag

    // Load content for the selected file
    async function loadContent() {
      // Check editor instance again within async function scope
      if (!editor) return;

      setIsLoading(true);
      setError(null);
      editor.setEditable(false); // Disable editing while loading
      try {
        const data = await getFileContent(selectedFilePath!);
        if (data) {
          // Check editor before calling methods
          editor?.commands.setContent(data.content);
          onContentLoaded(data.sha); // Notify parent of the loaded SHA
          editor?.setEditable(true); // Enable editing after load
        } else {
          // Handle case where file wasn't found (returned null)
          setError(`File not found: ${selectedFilePath}`);
          // Check editor before calling methods
          editor?.commands.clearContent();
        }
      } catch (err: any) {
        console.error("Failed to load file content:", err);
        setError(err.message || "Could not load file content.");
        // Check editor before calling methods
        editor?.commands.clearContent();
      } finally {
        setIsLoading(false);
      }
    }

    loadContent();
    
    // Cleanup? Editor instance might handle this internally on destroy
    // return () => { editor?.destroy(); }; // Might be too aggressive

  }, [selectedFilePath, editor, onContentLoaded, isNewFile]); // Add isNewFile dependency

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
      {/* Render toolbar only if editor exists and is editable (i.e., file loaded) */} 
      {editor && editor.isEditable && <Toolbar editor={editor} />} 
      {/* Render the appropriate content area */} 
      {contentArea}
    </div>
  );
}
