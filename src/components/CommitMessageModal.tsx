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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2 } from 'lucide-react';
// Remove unused imports
// import { useToast } from '@/components/ui/use-toast';
// import { usePostHog } from 'posthog-js/react';

interface CommitMessageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmCommit: (message: string) => Promise<void>; // Async to handle loading
  fileName?: string; // To display in the dialog
  initialMessage?: string; // Optional pre-filled message
  title?: string; // Optional custom title
  isLoading?: boolean; // Optional loading state
  stagedFilePaths?: string[]; // Optional list of staged files for display
  isFetchingMessage?: boolean; // Add prop for message fetching state
  // Remove unused props
  // repoName: string;
  // owner: string;
  // commitSha: string;
}

export default function CommitMessageModal({ 
  open, 
  onOpenChange, 
  onConfirmCommit,
  fileName = 'changes', // Default if not provided
  initialMessage = '',
  title = 'Save Draft', // Default title
  isLoading = false,
  stagedFilePaths = [], // Default to empty array
  isFetchingMessage = false, // Default to false
  // Remove unused props from destructuring
  // repoName,
  // owner,
  // commitSha
}: CommitMessageModalProps) {
  const [commitMessage, setCommitMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(isLoading);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog opens or isLoading changes
  useEffect(() => {
    setIsCommitting(isLoading); // Sync internal state with prop
    if (open) {
      if (!isFetchingMessage) {
        setCommitMessage(initialMessage || `Update ${fileName}`);
      }
      setError(null);
    }
  }, [open, initialMessage, fileName, isFetchingMessage, isLoading]); // Add isLoading dependency

  // Update message when fetching completes (prop changes)
  useEffect(() => {
    if (open && !isFetchingMessage) {
      setCommitMessage(initialMessage || `Update ${fileName}`);
    }
  }, [initialMessage, isFetchingMessage, open, fileName]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (commitMessage.trim()) {
      handleConfirm();
    }
  };

  const handleConfirm = async () => {
    const trimmedMessage = commitMessage.trim();
    if (!trimmedMessage) {
      setError("Commit message cannot be empty.");
      return;
    }
    
    setIsCommitting(true); // Set internal state immediately
    setError(null);
    try {
      await onConfirmCommit(trimmedMessage);
    } catch (err: unknown) {
      console.error("Commit failed:", err);
      setError(err instanceof Error ? err.message : "Failed to save changes.");
      // Keep dialog open on error, set loading false
      setIsCommitting(false); 
    }
    // Do NOT set isCommitting false here on success, parent will close modal which resets state via useEffect
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
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Enter a commit message describing the changes. {fileName && `(File: ${fileName})`}
          </DialogDescription>
        </DialogHeader>
        {stagedFilePaths.length > 0 && (
          <div className="mt-4">
            <h4 className="text-sm font-medium mb-1 text-muted-foreground">Files being committed:</h4>
            <ul className="max-h-24 overflow-y-auto text-xs bg-muted rounded p-2 space-y-1">
              {stagedFilePaths.map(path => (
                <li key={path} className="font-mono truncate">{path}</li>
              ))}
            </ul>
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid w-full items-center gap-1.5">
              <Label htmlFor="commit-message">Commit Message</Label>
              <div className="relative">
                <Textarea 
                  id="commit-message" 
                  placeholder={isFetchingMessage ? "Generating commit message..." : "Enter your commit message..."}
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  rows={3}
                  className="min-h-[80px]"
                  aria-label="Commit message"
                  disabled={isCommitting || isFetchingMessage}
                />
                {isFetchingMessage && (
                  <div className="absolute inset-0 flex items-center justify-center bg-background/50">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                )}
              </div>
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
              disabled={isFetchingMessage || isCommitting || !commitMessage.trim()}
            >
              {isCommitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
} 