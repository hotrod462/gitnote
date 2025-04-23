'use server'

import { createClient } from '@/lib/supabase/server'
import { unstable_noStore as noStore } from 'next/cache'; // Prevent caching of this dynamic data
import { getAppOctokit, getInstallationAccessToken } from '@/lib/github'; // Import the App Octokit helper
import { Octokit } from 'octokit'; 
import { revalidatePath } from 'next/cache'; // Needed to trigger UI refresh

// Define the possible statuses
export type ConnectionStatus = 
  | { status: 'NO_CONNECTION' }
  | { status: 'CONNECTION_NO_REPO', installationId: number }
  | { status: 'CONNECTED', installationId: number, repoFullName: string };

/**
 * Checks the user_connections table for the current user's status.
 * Determines if they have installed the GitHub App and selected a repository.
 */
export async function checkUserConnectionStatus(): Promise<ConnectionStatus> {
  noStore(); // Ensure this runs dynamically on each request
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    // This should ideally not happen if called from a protected route,
    // but handle defensively.
    console.error("User not found while checking connection status:", userError);
    // Returning NO_CONNECTION might be misleading, but it prevents further action.
    // Consider throwing an error or redirecting in the page component if this occurs.
    return { status: 'NO_CONNECTION' }; 
  }

  const { data, error: dbError } = await supabase
    .from('user_connections')
    .select('github_installation_id, repository_full_name')
    .eq('user_id', user.id)
    .maybeSingle(); // Use maybeSingle() as user might not have a row yet

  if (dbError) {
    console.error('Error fetching user connection:', dbError);
    // Treat database errors as if no connection exists for now
    // Might need more robust error handling/reporting
    return { status: 'NO_CONNECTION' };
  }

  if (!data) {
    // No row found for this user
    return { status: 'NO_CONNECTION' };
  }

  if (data.github_installation_id && !data.repository_full_name) {
    // Row exists with installation ID, but no repository selected yet
    return { 
      status: 'CONNECTION_NO_REPO', 
      installationId: data.github_installation_id 
    };
  }

  if (data.github_installation_id && data.repository_full_name) {
    // User is fully connected
    return { 
      status: 'CONNECTED', 
      installationId: data.github_installation_id,
      repoFullName: data.repository_full_name 
    };
  }

  // Fallback case - should ideally not be reached if data structure is consistent
  console.warn('Unexpected state in user_connections for user:', user.id, data);
  return { status: 'NO_CONNECTION' };
} 

/**
 * Fetches the list of repositories accessible by a specific installation ID.
 */
export async function getInstallationRepositories(installationId: number): Promise<{ id: number; full_name: string }[]> {
  noStore(); // Prevent caching
  
  try {
    // 1. Get an installation access token
    const installationToken = await getInstallationAccessToken(installationId);

    // 2. Create an Octokit instance authenticated with the installation token
    const installationOctokit = new Octokit({ auth: installationToken });
    
    // 3. Fetch repositories accessible by this specific installation token
    // Note: Use GET /installation/repositories endpoint when authenticated as installation
    // See: https://docs.github.com/en/rest/apps/installations#list-repositories-accessible-to-the-app-installation
    const { data } = await installationOctokit.request('GET /installation/repositories', {
        per_page: 100, // Fetch up to 100 repos, handle pagination if needed later
    });

    if (!data.repositories) {
      console.warn('No repositories found for installation:', installationId);
      return [];
    }

    // Return only the necessary fields
    return data.repositories.map(repo => ({ 
      id: repo.id, 
      full_name: repo.full_name 
    }));

  } catch (error: any) {
    console.error(`Error fetching repositories for installation ${installationId}:`, error);
    if (error.status === 404) {
      // This might indicate the token is invalid or install removed
      throw new Error(`Installation not found or access revoked: ${installationId}`);
    }
    // Re-throw a generic error, potentially masking the specific Octokit error
    // Consider logging the original error (already done) and maybe returning a specific error code/message
    throw new Error(`Failed to fetch repositories. Please try again later.`); 
  }
}

/**
 * Saves the user's selected repository to the user_connections table.
 */
export async function saveRepositorySelection(installationId: number, repoFullName: string): Promise<{ success: boolean; error?: string }> {
  noStore();
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("User not found while saving repository selection:", userError);
    return { success: false, error: "Authentication required." };
  }

  // Use Admin client to bypass RLS if needed, although updating own row might be allowed by policy
  // Let's use the standard client first, assuming RLS allows the user to update their own row 
  // if github_installation_id also matches (or just based on user_id match)
  // If this fails due to RLS, we can switch to the admin client.
  const { error: updateError } = await supabase
    .from('user_connections')
    .update({ repository_full_name: repoFullName, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    // Optional: Add extra safety check, though user_id is UNIQUE
    // .eq('github_installation_id', installationId) 
    .select() // Required to check if update actually happened (returns updated rows)
    .single(); // Expect exactly one row to be updated

  if (updateError) {
    console.error('Error updating user connection with repository:', updateError);
    // TODO: Check for specific errors (e.g., RLS violation, row not found)
    return { success: false, error: `Failed to save repository selection: ${updateError.message}` };
  }

  console.log(`Successfully saved repository ${repoFullName} for user ${user.id}`);
  
  // Revalidate the notes path to force re-fetching of connection status on the page
  revalidatePath('/notes'); 

  return { success: true };
} 