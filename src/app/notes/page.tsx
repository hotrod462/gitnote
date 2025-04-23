import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { signOut } from '@/lib/actions/auth'; // Import the sign out action
import { Button } from '@/components/ui/button'; // Import Button
import { checkUserConnectionStatus } from '@/lib/actions/githubConnections'; // Import the action
// import { checkUserConnectionStatus } from '@/lib/actions/githubConnections'; // We will create this action next
// import ConnectRepoPrompt from '@/components/ConnectRepoPrompt'; // Placeholder
// import SelectRepoPrompt from '@/components/SelectRepoPrompt'; // Placeholder

export default async function NotesPage() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect('/'); // Redirect to login page if not authenticated
  }

  // Call the action to get the actual connection status
  const connection = await checkUserConnectionStatus(); 

  // Prepare installationId for potential use (cleaner than accessing directly multiple times)
  let installationId: number | undefined;
  if (connection.status === 'CONNECTION_NO_REPO' || connection.status === 'CONNECTED') {
    installationId = connection.installationId;
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      {/* Use a subtle container for prompts */} 
      <div className="w-full max-w-md p-6 border rounded-lg shadow-sm bg-card text-card-foreground">
        
        {/* Conditional rendering based on actual connection status */} 
        {connection.status === 'NO_CONNECTION' && (
          <div className="text-center">
             <h2 className="text-xl font-semibold mb-3">Connect to GitHub</h2>
             <p className="mb-4 text-muted-foreground">
               Please install the GitNote GitHub App to connect your repositories.
             </p>
             {/* Placeholder for ConnectRepoPrompt component */}
             {/* We'll replace this button with the actual ConnectRepoPrompt component soon */}
             <Button disabled>Install GitHub App (Placeholder)</Button>
             {/* <ConnectRepoPrompt /> */}
          </div>
        )}

        {connection.status === 'CONNECTION_NO_REPO' && (
           <div className="text-center">
              <h2 className="text-xl font-semibold mb-3">Select Repository</h2>
              <p className="mb-4 text-muted-foreground">
                You've installed the app! Now select the repository you want to use.
              </p>
              <p className="text-sm text-muted-foreground mb-4">Installation ID: {installationId}</p>
               {/* Placeholder for SelectRepoPrompt component */}
               {/* We'll replace this button with the actual SelectRepoPrompt component soon */}
              <Button disabled>Select Repository (Placeholder)</Button>
              {/* <SelectRepoPrompt installationId={installationId!} /> */}
           </div>
        )}

        {connection.status === 'CONNECTED' && (
          <div className="text-center">
            <h1 className="text-2xl font-bold mb-4">Notes</h1>
            <p className="text-muted-foreground">Welcome, {user.email}!</p>
            <p className="text-sm text-muted-foreground">Status: CONNECTED</p>
            <p className="text-sm text-muted-foreground">Installation ID: {connection.installationId}</p>
            <p className="text-sm text-muted-foreground">Repository: {connection.repoFullName}</p>
            
            <p className="my-4 p-4 bg-secondary rounded">(Main App UI Placeholder - File Tree & Editor will go here)</p>
            
            {/* Sign Out Button */} 
            <form action={signOut} className="mt-4">
               <Button type="submit" variant="destructive" size="sm">
                  Sign Out
               </Button>
             </form>
          </div>
        )}
      </div>
    </div>
  );
} 