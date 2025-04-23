'use client';

import React from 'react';
import { type Editor } from '@tiptap/react';
import { Toggle } from "@/components/ui/toggle";
import { Bold, Italic } from 'lucide-react';

interface ToolbarProps {
  editor: Editor | null;
}

export default function Toolbar({ editor }: ToolbarProps) {
  if (!editor) {
    return null; // Or return a disabled toolbar state
  }

  return (
    <div className="border rounded-md p-1 flex space-x-1 mb-2 bg-background">
      <Toggle
        size="sm"
        pressed={editor.isActive('bold')}
        onPressedChange={() => editor.chain().focus().toggleBold().run()}
        aria-label="Toggle bold"
      >
        <Bold className="h-4 w-4" />
      </Toggle>
      <Toggle
        size="sm"
        pressed={editor.isActive('italic')}
        onPressedChange={() => editor.chain().focus().toggleItalic().run()}
        aria-label="Toggle italic"
      >
        <Italic className="h-4 w-4" />
      </Toggle>
      {/* Add more toolbar buttons here later (Heading, List, etc.) */}
    </div>
  );
} 