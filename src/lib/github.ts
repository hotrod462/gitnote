import { App } from 'octokit';
import { createClient } from '@/lib/supabase/server';
import { checkUserConnectionStatus } from '@/lib/actions/githubConnections';

// Helper to get an Octokit instance authenticated as the App
// This is used for app-level operations like listing installations or getting installation tokens
export function getAppOctokit(): App {
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

  if (!appId || !privateKey) {
    throw new Error('GitHub App credentials (app ID, private key) are not configured.');
  }

  const formattedPrivateKey = privateKey.replace(/\\n/g, '\n');

  return new App({
    appId: appId,
    privateKey: formattedPrivateKey,
  });
}

// Helper to get an installation access token
// Export this function so it can be used by actions
export async function getInstallationAccessToken(installationId: number): Promise<string> {
  const appOctokit = getAppOctokit();
  try {
    const { data } = await appOctokit.octokit.request('POST /app/installations/{installation_id}/access_tokens', {
      installation_id: installationId,
    });
    return data.token;
  } catch (error: unknown) {
    console.error(`Failed to get installation access token for installation ${installationId}:`, error);
    throw new Error("Could not generate installation access token.");
  }
}

// Helper to get an Octokit instance authenticated for a specific user's installation
// This is the primary helper used by most Server Actions performing repo operations
export async function getUserOctokit() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    throw new Error('User not authenticated.');
  }

  // Check the connection status to get installationId and ensure user is fully connected
  const connection = await checkUserConnectionStatus();

  if (connection.status !== 'CONNECTED') {
    // Handle cases where user isn't fully set up yet
    if (connection.status === 'NO_CONNECTION') {
      throw new Error('GitHub App connection not found for user.');
    }
    if (connection.status === 'CONNECTION_NO_REPO') {
      throw new Error('Repository not selected for the connection.');
    }
    throw new Error('User connection is not in a valid state.');
  }

  const installationId = connection.installationId;
  const installationToken = await getInstallationAccessToken(installationId);

  // Return an Octokit instance authenticated with the installation token
  const { Octokit } = await import("octokit"); // Dynamically import Octokit if needed
  return new Octokit({ auth: installationToken });
} 