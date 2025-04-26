'use server';

import { unstable_noStore as noStore } from 'next/cache';
import { RequestError } from '@octokit/request-error';
import { getOctokitAndRepo } from './helpers'; // Import the helper

// Define structure for commit history items (copied from original file)
export interface CommitInfo {
  sha: string;
  message: string;
  author?: {
    name?: string;
    date?: string;
  };
  html_url: string;
}

// Define structure for staged files (copied from original file)
export interface StagedFileCommitDetails {
  path: string;
  content: string; // Content is now always string (base64 or utf-8)
  encoding: 'utf-8' | 'base64'; // Indicates how content is encoded
}

/**
 * Fetches the commit history for a specific file.
 */
export async function getCommitsForFile(filePath: string): Promise<{ commits: CommitInfo[]; error?: string }> {
  noStore();
  console.log(`getCommitsForFile called for path: \"${filePath}\"`);

  try {
    const { octokit, owner, repo } = await getOctokitAndRepo();

    const { data } = await octokit.request('GET /repos/{owner}/{repo}/commits', {
      owner,
      repo,
      path: filePath,
      per_page: 50, // Limit number of commits fetched for performance
    });

    // Type the data
    const commitsData: unknown[] = data;

    // Validate and map the data
    const commits: CommitInfo[] = commitsData.map((commit: unknown): CommitInfo | null => {
      // Type predicate for the overall commit structure from the API list
      function isPotentialCommit(obj: unknown): obj is { sha: string; commit: unknown; html_url: string } {
        return (
          typeof obj === 'object' &&
          obj !== null &&
          'sha' in obj && typeof obj.sha === 'string' &&
          'commit' in obj && typeof obj.commit === 'object' && obj.commit !== null && // Check commit is an object
          'html_url' in obj && typeof obj.html_url === 'string'
        );
      }

      // Type predicate for the nested commit details
      function isPotentialCommitDetails(obj: unknown): obj is { message: string; author?: { name?: string; date?: string } } {
        return (
            typeof obj === 'object' &&
            obj !== null &&
            'message' in obj && typeof obj.message === 'string' &&
            (!('author' in obj) || // author is optional
              (typeof obj.author === 'object' && obj.author !== null &&
                (!('name' in obj.author) || typeof obj.author.name === 'string') && // author.name is optional or string
                (!('date' in obj.author) || typeof obj.author.date === 'string'))) // author.date is optional or string
        );
      }

      if (isPotentialCommit(commit) && isPotentialCommitDetails(commit.commit)) {
        return {
          sha: commit.sha,
          message: commit.commit.message,
          author: commit.commit.author ? {
            name: commit.commit.author.name,
            date: commit.commit.author.date,
          } : undefined,
          html_url: commit.html_url,
        };
      } else {
        console.warn('Skipping invalid commit data structure:', commit);
        return null;
      }
    }).filter((commit): commit is CommitInfo => commit !== null);

    console.log(`getCommitsForFile successful for \"${filePath}\", fetched ${commits.length} commits.`);
    return { commits };

  } catch (error: unknown) {
     if (error instanceof RequestError) {
      console.error(`Octokit RequestError in getCommitsForFile for \"${filePath}\" (Status: ${error.status}):`, error.message);
      // Handle common errors like 404 (file path not found in history?)
      if (error.status === 404) {
        // Check if it's because the file itself doesn't exist or has no history
        // For now, return empty array with error
        console.warn(`Commit history not found for \"${filePath}\". File might be new or path incorrect.`);
        return { commits: [], error: 'Commit history not found for this file.' };
      }
      // Explicitly return for other RequestErrors
      return { commits: [], error: `GitHub API error (${error.status}): ${error.message}` };
    } else if (error instanceof Error && error.message.startsWith('GitHub connection error:')) {
        // Handle connection errors from the helper
        console.error("Connection error in getCommitsForFile:", error.message);
        return { commits: [], error: error.message };
    } else {
      // Explicitly return for generic errors
      console.error(`Generic error in getCommitsForFile for \"${filePath}\":`, error);
      const message = error instanceof Error ? error.message : 'An unexpected error occurred';
      return { commits: [], error: `An unexpected error occurred: ${message}` };
    }
  }
}

/**
 * Commits multiple files using the Git Data API.
 */
