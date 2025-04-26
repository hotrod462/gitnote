"use client";

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client'; // Use client helper
import { Button } from "@/components/ui/button";
import { signInWithGithub } from "@/lib/actions/auth";

export default function Home() {
  const router = useRouter();
  const supabase = createClient(); // Use client-side Supabase client

  useEffect(() => {
    const checkSessionAndRedirect = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/notes'); // Redirect if session exists
      }
    };

    // Initial check when component mounts
    checkSessionAndRedirect();

    // Listen for auth state changes (e.g., after redirect)
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // SIGNED_IN event typically fires after the redirect with session info
        if (event === 'SIGNED_IN' && session) {
          router.push('/notes');
        }
        // Optional: Handle SIGNED_OUT if needed on this page
        // if (event === 'SIGNED_OUT') {
        //   // Maybe update UI if needed, though middleware should handle redirects away
        // }
      }
    );

    // Cleanup listener on unmount
    return () => {
      authListener?.subscription.unsubscribe();
    };
  }, [supabase, router]); // Dependencies

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-8">GitSync</h1>
        <p className="text-xl text-muted-foreground mb-12">
          Drag and drop sync your files to your GitHub repo
        </p>
      </div>
      <form action={signInWithGithub}>
        <Button 
          type="submit" 
          variant="outline" 
          size="lg"
          className="dark:bg-white dark:text-black dark:hover:bg-gray-200"
        >
          {/* Optional: Add GitHub icon later */}
          Sign In with GitHub
        </Button>
      </form>
    </main>
  );
}
