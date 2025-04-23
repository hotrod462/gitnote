'use client';

import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Toolbar from './Toolbar'; // Import the toolbar

// TODO: Add props later for selected file path, content, SHA, etc.
export default function Editor() {
  const editor = useEditor({
    extensions: [
      StarterKit, // Includes Bold, Italic, Paragraph, etc.
      // TODO: Add other extensions later if needed (e.g., Link, Table, TaskList)
    ],
    content: '', // Initial content (will be loaded from file later)
    // Basic editor appearance
    editorProps: {
      attributes: {
        class: 'prose dark:prose-invert prose-sm sm:prose-base lg:prose-lg xl:prose-2xl m-5 focus:outline-none min-h-[300px] border rounded p-4',
      },
    },
  });

  // TODO: Add logic here later to display "Select or create a note" 
  // based on whether a file path prop is provided.
  // For now, just render the editor.

  return (
    <div className="w-full h-full flex flex-col p-4">
      <Toolbar editor={editor} />
      <EditorContent editor={editor} className="flex-grow overflow-y-auto"/>
    </div>
  );
}
