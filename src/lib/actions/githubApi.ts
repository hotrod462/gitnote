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

/**
 * Fetches the content and SHA of a specific file from the user's repository.
 */
export async function getFileContent(filePath: string): Promise<{ content: string; sha: string } | null> {
  noStore();
  console.log(`getFileContent called for path: "${filePath}"`);
  
  let octokit;
  let repoFullName: string;

  try {
    octokit = await getUserOctokit();
    const connection = await checkUserConnectionStatus();
    if (connection.status !== 'CONNECTED') {
      throw new Error('User is not fully connected.');
    }
    repoFullName = connection.repoFullName;
  } catch (authError: any) {
    console.error("Auth/connection error in getFileContent:", authError);
    throw authError; // Re-throw to be handled by caller
  }

  const [owner, repo] = repoFullName.split('/');

  try {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path: filePath,
    });

    // Type guard to ensure we received file content data
    if (typeof data !== 'object' || data === null || Array.isArray(data) || !('content' in data) || !('sha' in data) || data.type !== 'file') {
       console.error('Invalid response when fetching file content for:', filePath, data);
       throw new Error(`Could not retrieve file content. Unexpected response format.`);
    }

    // Decode content from Base64
    const decodedContent = Buffer.from(data.content, 'base64').toString('utf8');
    
    console.log(`getFileContent successfully fetched SHA ${data.sha} for path: "${filePath}"`);
    return { content: decodedContent, sha: data.sha };

  } catch (error: unknown) {
     if (error instanceof RequestError) {
        console.error(`Octokit RequestError fetching file content "${filePath}" (Status: ${error.status}):`, error.message);
        if (error.status === 404) {
            // File not found
            console.log(`File "${filePath}" not found.`);
            // Return null or throw specific error based on desired handling
            return null; 
        }
         throw new Error(`GitHub API error (${error.status}): Could not load file content for "${filePath}".`);
    } else {
        console.error(`Generic error fetching file content for "${filePath}":`, error);
        throw new Error(`Could not load file content.`);
    }
  }
}

// Other action placeholders (getFileContent, createOrUpdateFile, etc.) will go here... 

/**
 * Creates a new file or updates an existing file in the user's repository.
 * If `sha` is provided, it attempts an update. Otherwise, it creates a new file.
 */
export async function createOrUpdateFile(
    filePath: string, 
    content: string, 
    commitMessage: string, 
    sha?: string // Provide SHA for updates, omit for creates
): Promise<{ success: boolean; sha: string | null; error?: string; isConflict?: boolean }> {
  noStore();
  console.log(`createOrUpdateFile called for path: "${filePath}", sha: ${sha}`);

  let octokit;
  let repoFullName: string;

  try {
    octokit = await getUserOctokit();
    const connection = await checkUserConnectionStatus();
    if (connection.status !== 'CONNECTED') {
      return { success: false, sha: null, error: 'User is not fully connected.' };
    }
    repoFullName = connection.repoFullName;
  } catch (authError: any) {
    console.error("Auth/connection error in createOrUpdateFile:", authError);
    return { success: false, sha: null, error: `Authentication failed: ${authError.message}` };
  }

  const [owner, repo] = repoFullName.split('/');
  const encodedContent = Buffer.from(content).toString('base64');

  try {
    const { data } = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path: filePath,
      message: commitMessage,
      content: encodedContent,
      sha: sha, // Include SHA if it's an update
    });

    // Successfully created or updated
    const newSha = data.content?.sha ?? null;
    console.log(`File ${sha ? 'updated' : 'created'} successfully at path: "${filePath}", new SHA: ${newSha}`);
    return { success: true, sha: newSha };

  } catch (error: unknown) {
    if (error instanceof RequestError) {
      console.error(`Octokit RequestError in createOrUpdateFile for "${filePath}" (Status: ${error.status}):`, error.message);
      // Specific handling for conflicts (SHA mismatch during update)
      if (error.status === 409) {
          console.warn(`Conflict detected for "${filePath}". Provided SHA: ${sha}`);
          return { success: false, sha: null, error: 'Conflict detected. The file has been modified elsewhere.', isConflict: true };
      }
      // Handle other GitHub API errors
      return { success: false, sha: null, error: `GitHub API error (${error.status}): ${error.message}` };
    } else {
      // Handle generic errors
      console.error(`Generic error in createOrUpdateFile for "${filePath}":`, error);
      return { success: false, sha: null, error: `An unexpected error occurred: ${(error as Error).message}` };
    }
  }
}

