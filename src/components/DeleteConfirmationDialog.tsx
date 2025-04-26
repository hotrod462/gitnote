'use client'

import React, { useState, useEffect } from 'react';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { Loader2 } from 'lucide-react';
import type { FileTreeItem } from '@/lib/actions/github/fileTree';

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemToDelete: FileTreeItem | null;
  deleteError: string | null;
  onConfirmDelete: () => Promise<void>; // Make async
  onClearError: () => void; // Callback to clear error state in parent
}

export default function DeleteConfirmationDialog({ 
  open, 
  onOpenChange, 
  itemToDelete, 
  deleteError,
  onConfirmDelete,
  onClearError
}: DeleteConfirmationDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  // Reset loading state when dialog opens
  useEffect(() => {
    if (open) {
      setIsDeleting(false);
      // Error is reset via onClearError when closing/cancelling
    }
  }, [open]);

  const handleConfirm = async () => {
    if (!itemToDelete) return;
    setIsDeleting(true);
    try {
      await onConfirmDelete();
      // Success implicitly handled by parent (dialog closes, toast shown)
    } catch (error: unknown) {
      // Error state is set by parent if onConfirmDelete throws/returns error
      // Dialog remains open due to parent state not changing `open` prop
      console.error("Error during delete confirmation:", error); // Log error for debugging
    } finally {
      // Only set isDeleting false if dialog is still potentially open (i.e., an error occurred)
      // If successful, parent will close the dialog via onOpenChange before this runs ideally
      if (open && !deleteError) {
           // If it succeeded the parent should have closed it. This prevents flicker.
      } else {
          setIsDeleting(false); // Set loading false on error or if dialog stays open
      }
    }
  };

  const handleCancelOrClose = () => {
      onClearError(); // Clear parent error state when cancelling/closing
      onOpenChange(false); // Explicitly close
  };

  const itemType = itemToDelete?.type === 'dir' ? 'folder' : 'file';

  return (
    <AlertDialog open={open} onOpenChange={handleCancelOrClose}> {/* Use custom handler */}
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            {deleteError && (
              <p className="text-destructive text-sm mb-2">Error: {deleteError}</p>
            )}
            This action cannot be undone. This will permanently delete the {itemType} 
            <span className="font-medium">{itemToDelete?.name}</span> from your repository.
            {itemToDelete?.type === 'dir' && (
              <span className="text-xs block mt-1"> (Only empty folders can be deleted)</span>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancelOrClose} disabled={isDeleting}>
            {deleteError ? 'Close' : 'Cancel'}
          </AlertDialogCancel>
          {!deleteError && (
            <AlertDialogAction 
              onClick={handleConfirm} 
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Delete
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
} 