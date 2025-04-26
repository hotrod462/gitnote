'use client'

import React, { useState, useEffect, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { getInstallationRepositories, saveRepositorySelection, type Repository } from '@/lib/actions/githubConnections';
import { Skeleton } from "@/components/ui/skeleton"
import { AlertDialogHeader, AlertDialogTitle, AlertDialogDescription } from "@/components/ui/alert-dialog"

interface SelectRepoPromptProps {
  installationId: number;
  onSuccess: () => void;
}

export default function SelectRepoPrompt({ installationId, onSuccess }: SelectRepoPromptProps) {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [selectedRepo, setSelectedRepo] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startTransition] = useTransition();

  useEffect(() => {
    async function fetchRepos() {
      setIsLoading(true);
      setError(null);
      try {
        const repos = await getInstallationRepositories(installationId);
        setRepositories(repos);
      } catch (err: unknown) {
        console.error("Failed to fetch repositories:", err);
        setError(err instanceof Error ? err.message : "Could not load repositories.");
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
        onSuccess();
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <h2 className="text-xl font-semibold mb-4">Select Repository</h2>
        <p className="mb-6 text-muted-foreground">Loading available repositories...</p>
        <div className="space-y-4 w-full max-w-md">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-32 self-center mt-4" />
        </div>
      </div>
    );
  }

  if (error && !isSaving) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-red-600">
        <h2 className="text-xl font-semibold mb-4">Error Loading Repositories</h2>
        <p className="mb-4 text-center">{error}</p>
        <p className="text-sm text-muted-foreground">Please check your GitHub connection and try again.</p>
      </div>
    );
  }

  if (repositories.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8">
        <h2 className="text-xl font-semibold mb-4">No Accessible Repositories Found</h2>
        <p className="mb-6 text-muted-foreground text-center">
          The GitSync GitHub App installation doesn&apos;t have access to any repositories,
          or you haven&apos;t granted it access yet. Please configure its repository access
          on GitHub.
        </p>
        <Button onClick={() => window.location.reload()}>Refresh Page</Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-full p-8">
      <h2 className="text-xl font-semibold mb-4">Select Repository</h2>
      <p className="mb-6 text-muted-foreground">
        Choose the repository you want to use for storing your notes:
      </p>
      <RadioGroup
        value={selectedRepo}
        onValueChange={setSelectedRepo}
        className="mb-6 space-y-2 w-full max-w-md"
        aria-label="Repositories"
      >
        {repositories.map((repo) => (
          <div key={repo.id} className="flex items-center space-x-2 border p-3 rounded-md">
            <RadioGroupItem value={repo.full_name} id={`repo-${repo.id}`} />
            <Label htmlFor={`repo-${repo.id}`} className="flex-grow cursor-pointer">
              {repo.full_name}
            </Label>
          </div>
        ))}
      </RadioGroup>

      {error && isSaving && (
          <p className="text-red-600 mb-4">Error saving: {error}</p>
      )}

      <Button
        onClick={handleConfirm}
        disabled={!selectedRepo || isSaving}
        size="lg"
      >
        {isSaving ? 'Confirming...' : 'Confirm Repository'}
      </Button>
    </div>
  );
} 