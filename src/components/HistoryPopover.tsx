'use client';

import React, { useState, useEffect } from 'react';
import { 
  Popover, 
  PopoverContent, 
  PopoverTrigger 
} from "@/components/ui/popover";
import { Button } from '@/components/ui/button';
import { Clock, Loader2, AlertTriangle } from 'lucide-react';
import { getCommitsForFile, CommitInfo } from '@/lib/actions/githubApi';
import { formatDistanceToNow } from 'date-fns'; 
import Link from 'next/link';

interface HistoryPopoverProps {
  filePath: string;
  onSelectCommit: (sha: string) => void;
}

// Helper function to fetch history with specific types
async function fetchHistory(
    filePath: string, 
    setIsLoading: React.Dispatch<React.SetStateAction<boolean>>, 
    setError: React.Dispatch<React.SetStateAction<string | null>>, 
    setCommits: React.Dispatch<React.SetStateAction<CommitInfo[]>>
) {
    console.log(`HistoryPopover fetching history for: ${filePath}`);
    setIsLoading(true);
    setError(null);
    setCommits([]); // Clear previous commits
    try {
      const result = await getCommitsForFile(filePath);
      if (result.error) {
        setError(result.error);
      } else {
        setCommits(result.commits);
      }
    } catch (err: unknown) {
       console.error(`Failed to fetch commits for ${filePath}:`, err);
       setError(err instanceof Error ? err.message : 'Could not load history');
    } finally {
      setIsLoading(false);
    }
}

// Helper function to format commit message (keep locally)
const formatCommitMessage = (message: string): string => {
    const firstLine = message.split('\n')[0];
    return firstLine.length > 60 ? firstLine.substring(0, 57) + '...' : firstLine;
};

// Helper function to format date (keep locally)
const formatDate = (dateString?: string): string => {
    if (!dateString) return 'Unknown date';
    try {
        return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
        return 'Invalid date';
    }
};

export default function HistoryPopover({ filePath, onSelectCommit }: HistoryPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [commits, setCommits] = useState<CommitInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && filePath) {
      fetchHistory(filePath, setIsLoading, setError, setCommits);
    }
  }, [isOpen, filePath]);

  // Handler for selecting a commit
  const handleCommitSelect = (sha: string) => {
      onSelectCommit(sha);
      setIsOpen(false); // Close popover after selection
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Clock className="h-4 w-4 mr-2" />
          History
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 max-h-96 overflow-y-auto">
        <div className="flex flex-col">
          <div className="space-y-1 sticky top-0 bg-popover px-4 py-2 z-10 border-b">
            <h4 className="font-medium leading-none">File History</h4>
            <p className="text-sm text-muted-foreground truncate">
              {filePath}
            </p>
          </div>
          
          <div className="px-4 pt-4 pb-4 flex-grow">
            {isLoading && (
              <div className="flex items-center justify-center p-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}

            {error && (
              <div className="flex items-center text-destructive text-sm p-2">
                <AlertTriangle className="h-4 w-4 mr-2 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {!isLoading && !error && commits.length === 0 && (
              <div className="text-sm text-muted-foreground p-2">
                No history found for this file.
              </div>
            )}

            {!isLoading && !error && commits.length > 0 && (
              <ul className="space-y-3">
                {commits.map((commit) => (
                  <li key={commit.sha} className="text-sm space-y-1">
                    <div className="font-medium truncate" title={commit.message}> 
                      {formatCommitMessage(commit.message)}
                    </div>
                    <div className="text-xs text-muted-foreground flex justify-between items-center">
                      <span>{commit.author?.name || 'Unknown author'}</span>
                      <span title={commit.author?.date ? new Date(commit.author.date).toLocaleString() : 'Unknown date'}> 
                        {formatDate(commit.author?.date)}
                      </span>
                    </div>
                    <Link href={commit.html_url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">
                        View on GitHub ({commit.sha.substring(0, 7)})
                    </Link>
                    <Button 
                      variant="ghost" 
                      size="sm"
                      className="text-left justify-start p-1 h-auto mt-1 text-blue-600 hover:bg-blue-50"
                      onClick={() => handleCommitSelect(commit.sha)}
                    >
                      View content at this version
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}