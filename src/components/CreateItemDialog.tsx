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

interface CreateItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemType: 'file' | 'folder' | null;
  targetDirectory: string;
  onCreateConfirm: (itemName: string) => Promise<void>; // Make async to handle loading state
}

export default function CreateItemDialog({ 
  open, 
  onOpenChange, 
  itemType, 
  targetDirectory, 
  onCreateConfirm 
}: CreateItemDialogProps) {
  const [itemName, setItemName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Reset name when dialog opens or item type changes
  useEffect(() => {
    if (open) {
      setItemName('');
      setIsCreating(false);
    }
  }, [open, itemType]);

  const handleSubmit = async () => {
    if (!itemName.trim() || !itemType) return;
    setIsCreating(true);
    try {
      await onCreateConfirm(itemName.trim());
      // Success is handled by the parent (closing dialog, showing toast)
    } catch (error: unknown) {
      // Let the parent handler display the toast/error
      // Log here for debugging in case parent doesn't handle or log
      console.error(`Error creating ${itemType} '${itemName.trim()}':`, error);
    } finally {
      setIsCreating(false);
    }
  };

  const title = `Create New ${itemType === 'folder' ? 'Folder' : 'File'}`;
  const description = `Enter the name for the new ${itemType}. It will be created in '${targetDirectory || '/'}'.`;
  const placeholder = itemType === 'folder' ? 'MyFolder' : 'new-file.md';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="create-item-name" className="text-right">
              Name
            </Label>
            <Input 
              id="create-item-name" 
              value={itemName} 
              onChange={(e) => setItemName(e.target.value)}
              className="col-span-3" 
              placeholder={placeholder}
              disabled={isCreating}
              onKeyDown={(e) => { if (e.key === 'Enter' && itemName.trim()) handleSubmit(); }}
            />
          </div>
        </div>
        <DialogFooter>
           <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isCreating}>Cancel</Button>
            </DialogClose>
          <Button 
            type="submit" 
            onClick={handleSubmit} 
            disabled={isCreating || !itemName.trim()}
          >
            {isCreating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
} 