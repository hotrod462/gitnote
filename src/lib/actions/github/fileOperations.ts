'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { RequestError } from '@octokit/request-error';
import { Buffer } from 'buffer'; // Node.js Buffer
import { getOctokitAndRepo } from './helpers'; // Import the helper
import { getFileContent } from './fileContent'; // Import needed function

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
  console.log(`createOrUpdateFile called for path: \"${filePath}\", sha: ${sha}`);

  try {
    const { octokit, owner, repo } = await getOctokitAndRepo();
    const encodedContent = Buffer.from(content).toString('base64');

    const { data } = await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path: filePath,
      message: commitMessage,
      content: encodedContent,
      sha: sha, // Include SHA if it's an update
    });

    // Successfully created or updated
    // Ensure data.content exists, is an object, and has a sha property which is a string
    const newSha = (
        data && 
        data.content && 
        typeof data.content === 'object' && 
        'sha' in data.content && 
        typeof data.content.sha === 'string'
    ) ? data.content.sha : null;
    console.log(`File ${sha ? 'updated' : 'created'} successfully at path: \"${filePath}\", new SHA: ${newSha}`);
    return { success: true, sha: newSha };

  } catch (error: unknown) {
    if (error instanceof RequestError) {
      console.error(`Octokit RequestError in createOrUpdateFile for \"${filePath}\" (Status: ${error.status}):`, error.message);
      // Specific handling for conflicts (SHA mismatch during update)
      if (error.status === 409) {
          console.warn(`Conflict detected for \"${filePath}\". Provided SHA: ${sha}`);
          return { success: false, sha: null, error: 'Conflict detected. The file has been modified elsewhere.', isConflict: true };
      }
      // Handle other GitHub API errors
      return { success: false, sha: null, error: `GitHub API error (${error.status}): ${error.message}` };
    } else if (error instanceof Error && error.message.startsWith('GitHub connection error:')) {
        // Handle connection errors from the helper
        console.error("Connection error in createOrUpdateFile:", error.message);
        return { success: false, sha: null, error: error.message };
    } else {
      // Handle generic errors
      console.error(`Generic error in createOrUpdateFile for \"${filePath}\":`, error);
      return { success: false, sha: null, error: `An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}` };
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
  console.log(`deleteFile called for path: \"${filePath}\", sha: ${sha}`);

  try {
    const { octokit, owner, repo } = await getOctokitAndRepo();
    const finalCommitMessage = commitMessage || `Delete ${filePath}`; // Default commit message

    await octokit.request('DELETE /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path: filePath,
      message: finalCommitMessage,
      sha: sha,
    });

    console.log(`File deleted successfully at path: \"${filePath}\"`);
    return { success: true };

  } catch (error: unknown) {
     if (error instanceof RequestError) {
      console.error(`Octokit RequestError in deleteFile for \"${filePath}\" (Status: ${error.status}):`, error.message);
      // Handle common errors like 404 (already deleted?) or 409 (SHA mismatch)
      if (error.status === 404) {
         return { success: false, error: 'File not found. It might have been already deleted.' };
      }
      if (error.status === 409) {
          return { success: false, error: 'Conflict detected. The file state has changed.' };
      }
       return { success: false, error: `GitHub API error (${error.status}): ${error.message}` };
    } else if (error instanceof Error && error.message.startsWith('GitHub connection error:')) {
        // Handle connection errors from the helper
        console.error("Connection error in deleteFile:", error.message);
        return { success: false, error: error.message };
    } else {
      console.error(`Generic error in deleteFile for \"${filePath}\":`, error);
       return { success: false, error: `An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}` };
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
  // Ensure folderPath doesn't start with a slash if it's not the root
  const cleanPath = normalizedPath.startsWith('/') ? normalizedPath.substring(1) : normalizedPath;
  if (!cleanPath) {
      return { success: false, error: 'Folder path cannot be empty.' };
  }
  const gitkeepPath = `${cleanPath}/.gitkeep`;
  console.log(`createFolder called, attempting to create: \"${gitkeepPath}\"`);

  // Use createOrUpdateFile to add the .gitkeep file
  // Pass an explicit undefined for SHA to ensure it's treated as a creation
  const result = await createOrUpdateFile(
    gitkeepPath,
    '', // Empty content for .gitkeep
    `Create folder ${cleanPath}`,
    undefined // Explicitly undefined for create
  );

  if (result.success) {
     console.log(`Folder created successfully (via .gitkeep) at path: \"${cleanPath}\"`);
     return { success: true };
  } else {
    // Pass through the error from createOrUpdateFile
    console.error(`Failed to create folder \"${cleanPath}\": ${result.error}`);
    // Specific check: If it was a conflict, maybe the folder (or .gitkeep) already exists?
    if (result.isConflict) {
      // A conflict creating .gitkeep likely means it (or the folder structure) already exists.
      // Consider this a success case for creating a folder.
      // Maybe add a check here to see if the path *is* a directory?
       console.warn(`Conflict creating .gitkeep for folder \"${cleanPath}\", assuming folder exists.`);
       return { success: true, error: 'Folder might already exist (conflict creating .gitkeep).'}; // Indicate potential existing state
    }
    // If it was a connection error, pass that specific error
    if (result.error?.startsWith('GitHub connection error:')) {
        return { success: false, error: result.error };
    }
    // Otherwise, return the generic error
    return { success: false, error: result.error || 'Failed to create folder.' };
  }
}

/**
 * Renames a file using a delete + create strategy.
 * NOTE: This is not atomic. Potential for failure after delete but before create.
 */
export async function renameFile(
    oldPath: string,
    newPath: string,
    sha: string, // SHA of the old file is required
    commitMessage?: string
): Promise<{ success: boolean; newSha?: string | null; error?: string }> {
    noStore();
    console.log(`renameFile called. From: \"${oldPath}\" To: \"${newPath}\" SHA: ${sha}`);

    // 1. Get the content of the old file
    let oldContent: string;
    try {
        // Use getFileContent from fileContent.ts (ensure correct import)
        const contentResult = await getFileContent(oldPath);
        if (!contentResult) {
            // Use a more specific error message
            return { success: false, error: `Original file not found at path: ${oldPath}` };
        }
        oldContent = contentResult.content;
        // SHA is passed as parameter, no need to get from contentResult here
    } catch (error: unknown) {
        console.error(`Error getting content for rename source \"${oldPath}\":`, error);
        const message = error instanceof Error ? error.message : 'An unknown error occurred';
        // Check if it's a connection error from getFileContent
        if (message.startsWith('GitHub connection error:')) {
             return { success: false, error: message };
        }
        return { success: false, error: `Could not read original file: ${message}` };
    }

    // 2. Delete the old file
    const deleteCommit = commitMessage || `Rename ${oldPath} to ${newPath} (delete step)`;
    try {
        const deleteResult = await deleteFile(oldPath, sha, deleteCommit);
        if (!deleteResult.success) {
             // If delete fails, we can't proceed. Propagate the error.
             console.error(`Failed to delete old file \"${oldPath}\" during rename: ${deleteResult.error}`);
             return { success: false, error: deleteResult.error || 'Failed to delete original file during rename.' };
        }
        console.log(`Successfully deleted old file \"${oldPath}\" during rename.`);
    } catch (error: unknown) { // Catch potential errors from deleteFile itself (though it returns errors)
        console.error(`Unexpected error during deleteFile call for \"${oldPath}\" in rename:`, error);
        return { success: false, error: `Unexpected error deleting original file: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }

    // 3. Create the new file with the old content
     const createCommit = commitMessage || `Rename ${oldPath} to ${newPath} (create step)`;
    try {
        // Use createOrUpdateFile without SHA (undefined) to ensure creation
        const createResult = await createOrUpdateFile(newPath, oldContent, createCommit, undefined);
        if (createResult.success) {
            console.log(`Successfully created new file \"${newPath}\" during rename.`);
            return { success: true, newSha: createResult.sha };
        } else {
             // Create failed after delete - this is the problematic case
             console.error(`Failed to create new file \"${newPath}\" after deleting old one: ${createResult.error}`);
             // Propagate the specific error from createOrUpdateFile
             return { success: false, error: createResult.error || 'Failed to create new file after deleting old one.' };
        }
    } catch (error: unknown) { // Catch potential errors from createOrUpdateFile itself
        console.error(`Unexpected error during createOrUpdateFile call for \"${newPath}\" in rename:`, error);
         // Return error, but note that the old file is already deleted!
         // This might require manual intervention by the user.
        return { success: false, error: `Unexpected error creating new file after deleting old one: ${error instanceof Error ? error.message : 'Unknown error'}` };
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
    console.log(`saveDraft called for path: \"${filePath}\", base SHA: ${currentSha}`);

    // Directly call createOrUpdateFile, passing the current SHA for update check
    // The error handling (including connection errors) is done within createOrUpdateFile
    return createOrUpdateFile(filePath, content, commitMessage, currentSha);
}
