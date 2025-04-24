'use client'

import React from 'react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function ConnectRepoPrompt() {
  // IMPORTANT: Replace with your actual GitHub App's URL slug name
  const gitHubAppName = process.env.NEXT_PUBLIC_GITHUB_APP_NAME || 'YOUR_APP_NAME_HERE'; 
  const installUrl = `https://github.com/apps/${gitHubAppName}/installations/new`;

  return (
    <div className="text-center">
      <h2 className="text-xl font-semibold mb-3">Connect to GitHub</h2>
      <p className="mb-2 text-muted-foreground">
        GitNote uses an existing GitHub repository to store and sync your notes.
      </p>
      <p className="mb-4 text-muted-foreground">
        <strong className="text-foreground">Please ensure you have a repository ready</strong> (you can create a new one on GitHub if needed) before proceeding.
      </p>
      <p className="mb-4 text-muted-foreground">
        Click below to install the GitNote GitHub App and grant it access to your chosen repository.
      </p>
      <Button asChild>
        {/* Use Next.js Link for client-side navigation to external URL */}
        <Link href={installUrl} target="_blank" rel="noopener noreferrer">
          Install & Authorize GitHub App
        </Link>
      </Button>
       <p className="mt-3 text-xs text-muted-foreground">
         You&apos;ll be redirected to GitHub to select repositories and complete the installation.
       </p>
    </div>
  );
} 