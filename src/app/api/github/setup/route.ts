import { createClient } from '@/lib/supabase/server'
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr' // Import CookieOptions
import { cookies } from 'next/headers'

export async function GET(request: NextRequest) {
  // Get the canonical app URL from environment variables
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    console.error("Error: NEXT_PUBLIC_APP_URL environment variable is not set.");
    // Return a generic server error response or redirect to a generic error page
    // Avoid using origin here as well if it might be unreliable
    return new NextResponse("Server configuration error.", { status: 500 }); 
  }

  const { searchParams } = new URL(request.url); // Still need searchParams
  const installationId = searchParams.get('installation_id');
  const setupAction = searchParams.get('setup_action');

  // Verify installation details from GitHub redirect
  if (setupAction !== 'install' || !installationId) {
    console.error('Invalid GitHub App setup callback parameters.', { installationId, setupAction });
    // Redirect to notes using the configured app URL
    return NextResponse.redirect(`${appUrl}/notes?error=github_setup_invalid_params`);
  }

  const cookieStore = cookies();
  const supabase = createClient(); // Get standard client to find the user

  // Get the currently logged-in Supabase user
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('User not found during GitHub App setup callback:', userError);
    // Redirect to login/home page using the configured app URL
    // Assuming '/' is your home/login page if no user is found
    return NextResponse.redirect(`${appUrl}/?error=github_setup_no_user`); 
  }

  // Use Supabase Admin Client to write to user_connections
  // IMPORTANT: Ensure SERVICE_ROLE_KEY is properly configured in .env.local and Vercel
  // Retrieve Supabase URL and Service Role Key from environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Error: Supabase URL or Service Role Key environment variables are not set.");
    return new NextResponse("Server configuration error (Supabase keys missing).", { status: 500 });
  }

  const supabaseAdmin = createServerClient(
    supabaseUrl,
    serviceRoleKey, // Use Service Role Key
    {
      cookies: { // Required cookie functions even for admin client
          get(name: string) { return cookieStore.get(name)?.value },
          set(name: string, value: string, options: CookieOptions) { cookieStore.set({ name, value, ...options }) },
          remove(name: string, options: CookieOptions) { cookieStore.set({ name, value: '', ...options }) },
      },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    }
  )

  // Save/update the connection record for this user
  try {
    const { error: upsertError } = await supabaseAdmin
      .from('user_connections')
      .upsert(
        {
          user_id: user.id,
          github_installation_id: parseInt(installationId, 10), // Store installation ID
          // repository_full_name is left null initially - user selects it next
        },
        { onConflict: 'user_id' } // If user somehow triggers this twice, update
      )

    if (upsertError) {
      console.error('Error upserting user connection:', upsertError);
      // Redirect to notes using the configured app URL
      return NextResponse.redirect(`${appUrl}/notes?error=github_setup_db_error`);
    }
  } catch (error: unknown) {
      console.error('Unexpected error during upsert:', error);
      const message = error instanceof Error ? error.message : 'Database operation failed';
       // Redirect to notes using the configured app URL
       return NextResponse.redirect(`${appUrl}/notes?error=github_setup_db_unexpected&message=${encodeURIComponent(message)}`);
  }

  console.log(`Successfully linked installation ${installationId} to user ${user.id}`);
  
  // Redirect back to the main notes page using the configured app URL
  // The notes page will re-run checkUserConnectionStatus and now find CONNECTION_NO_REPO
  return NextResponse.redirect(`${appUrl}/notes`);
} 