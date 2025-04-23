'use server'

import { getUserOctokit } from "@/lib/github";
import { unstable_noStore as noStore } from 'next/cache';
import { checkUserConnectionStatus } from './githubConnections'; // Import to get repo name
import { RequestError } from '@octokit/request-error'; // Import Octokit error type

// Define structure for file tree items
export interface FileTreeItem {
  type: 'file' | 'dir';
  name: string;
  path: string;
  sha?: string; // SHA is needed for file operations later
}

/**
 * Placeholder for actions interacting with the GitHub repository 
 * using the user's installation token.
 */

/**
 * Fetches the contents of a directory in the user's connected repository.
 */
export async function getFileTree(path: string = ''): Promise<FileTreeItem[]> {
  noStore();
  console.log(`getFileTree called for path: "${path}"`);

  let octokit;
  let repoFullName: string;

  try {
    // Get Octokit instance authenticated for the user's installation
    octokit = await getUserOctokit();

    // Get the connected repository name
    const connection = await checkUserConnectionStatus();
    if (connection.status !== 'CONNECTED') {
      throw new Error('User is not fully connected.');
    }
    repoFullName = connection.repoFullName;

  } catch (authError: any) {
    console.error("Authentication or connection error in getFileTree:", authError);
    // Re-throw auth-related errors to be handled by the component
    throw authError;
  }

  const [owner, repo] = repoFullName.split('/');
   
  try {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path,
      // Add cache-busting header? Maybe not needed due to noStore()
      // headers: {
      //   'If-None-Match': '' 
      // }
    });

    // Ensure data is an array (it can be a single object for files)
    const contents = Array.isArray(data) ? data : [data];

    // Process and return tree data in our desired format
    const treeItems: FileTreeItem[] = contents.map((item: any) => ({
      type: item.type, // 'file' or 'dir'
      name: item.name,
      path: item.path,
      sha: item.sha, // Include SHA
    }));

    // Sort items: folders first, then files, alphabetically
    treeItems.sort((a, b) => {
      if (a.type === 'dir' && b.type !== 'dir') return -1;
      if (a.type !== 'dir' && b.type === 'dir') return 1;
      return a.name.localeCompare(b.name);
    });

    console.log(`getFileTree successfully fetched ${treeItems.length} items for path: "${path}"`);
    return treeItems; 

  } catch (error: unknown) {
    // Handle specific Octokit errors
    if (error instanceof RequestError) {
        console.error(`Octokit RequestError fetching path "${path}" (Status: ${error.status}):`, error.message);
        if (error.status === 404) {
            // Path not found - could be an empty directory or invalid path
            // GitHub API returns 404 for empty directories via Get Contents API
            console.log(`Path "${path}" not found or directory is empty.`);
            return []; // Return empty array for 404, often means empty dir
        }
         // Re-throw other specific Octokit errors if needed, or a generic one
         throw new Error(`GitHub API error (${error.status}): Could not load directory content for "${path}".`);
    } else {
        // Handle generic errors
        console.error(`Generic error fetching file tree for path "${path}":`, error);
        throw new Error(`Could not load directory content.`);
    }
  }
}

// Other action placeholders (getFileContent, createOrUpdateFile, etc.) will go here... 