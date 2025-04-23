'use server'

import { createClient } from '@/lib/supabase/server'
import { unstable_noStore as noStore } from 'next/cache'; // Prevent caching of this dynamic data

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