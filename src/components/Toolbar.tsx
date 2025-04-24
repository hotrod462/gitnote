'use client';

import React from 'react';
import { type Editor } from '@tiptap/react';
import { Toggle } from "@/components/ui/toggle";
import { Button } from "@/components/ui/button";
import { Bold, Italic, Save } from 'lucide-react';

interface ToolbarProps {
  editor: Editor | null;
  onRequestSave: () => void;
}

export default function Toolbar({ editor, onRequestSave }: ToolbarProps) {
  if (!editor) {
    return null; // Or return a disabled toolbar state
  }

  return (
    <div className="border rounded-t-md p-1 flex justify-between items-center bg-background">
      <div className="flex space-x-1">
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
      </div>

      <div>
        <Button 
          size="sm" 
          variant="outline" 
          onClick={onRequestSave}
        >
            <Save className="h-4 w-4 mr-2" />
            Save Draft
        </Button>
      </div>
    </div>
  );
} 