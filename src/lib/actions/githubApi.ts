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

// Define structure for commit history items
export interface CommitInfo {
  sha: string;
  message: string;
  author?: {
    name?: string;
    date?: string;
  };
  html_url: string;
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
 * Can optionally specify a ref (SHA, branch, tag) to get content from.
 */
export async function getFileContent(
    filePath: string, 
    ref?: string // Optional ref (e.g., commit SHA) to fetch historical content
): Promise<{ content: string; sha: string } | null> { // Note: SHA returned might be the blob SHA, not commit SHA when ref is used
  noStore();
  console.log(`getFileContent called for path: "${filePath}", ref: ${ref || 'default branch'}`);
  
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
      ref: ref, // Pass the ref parameter here
    });

    // Type guard to ensure we received file content data
    if (typeof data !== 'object' || data === null || Array.isArray(data) || !('content' in data) || !('sha' in data) || data.type !== 'file') {
       console.error('Invalid response when fetching file content for:', filePath, data);
       throw new Error(`Could not retrieve file content. Unexpected response format.`);
    }

    // Decode content from Base64
    const decodedContent = Buffer.from(data.content, 'base64').toString('utf8');
    
    // When fetching with ref, data.sha is the blob SHA for that version
    console.log(`getFileContent successfully fetched blob SHA ${data.sha} for path: "${filePath}" at ref: ${ref || 'default branch'}`);
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

/**
 * Renames a file using a delete + create strategy.
 * NOTE: This is not atomic. Potential for failure after delete but before create.
 * Limited to files for V1 simplicity.
 */
export async function renameFile(
    oldPath: string,
    newPath: string,
    sha: string, // SHA of the old file is required
    commitMessage?: string 
): Promise<{ success: boolean; newSha?: string | null; error?: string }> {
    noStore();
    console.log(`renameFile called. From: "${oldPath}" To: "${newPath}" SHA: ${sha}`);

    // 1. Get the content of the old file
    let oldContent: string;
    try {
        const contentResult = await getFileContent(oldPath);
        if (!contentResult) {
            throw new Error('Original file not found.');
        }
        oldContent = contentResult.content;
        // We already have the SHA from the parameter
    } catch (error: any) {
        console.error(`Error getting content for rename source "${oldPath}":`, error);
        return { success: false, error: `Could not read original file: ${error.message}` };
    }

    // 2. Delete the old file
    const deleteCommit = commitMessage || `Rename ${oldPath} to ${newPath} (delete step)`;
    try {
        const deleteResult = await deleteFile(oldPath, sha, deleteCommit);
        if (!deleteResult.success) {
             // If delete fails, we can't proceed
             throw new Error(deleteResult.error || 'Failed to delete original file during rename.');
        }
        console.log(`Successfully deleted old file "${oldPath}" during rename.`);
    } catch (error: any) {
        console.error(`Error deleting old file "${oldPath}" during rename:`, error);
         // Important: If delete failed, we should stop here.
        return { success: false, error: `Failed to delete original file: ${error.message}` };
    }

    // 3. Create the new file with the old content
     const createCommit = commitMessage || `Rename ${oldPath} to ${newPath} (create step)`;
    try {
        // Use createOrUpdateFile without SHA to ensure creation
        const createResult = await createOrUpdateFile(newPath, oldContent, createCommit);
        if (createResult.success) {
            console.log(`Successfully created new file "${newPath}" during rename.`);
            return { success: true, newSha: createResult.sha };
        } else {
             // Create failed after delete - this is the problematic case
            throw new Error(createResult.error || 'Failed to create new file after deleting old one.');
        }
    } catch (error: any) {
        console.error(`Error creating new file "${newPath}" during rename:`, error);
         // Return error, but note that the old file is already deleted!
         // This might require manual intervention by the user.
        return { success: false, error: `Failed to create new file after deleting old one: ${error.message}` };
    }
}

/**
 * Saves the current content of a file as a new commit.
 * This is essentially a wrapper around createOrUpdateFile for clarity.
 */
export async function saveDraft(
    filePath: string,
    content: string,
    currentSha: string | undefined, // Allow undefined SHA for new files
    commitMessage: string
): Promise<{ success: boolean; sha: string | null; error?: string; isConflict?: boolean }> {
    noStore();
    console.log(`saveDraft called for path: "${filePath}", base SHA: ${currentSha}`);

    // Directly call createOrUpdateFile, passing the current SHA for update check
    return createOrUpdateFile(filePath, content, commitMessage, currentSha);
}

