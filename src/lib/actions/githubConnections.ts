'use server'

import { createClient } from '@/lib/supabase/server'
import { unstable_noStore as noStore } from 'next/cache'; // Prevent caching of this dynamic data
import { getInstallationAccessToken } from '@/lib/github'; // Import the App Octokit helper
import { Octokit } from 'octokit'; 
import { revalidatePath } from 'next/cache'; // Needed to trigger UI refresh

// Define the possible statuses
export type ConnectionStatus = 
  | { status: 'NO_CONNECTION' }
  | { status: 'CONNECTION_NO_REPO', installationId: number }
  | { status: 'CONNECTED', installationId: number, repoFullName: string };

/**
 * Checks the user's connection status by querying the Supabase table.
 */
export async function checkUserConnectionStatus(): Promise<ConnectionStatus> {
  noStore();
  const supabase = createClient();

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error("Error fetching user:", userError);
    return { status: 'NO_CONNECTION' }; // Treat error fetching user as no connection
  }

  const { data: connection, error: connectionError } = await supabase
    .from('user_connections')
    .select('github_installation_id, repository_full_name')
    .eq('user_id', user.id)
    .single();

  if (connectionError || !connection) {
    if (connectionError && connectionError.code !== 'PGRST116') { // Ignore 'Row not found' error, which is expected
        console.error("Error fetching user connection:", connectionError);
    }
    // If no record found or other error, assume no connection established yet
    return { status: 'NO_CONNECTION' };
  }

  const installationId = connection.github_installation_id;
  const repoFullName = connection.repository_full_name;

  if (!installationId) {
    // This case should ideally not happen if the row exists, but handle defensively
    console.warn(`User ${user.id} has connection record but no installation ID.`);
    return { status: 'NO_CONNECTION' };
  }

  if (!repoFullName) {
    console.log(`User ${user.id} has connection with installation ID ${installationId} but no repository selected.`);
    return { status: 'CONNECTION_NO_REPO', installationId };
  }

  console.log(`User ${user.id} is connected with installation ID ${installationId} and repository ${repoFullName}.`);
  return { status: 'CONNECTED', installationId, repoFullName };
}

interface Repository {
    id: number;
    full_name: string;
}

/**
 * Fetches the list of repositories accessible by a specific installation ID.
 */
export async function getInstallationRepositories(installationId: number): Promise<Repository[]> {
  noStore();
  console.log(`Fetching repositories for installation ID: ${installationId}`);
  
  try {
    // We need an *installation* access token for this, not just an app token
    const installationToken = await getInstallationAccessToken(installationId);
    if (!installationToken) {
        throw new Error("Could not retrieve installation access token.");
    }

    const octokit = new Octokit({ auth: installationToken });

    // Fetch repositories for the installation
    // Note: This uses the installation token, so it only lists repos the installation *can* access.
    const response = await octokit.request('GET /installation/repositories'); 
    // TODO: Add pagination if needed, though unlikely for initial selection

    console.log(`Fetched ${response.data.repositories.length} repositories for installation ${installationId}`);
    // Add type check for repo object
    return response.data.repositories.map((repo: unknown) => {
      if(typeof repo === 'object' && repo !== null && 'id' in repo && 'full_name' in repo) {
        return {
          id: Number(repo.id),
          full_name: String(repo.full_name),
        }
      } else {
        console.warn("Skipping invalid repository object:", repo);
        return null;
      }
    }).filter((repo): repo is Repository => repo !== null); // Filter out nulls

  } catch (error: unknown) { // Use unknown
     console.error(`Failed to fetch repositories for installation ${installationId}:`, error);
     // Improve error handling - check for specific Octokit errors
     if (error instanceof Error && error.message.includes('404')) {
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