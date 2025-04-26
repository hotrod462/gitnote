'use server'

import { getUserOctokit } from "@/lib/github";
import { checkUserConnectionStatus } from '@/lib/actions/githubConnections';
// import type { Octokit } from "@octokit/core"; // Import Octokit type
import type { Octokit } from "octokit"; // Import Octokit type

/**
 * Gets the authenticated Octokit instance and repository details.
 * Throws an error if the user is not connected or authentication fails.
 */
export async function getOctokitAndRepo(): Promise<{
    octokit: Octokit;
    owner: string;
    repo: string;
    repoFullName: string;
}> {
    let octokit: Octokit;
    let repoFullName: string;

    try {
        octokit = await getUserOctokit();
        const connection = await checkUserConnectionStatus();
        if (connection.status !== 'CONNECTED') {
            throw new Error('User is not fully connected.');
        }
        repoFullName = connection.repoFullName;
    } catch (authError: unknown) {
        const message = authError instanceof Error ? authError.message : 'Authentication failed';
        console.error("Authentication or connection error:", authError);
        // Re-throw a consistent error message
        throw new Error(`GitHub connection error: ${message}`);
    }

    const [owner, repo] = repoFullName.split('/');

    if (!owner || !repo) {
        throw new Error(`Invalid repository format: ${repoFullName}`);
    }

    return { octokit, owner, repo, repoFullName };
}