/**
 * Fetches only the latest SHA of a specific file without downloading content.
 * Uses a HEAD request for efficiency.
 */
export async function getLatestFileSha(filePath: string): Promise<{ sha: string | null; error?: string }> {
  // noStore(); // Might be okay to cache HEAD requests briefly?
  console.log(`getLatestFileSha called for path: "${filePath}"`);

  let octokit;
  let repoFullName: string;

  try {
    octokit = await getUserOctokit();
    const connection = await checkUserConnectionStatus();
    if (connection.status !== 'CONNECTED') {
      return { sha: null, error: 'User is not fully connected.' };
    }
    repoFullName = connection.repoFullName;
  } catch (authError: any) {
    console.error("Auth/connection error in getLatestFileSha:", authError);
    return { sha: null, error: `Authentication failed: ${authError.message}` };
  }

  const [owner, repo] = repoFullName.split('/');

  try {
    // Use HEAD request to get metadata (including ETag/SHA) without content
    const { headers } = await octokit.request('HEAD /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path: filePath,
    });

    // Extract SHA from ETag header (ETag is usually "sha")
    const etag = headers.etag;
    const sha = etag ? etag.replace(/"/g, '') : null;
    
    if (sha) {
       console.log(`getLatestFileSha successful for "${filePath}", SHA: ${sha}`);
       return { sha };
    } else {
       console.warn(`Could not extract SHA from ETag for "${filePath}". Headers:`, headers);
       // Fallback to GET if HEAD didn't provide SHA? Or just return error?
       // For V1, let's return an error if SHA not found in ETag.
       return { sha: null, error: 'Could not determine file SHA from headers.' };
    }

  } catch (error: unknown) {
    if (error instanceof RequestError) {
      console.error(`Octokit RequestError in getLatestFileSha for "${filePath}" (Status: ${error.status}):`, error.message);
      if (error.status === 404) {
        return { sha: null, error: 'File not found.' };
      }
      return { sha: null, error: `GitHub API error (${error.status}): ${error.message}` };
    } else {
      console.error(`Generic error in getLatestFileSha for "${filePath}":`, error);
      return { sha: null, error: `An unexpected error occurred: ${(error as Error).message}` };
    }
  }
}

/**
 * Fetches the commit history for a specific file.
 */
export async function getCommitsForFile(filePath: string): Promise<{ commits: CommitInfo[]; error?: string }> {
  noStore();
  console.log(`getCommitsForFile called for path: "${filePath}"`);

  let octokit;
  let repoFullName: string;

  try {
    octokit = await getUserOctokit();
    const connection = await checkUserConnectionStatus();
    if (connection.status !== 'CONNECTED') {
      return { commits: [], error: 'User is not fully connected.' };
    }
    repoFullName = connection.repoFullName;
  } catch (authError: any) {
    console.error("Auth/connection error in getCommitsForFile:", authError);
    return { commits: [], error: `Authentication failed: ${authError.message}` };
  }

  const [owner, repo] = repoFullName.split('/');

  try {
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/commits', {
      owner,
      repo,
      path: filePath,
      per_page: 50, // Limit number of commits fetched for performance
    });

    // Format the commit data
    const commits: CommitInfo[] = data.map((commit: any) => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: {
         name: commit.commit.author?.name,
         date: commit.commit.author?.date,
      },
      html_url: commit.html_url,
    }));

    console.log(`getCommitsForFile successful for "${filePath}", fetched ${commits.length} commits.`);
    return { commits };

  } catch (error: unknown) {
     if (error instanceof RequestError) {
      console.error(`Octokit RequestError in getCommitsForFile for "${filePath}" (Status: ${error.status}):`, error.message);
      // Handle common errors like 404 (file path not found in history?)
      if (error.status === 404) {
        // Check if it's because the file itself doesn't exist or has no history
        // For now, return empty array
        console.warn(`Commit history not found for "${filePath}". File might be new or path incorrect.`);
        return { commits: [], error: 'Commit history not found for this file.' };
      }
      return { commits: [], error: `GitHub API error (${error.status}): ${error.message}` };
    } else {
      console.error(`Generic error in getCommitsForFile for "${filePath}":`, error);
      return { commits: [], error: `An unexpected error occurred: ${(error as Error).message}` };
    }
  }
} 