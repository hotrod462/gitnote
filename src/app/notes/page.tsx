import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { signOut } from '@/lib/actions/auth'; // Import the sign out action
import { Button } from '@/components/ui/button'; // Import Button
import { checkUserConnectionStatus } from '@/lib/actions/githubConnections'; // Import the action
import ConnectRepoPrompt from '@/components/ConnectRepoPrompt'; // Import the actual component
import SelectRepoPrompt from '@/components/SelectRepoPrompt'; // Import the actual component
// Import Resizable components
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
// Import placeholder UI components
import FileTree from '@/components/FileTree';
import Editor from '@/components/Editor';

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

  // Move the main layout logic outside the return for clarity
  let content: React.ReactNode;

  if (connection.status === 'NO_CONNECTION') {
    content = (
      <div className="flex items-center justify-center h-full">
         <div className="w-full max-w-md p-6 border rounded-lg shadow-sm bg-card text-card-foreground">
           <ConnectRepoPrompt />
         </div>
      </div>
     );
  } else if (connection.status === 'CONNECTION_NO_REPO') {
     content = (
      <div className="flex items-center justify-center h-full">
        <div className="w-full max-w-md p-6 border rounded-lg shadow-sm bg-card text-card-foreground">
          <SelectRepoPrompt installationId={connection.installationId} />
        </div>
       </div>
     );
  } else { // CONNECTED status
    content = (
      <ResizablePanelGroup direction="horizontal" className="h-full max-h-screen rounded-lg border">
        <ResizablePanel defaultSize={25} minSize={15} maxSize={40}>
          {/* File Tree Panel */}
          <div className="flex h-full items-center justify-center">
            <FileTree />
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={75} minSize={30}>
          {/* Editor Panel */}
          <div className="flex h-full items-center justify-center">
             <Editor />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    );
  }

  return (
    // Use full screen height and width for the main layout container
    <div className="h-screen w-screen flex flex-col">
      {/* Optional: Add a header/navbar here later */}
      {/* <header>...</header> */}
      
      {/* Main content area fills remaining space */}
      <main className="flex-grow overflow-hidden"> 
        {content} 
      </main>

      {/* Temporary Sign Out button location if needed during dev */}
      {connection.status === 'CONNECTED' && (
          <div className="absolute bottom-4 right-4">
            <form action={signOut}> 
                <Button type="submit" variant="outline" size="sm">
                    Sign Out
                </Button>
            </form>
          </div>
       )}
    </div>
  );
} 