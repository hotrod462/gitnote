'use client'

import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter, 
  DialogClose
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from 'lucide-react';
import type { FileTreeItem } from '@/lib/actions/githubApi'; // Import type

interface RenameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemToRename: FileTreeItem | null;
  onRenameConfirm: (newName: string) => Promise<void>; // Make async
}

export default function RenameDialog({ 
  open, 
  onOpenChange, 
  itemToRename, 
  onRenameConfirm 
}: RenameDialogProps) {
  const [newName, setNewName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Pre-fill name when dialog opens or item changes
  useEffect(() => {
    if (open && itemToRename) {
      setNewName(itemToRename.name);
      setIsRenaming(false);
    } else if (!open) {
        // Optionally clear name when closed if needed
        // setNewName(''); 
    }
  }, [open, itemToRename]);

  const handleSubmit = async () => {
    const trimmedNewName = newName.trim();
    if (!trimmedNewName || !itemToRename || trimmedNewName === itemToRename.name) {
        onOpenChange(false); // Close if name is invalid or unchanged
        return;
    }
    setIsRenaming(true);
    try {
      await onRenameConfirm(trimmedNewName);
      // Success implicitly handled by parent (dialog closes, toast shown)
    } catch (error: unknown) {
      // Error is handled by parent
      console.error(`Error renaming item '${itemToRename?.name}' to '${trimmedNewName}':`, error); // Log error
    } finally {
       // Only set isRenaming false if dialog is still potentially open (i.e., an error occurred)
       // This prevents flicker if parent closes dialog immediately on success
       const stillOpen = open; // Capture current open state before potential parent change
       if (stillOpen) { 
           setIsRenaming(false); 
       }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Rename {itemToRename?.type === 'dir' ? 'Folder' : 'File'}</DialogTitle>
          <DialogDescription>
            Enter a new name for the {itemToRename?.type === 'dir' ? 'folder' : 'file'} &quot;{itemToRename?.name}&quot;.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="rename-name" className="text-right">
              New Name
            </Label>
            <Input 
              id="rename-name" 
              value={newName} 
              onChange={(e) => setNewName(e.target.value)}
              className="col-span-3" 
              placeholder={itemToRename?.type === 'dir' ? 'MyRenamedFolder' : 'my-renamed-note.md'}
              disabled={isRenaming}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
            />
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline" disabled={isRenaming}>Cancel</Button>
          </DialogClose>
          <Button 
            type="submit" 
            onClick={handleSubmit} 
            disabled={isRenaming || !newName.trim() || newName.trim() === itemToRename?.name}
          >
            {isRenaming ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Rename
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 