export async function commitMultipleFiles(
  filesToCommit: StagedFileCommitDetails[],
  commitMessage: string
): Promise<{ success: boolean; error?: string; commitUrl?: string }> {
  noStore();
  console.log(`commitMultipleFiles called with ${filesToCommit.length} files.`);

  if (filesToCommit.length === 0) {
      return { success: false, error: "No files provided to commit." };
  }
  if (!commitMessage.trim()) {
      return { success: false, error: "Commit message cannot be empty." };
  }

  try {
    const { octokit, owner, repo } = await getOctokitAndRepo();

    // 1. Get default branch
    console.log(`Fetching default branch for ${owner}/${repo}...`);
    const { data: branchData } = await octokit.rest.repos.get({ owner, repo });
    const defaultBranch = branchData.default_branch;
    console.log(`Default branch: ${defaultBranch}`);

    // 2. Get the SHA of the latest commit on the default branch
    console.log(`Fetching latest commit SHA for ref: heads/${defaultBranch}`);
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`,
    });
    const latestCommitSha = refData.object.sha;
    console.log(`Latest commit SHA: ${latestCommitSha}`);

    // 3. Get the tree SHA associated with the latest commit
    console.log(`Fetching commit details for SHA: ${latestCommitSha}`);
    const { data: commitData } = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: latestCommitSha,
    });
    const baseTreeSha = commitData.tree.sha;
    console.log(`Base tree SHA: ${baseTreeSha}`);

    // 4. Create blob objects for each file content
    console.log("Creating blobs for staged files...");
    const blobPromises = filesToCommit.map(async (file) => {
        // Content is already a string (either utf-8 or base64)
        // Encoding is provided in file.encoding
        console.log(`Creating blob for path: ${file.path} with encoding: ${file.encoding}`);
        const { data: blobData } = await octokit.rest.git.createBlob({
            owner,
            repo,
            content: file.content, // Pass content directly
            encoding: file.encoding, // Pass encoding directly
        });
        console.log(`Created blob for ${file.path} - SHA: ${blobData.sha}`);
        return {
          path: file.path,
          mode: '100644' as const, // Explicitly cast to literal type
          type: 'blob' as const,   // Explicitly cast to literal type
          sha: blobData.sha,
        };
    });
    const treeItems = await Promise.all(blobPromises);
    console.log("Blobs created successfully.");

    // 5. Create a new tree object
    console.log(`Creating new tree based on SHA: ${baseTreeSha}`);
    const { data: newTreeData } = await octokit.rest.git.createTree({
      owner,
      repo,
      base_tree: baseTreeSha,
      tree: treeItems,
    });
    const newTreeSha = newTreeData.sha;
    console.log(`New tree created - SHA: ${newTreeSha}`);

    // 6. Create a new commit object
    console.log(`Creating new commit with tree SHA: ${newTreeSha} and parent: ${latestCommitSha}`);
    const { data: newCommitData } = await octokit.rest.git.createCommit({
      owner,
      repo,
      message: commitMessage,
      tree: newTreeSha,
      parents: [latestCommitSha],
    });
    const newCommitSha = newCommitData.sha;
    console.log(`New commit created - SHA: ${newCommitSha}, URL: ${newCommitData.html_url}`);

    // 7. Update the branch reference
    console.log(`Updating ref heads/${defaultBranch} to point to commit SHA: ${newCommitSha}`);
    await octokit.rest.git.updateRef({
      owner,
      repo,
      ref: `heads/${defaultBranch}`,
      sha: newCommitSha,
      // force: false // Default is false, no need to force unless specific reason
    });
    console.log(`Successfully updated ref heads/${defaultBranch}.`);

    return { success: true, commitUrl: newCommitData.html_url };

  } catch (error: unknown) {
    console.error("Error during Git Data API commitMultipleFiles:", error);
    let errorMessage = 'Commit failed';
    if (error instanceof RequestError) {
        errorMessage = `GitHub API Error (${error.status}): ${error.message}`;
    } else if (error instanceof Error && error.message.startsWith('GitHub connection error:')) {
        // Handle connection errors from the helper
        errorMessage = error.message;
    } else if (error instanceof Error) {
        errorMessage = error.message;
    }
    return { success: false, error: errorMessage };
  }
}
