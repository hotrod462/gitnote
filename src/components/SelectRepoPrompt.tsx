'use client'

import React, { useState, useEffect, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { getInstallationRepositories, saveRepositorySelection } from '@/lib/actions/githubConnections';
import { Skeleton } from "@/components/ui/skeleton"
import { useRouter } from 'next/navigation';

interface SelectRepoPromptProps {
  installationId: number;
}

interface Repository {
  id: number;
  full_name: string;
}

export default function SelectRepoPrompt({ installationId }: SelectRepoPromptProps) {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    async function fetchRepos() {
      setIsLoading(true);
      setError(null);
      try {
        const repos = await getInstallationRepositories(installationId);
        setRepositories(repos);
      } catch (err: any) {
        console.error("Failed to fetch repositories:", err);
        setError(err.message || "Failed to load repositories. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    }
    fetchRepos();
  }, [installationId]);

  const handleConfirm = async () => {
    if (!selectedRepo) return;

    startTransition(async () => {
      setError(null);
      const result = await saveRepositorySelection(installationId, selectedRepo);
      if (result.error) {
        console.error("Failed to save repository:", result.error);
        setError(result.error);
      } else {
        console.log("Repository selection saved successfully.");
      }
    });
  };

  return (
    <div className="text-left w-full">
      <h2 className="text-xl font-semibold mb-3 text-center">Select Repository</h2>
      <p className="mb-4 text-muted-foreground text-center">
        Choose the repository you want GitNote to use.
      </p>
      
      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="h-4 w-[250px]" />
          <Skeleton className="h-4 w-[200px]" />
          <Skeleton className="h-4 w-[220px]" />
        </div>
      )}

      {error && (
        <p className="text-destructive text-center">Error: {error}</p>
      )}

      {!isLoading && !error && repositories.length === 0 && (
         <p className="text-muted-foreground text-center">No repositories found for this installation. Please ensure you granted access during installation.</p>
      )}

      {!isLoading && !error && repositories.length > 0 && (
        <RadioGroup 
          value={selectedRepo}
          onValueChange={setSelectedRepo}
          className="mb-4 space-y-2 max-h-60 overflow-y-auto p-1"
        >
          {repositories.map((repo) => (
            <div key={repo.id} className="flex items-center space-x-2 p-2 border rounded hover:bg-muted">
              <RadioGroupItem value={repo.full_name} id={`repo-${repo.id}`} />
              <Label htmlFor={`repo-${repo.id}`} className="cursor-pointer flex-grow">
                {repo.full_name}
              </Label>
            </div>
          ))}
        </RadioGroup>
      )}

      {error && isSaving && (
         <p className="text-destructive text-center mt-2">Error saving: {error}</p>
       )}

      <div className="text-center mt-4"> 
        <Button 
          onClick={handleConfirm} 
          disabled={!selectedRepo || isLoading || isSaving}
        >
          {isSaving ? "Saving..." : "Confirm Repository"}
        </Button>
      </div>

    </div>
  );
} 