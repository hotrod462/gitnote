'use client'

import React, { useRef } from 'react';
import { Button } from "@/components/ui/button";
import { Upload } from 'lucide-react';

interface FileUploadButtonProps {
  onFileDrop: (files: File[], targetFolder: string) => void;
  getTargetDirectory: () => string;
}

export default function FileUploadButton({ onFileDrop, getTargetDirectory }: FileUploadButtonProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handler for clicking the Upload button
  const handleRequestUpload = () => {
    // We get the target directory *just before* opening the dialog
    fileInputRef.current?.click(); // Trigger hidden file input
  };

  // Handler for when files are selected via the input
  const handleFileSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      // Convert FileList to Array<File>
      const fileArray = Array.from(files);
      const targetDir = getTargetDirectory(); // Get the target directory now
      onFileDrop(fileArray, targetDir);
    }
    // Reset the input value so the same file can be selected again
    if (event.target) {
      event.target.value = '';
    }
  };

  return (
    <>
      <Button variant="ghost" size="icon" onClick={handleRequestUpload} title="Upload File(s)">
        <Upload className="h-4 w-4" />
      </Button>
      {/* Hidden File Input */}
      <input 
        type="file" 
        multiple 
        ref={fileInputRef} 
        onChange={handleFileSelected} 
        style={{ display: 'none' }} 
      />
    </>
  );
} 