/**
 * Deletes a file from the user's repository.
 */
export async function deleteFile(
  filePath: string, 
  sha: string, // SHA is required for deletion
  commitMessage?: string
): Promise<{ success: boolean; error?: string }> {
  noStore();
  console.log(`deleteFile called for path: "${filePath}", sha: ${sha}`);

  let octokit;
  let repoFullName: string;

  try {
    octokit = await getUserOctokit();
    const connection = await checkUserConnectionStatus();
    if (connection.status !== 'CONNECTED') {
      return { success: false, error: 'User is not fully connected.' };
    }
    repoFullName = connection.repoFullName;
  } catch (authError: any) {
    console.error("Auth/connection error in deleteFile:", authError);
    return { success: false, error: `Authentication failed: ${authError.message}` };
  }

  const [owner, repo] = repoFullName.split('/');
  const finalCommitMessage = commitMessage || `Delete ${filePath}`; // Default commit message

  try {
    await octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path: filePath,
      message: finalCommitMessage,
      sha: sha,
    });

    console.log(`File deleted successfully at path: "${filePath}"`);
    return { success: true };

  } catch (error: unknown) {
     if (error instanceof RequestError) {
      console.error(`Octokit RequestError in deleteFile for "${filePath}" (Status: ${error.status}):`, error.message);
      // Handle common errors like 404 (already deleted?) or 409 (SHA mismatch)
      if (error.status === 404) {
         return { success: false, error: 'File not found. It might have been already deleted.' };
      } 
      if (error.status === 409) {
          return { success: false, error: 'Conflict detected. The file state has changed.' };
      }
       return { success: false, error: `GitHub API error (${error.status}): ${error.message}` };
    } else {
      console.error(`Generic error in deleteFile for "${filePath}":`, error);
       return { success: false, error: `An unexpected error occurred: ${(error as Error).message}` };
    }
  }
}

/**
 * Creates an empty folder by creating a .gitkeep file within it.
 */
export async function createFolder(
  folderPath: string
): Promise<{ success: boolean; error?: string }> {
  noStore();
  // Ensure folderPath doesn't end with a slash for consistency
  const normalizedPath = folderPath.endsWith('/') ? folderPath.slice(0, -1) : folderPath;
  const gitkeepPath = `${normalizedPath}/.gitkeep`;
  console.log(`createFolder called, attempting to create: "${gitkeepPath}"`);

  // Use createOrUpdateFile to add the .gitkeep file
  const result = await createOrUpdateFile(
    gitkeepPath,
    '', // Empty content for .gitkeep
    `Create folder ${normalizedPath}`
    // No SHA provided, indicating a create operation
  );

  if (result.success) {
     console.log(`Folder created successfully (via .gitkeep) at path: "${normalizedPath}"`);
     return { success: true };
  } else {
    // Pass through the error from createOrUpdateFile
    console.error(`Failed to create folder "${normalizedPath}": ${result.error}`);
    // Specific check: If it was a conflict, maybe the folder (or .gitkeep) already exists?
    if (result.isConflict) {
      // You might want to check if the path actually exists as a folder now
      // For simplicity, return a generic error or potentially success if it already exists.
       return { success: false, error: `Could not create folder. It might already exist.` };
    }
    return { success: false, error: result.error || 'Failed to create folder.' };
  }
} 