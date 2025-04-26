'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { RequestError } from '@octokit/request-error';
import { Buffer } from 'buffer'; // Node.js Buffer
import { getOctokitAndRepo } from './helpers'; // Import the helper

/**
 * Fetches the content and SHA of a specific file from the user's repository.
 * Can optionally specify a ref (SHA, branch, tag) to get content from.
 */
export async function getFileContent(
    filePath: string,
    ref?: string // Optional ref (e.g., commit SHA) to fetch historical content
): Promise<{ content: string; sha: string } | null> { // Allow null return type
  noStore();
  console.log(`getFileContent called for path: \"${filePath}\", ref: ${ref || 'default branch'}`);

  try {
    // Get Octokit instance and repo details using the helper
    const { octokit, owner, repo } = await getOctokitAndRepo();

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
    console.log(`getFileContent successfully fetched blob SHA ${data.sha} for path: \"${filePath}\" at ref: ${ref || 'default branch'}`);
    return { content: decodedContent, sha: data.sha };

  } catch (error: unknown) {
     if (error instanceof RequestError) {
        console.error(`Octokit RequestError fetching file content \"${filePath}\" (Status: ${error.status}):`, error.message);
        if (error.status === 404) {
            console.log(`File \"${filePath}\" not found.`);
            // Explicitly return null as allowed by the signature
            return null;
        }
         throw new Error(`GitHub API error (${error.status}): Could not load file content for \"${filePath}\".`);
     } else if (error instanceof Error && error.message.startsWith('GitHub connection error:')) {
        // Handle connection errors from the helper
        console.error("Connection error in getFileContent:", error.message);
        throw error; // Re-throw the specific connection error
    } else {
        console.error(`Generic error fetching file content for \"${filePath}\":`, error);
        throw new Error(`Could not load file content.`);
    }
  }
}

/**
 * Fetches only the latest SHA of a specific file without downloading content.
 * Uses a GET request to ensure we get the SHA directly from the response body.
 */
export async function getLatestFileSha(filePath: string): Promise<{ sha: string | null; error?: string }> {
  // noStore(); // Might be okay to cache HEAD requests briefly?
  console.log(`getLatestFileSha called for path: \"${filePath}\"`);

  try {
    // Get Octokit instance and repo details using the helper
    const { octokit, owner, repo } = await getOctokitAndRepo();

    // Use GET request to ensure we get the SHA directly from the response body
    const { data } = await octokit.request('GET /repos/{owner}/{repo}/contents/{path}', {
      owner,
      repo,
      path: filePath,
    });

    // Type guard checking for file type and sha property
    if (typeof data !== 'object' || data === null || Array.isArray(data) || !('sha' in data) || data.type !== 'file') {
       console.error('Invalid response when fetching latest file SHA for:', filePath, data);
       return { sha: null, error: 'Could not retrieve file SHA. Unexpected response format.' };
    }

    // Extract the SHA directly from the response body data
    const gitSha = data.sha as string | null;

    if (gitSha) {
       console.log(`getLatestFileSha successfully fetched SHA ${gitSha} for path: \"${filePath}\"`);
       // No cleaning needed if fetched correctly from body
       return { sha: gitSha };
    } else {
       // This case should be unlikely if the type guard passed
       console.warn(`SHA was null or undefined in response body for \"${filePath}\". Data:`, data);
       return { sha: null, error: 'Could not determine file SHA from response body.' };
    }

  } catch (error: unknown) {
    if (error instanceof RequestError) {
      console.error(`Octokit RequestError in getLatestFileSha for \"${filePath}\" (Status: ${error.status}):`, error.message);
      if (error.status === 404) {
        // No need to return an error string here, null SHA is sufficient indication
        console.log(`File not found in getLatestFileSha for path: \"${filePath}\"`);
        return { sha: null };
      }
      return { sha: null, error: `GitHub API error (${error.status}): ${error.message}` };
    } else if (error instanceof Error && error.message.startsWith('GitHub connection error:')) {
        // Handle connection errors from the helper
        console.error("Connection error in getLatestFileSha:", error.message);
        // Return error in the expected structure
        return { sha: null, error: error.message };
    } else {
      console.error(`Generic error in getLatestFileSha for \"${filePath}\":`, error);
      return { sha: null, error: `An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}` };
    }
  }
}
