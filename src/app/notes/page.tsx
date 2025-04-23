import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { signOut } from '@/lib/actions/auth'; // Import the sign out action
import { Button } from '@/components/ui/button'; // Import Button
// import { checkUserConnectionStatus } from '@/lib/actions/githubConnections'; // We will create this action next
// import ConnectRepoPrompt from '@/components/ConnectRepoPrompt'; // Placeholder
// import SelectRepoPrompt from '@/components/SelectRepoPrompt'; // Placeholder

export default async function NotesPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/'); // Redirect to login page if not authenticated
  }

  // Placeholder for connection status check (Step 7)
  // const connectionStatus = await checkUserConnectionStatus(); 

  // Placeholder logic - assume connected for now to show something
  const status = 'CONNECTED'; // Replace with actual status check result later
  const installationId = 12345; // Placeholder, replace with actual data

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <h1 className="text-2xl font-bold mb-4">Notes Page</h1>
      {/* Conditional rendering based on connection status (Step 7) */}
      {status === 'NO_CONNECTION' && (
        <p>Connect Repo Prompt Placeholder</p>
        // <ConnectRepoPrompt />
      )}
      {status === 'CONNECTION_NO_REPO' && (
        <p>Select Repo Prompt Placeholder (Installation ID: {installationId})</p>
        // <SelectRepoPrompt installationId={installationId!} />
      )}
      {status === 'CONNECTED' && (
        <div className="text-center">
          <p>Welcome, {user.email}!</p>
          <p>(Main App UI Placeholder - File Tree & Editor will go here)</p>
          {/* Placeholder for Sign Out Button */}
          <form action={signOut}> {/* Use the imported server action */}
             <Button type="submit" variant="destructive" size="sm" className="mt-4"> {/* Use shadcn Button */}
                Sign Out
             </Button>
           </form>
        </div>
      )}
    </div>
  );
} 