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

interface CommitMessageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmCommit: (message: string) => Promise<void>; // Async to handle loading
  fileName: string; // To display in the dialog
}

export default function CommitMessageModal({ 
  open, 
  onOpenChange, 
  onConfirmCommit,
  fileName
}: CommitMessageModalProps) {
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      // Default commit message
      setCommitMessage(`Update ${fileName}`); 
      setIsCommitting(false);
      setError(null);
    }
  }, [open, fileName]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (commitMessage.trim()) {
      handleConfirm();
    }
  };

  const handleConfirm = async () => {
    const trimmedMessage = commitMessage.trim();
    if (!trimmedMessage) return;
    
    setIsCommitting(true);
    setError(null);
    try {
      await onConfirmCommit(trimmedMessage);
      // Success handled by parent (closes dialog, shows toast)
      // onOpenChange(false); // Let parent handle closing on success
    } catch (err: unknown) {
      console.error("Commit failed:", err);
      // Check if err is an Error instance before accessing message
      setError(err instanceof Error ? err.message : "Failed to save changes.");
      // Keep dialog open on error
    } finally {
      // Only set loading false if dialog is still open (error occurred)
      if (open && error === null) { 
           // If it succeeded the parent should have closed it.
      } else {
          setIsCommitting(false); 
      }
    }
  };
  
  // Handle closing the dialog (e.g., clicking X or Cancel)
  const handleClose = (isOpen: boolean) => {
      if (!isOpen) {
           setError(null); // Clear error when closing manually
      }
      onOpenChange(isOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Save Draft</DialogTitle>
          <DialogDescription>
Enter a brief description of the changes you made (commit message).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="commit-message">Commit Message</Label>
              <Input 
                id="commit-message" 
                value={commitMessage} 
                onChange={(e) => setCommitMessage(e.target.value)}
                placeholder="e.g., Update introduction section"
                disabled={isCommitting}
              />
            </div>
             {error && (
                <p className="text-sm text-destructive">Error: {error}</p>
             )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={isCommitting}>Cancel</Button>
            </DialogClose>
            <Button 
              type="submit" 
              disabled={isCommitting || !commitMessage.trim()}
            >
              {isCommitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 