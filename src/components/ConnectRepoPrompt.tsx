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
      <h2 className="text-2xl font-semibold mb-4">Connect to GitHub</h2>
      <p className="text-muted-foreground mb-6 max-w-md text-center">
        GitSync uses an existing GitHub repository to store and sync your files.
        Drag and drop sync your files easily.
      </p>
      <p className="text-muted-foreground mb-8 max-w-md text-center">
        Click below to install the GitSync GitHub App and grant it access to your chosen repository.
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