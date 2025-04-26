'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { RequestError } from '@octokit/request-error';
import { getOctokitAndRepo } from './helpers'; // Import the helper

// Define structure for file tree items (copied from original file)
export interface FileTreeItem {
  type: 'file' | 'dir';
  name: string;
  path: string;
  sha?: string; // SHA is needed for file operations later
}

/**
 * Fetches the contents of a directory in the user's connected repository.
 */
export async function getFileTree(path: string = ''): Promise<FileTreeItem[]> {
  noStore();
  console.log(`getFileTree called for path: \"${path}\"`);

  try {
    // Get Octokit instance and repo details using the helper
    const { octokit, owner, repo } = await getOctokitAndRepo();

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
    const contents: unknown[] = Array.isArray(data) ? data : [data];

    // Process and return tree data in our desired format
    const treeItems: FileTreeItem[] = contents.map((item: unknown): FileTreeItem | null => {
      // Type predicate to check the item structure
      function isPotentialFileTreeItem(obj: unknown): obj is { type: string; name: string; path: string; sha?: string } {
        return (
          typeof obj === 'object' &&
          obj !== null &&
          'type' in obj && typeof obj.type === 'string' &&
          'name' in obj && typeof obj.name === 'string' &&
          'path' in obj && typeof obj.path === 'string' &&
          (!('sha' in obj) || typeof obj.sha === 'string') // sha is optional or string
        );
      }

      if(isPotentialFileTreeItem(item)) {
        const itemType = item.type === 'dir' ? 'dir' : 'file';
        return {
          type: itemType,
          name: String(item.name),
          path: String(item.path),
          sha: item.sha ? String(item.sha) : undefined,
        }
      } else {
        console.warn("Skipping invalid item in getFileTree response:", item);
        return null; // Or throw an error
      }
    }).filter((item): item is FileTreeItem => item !== null); // Filter out nulls

    // Sort items: folders first, then files, alphabetically
    treeItems.sort((a, b) => {
      if (a.type === 'dir' && b.type !== 'dir') return -1;
      if (a.type !== 'dir' && b.type === 'dir') return 1;
      return a.name.localeCompare(b.name);
    });

    console.log(`getFileTree successfully fetched ${treeItems.length} items for path: \"${path}\"`);
    return treeItems;

  } catch (error: unknown) {
    // Handle specific Octokit errors
    if (error instanceof RequestError) {
        console.error(`Octokit RequestError fetching path \"${path}\" (Status: ${error.status}):`, error.message);
        if (error.status === 404) {
            // Path not found - could be an empty directory or invalid path
            // GitHub API returns 404 for empty directories via Get Contents API
            console.log(`Path \"${path}\" not found or directory is empty.`);
            return []; // Return empty array for 404, often means empty dir
        }
         // Re-throw other specific Octokit errors if needed, or a generic one
         throw new Error(`GitHub API error (${error.status}): Could not load directory content for \"${path}\".`);
    } else if (error instanceof Error && error.message.startsWith('GitHub connection error:')) {
        // Handle connection errors from the helper
        console.error("Connection error in getFileTree:", error.message);
        throw error; // Re-throw the specific connection error
    } else {
        // Handle other generic errors
        console.error(`Generic error fetching file tree for path \"${path}\":`, error);
        // Use unknown for generic catch
        const message = error instanceof Error ? error.message : 'Could not load directory content.';
        throw new Error(message);
    }
  }
}
