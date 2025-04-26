'use client'
import React, { useEffect, useState } from 'react'; // Import React
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { createClient } from '@/lib/supabase/client'; // Import Supabase client
import type { User } from '@supabase/supabase-js'; // Import User type

if (typeof window !== 'undefined') {
  const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

  if (posthogKey && posthogHost) {
    posthog.init(posthogKey, {
      api_host: posthogHost,
      capture_pageview: false, // Disable automatic pageview capture, handle manually if needed
      autocapture: true, // *** Explicitly enable autocapture ***
      loaded: (posthog) => {
        // Ensure feature flags are loaded on init
        // This is useful if you plan to use PostHog feature flags later
        posthog.opt_in_capturing(); // Make sure capturing is enabled if you previously opted out
      }
    })
  } else {
      console.warn("PostHog key or host not configured. Analytics disabled.");
  }
}

export function CSPostHogProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null); // Use Supabase User type
  const [isLoading, setIsLoading] = useState(true);
  
  // Fetch Supabase user on mount
  useEffect(() => {
    const fetchUser = async () => {
        // Create client instance inside useEffect for client components
        const supabase = createClient(); 
        try {
            const { data: { user }, error } = await supabase.auth.getUser(); 
            if (error) throw error;
            setUser(user);
            console.log("CSPostHogProvider: Fetched user info", user?.id);
        } catch (error) {
            console.error("CSPostHogProvider: Error fetching Supabase user:", error);
            setUser(null); // Ensure user is null on error
        } finally {
            setIsLoading(false);
        }
    };
    fetchUser();
  }, []);

  // Identify user when user state changes
  useEffect(() => {
    if (user) {
      console.log("CSPostHogProvider: Identifying user", { id: user.id, email: user.email });
      posthog.identify(
        user.id, 
        {
          email: user.email, 
          // Add other properties if needed
        }
      );
    } else if (!isLoading) {
        // Optional: Reset PostHog identification if user logs out / is not logged in
        // console.log("CSPostHogProvider: User not logged in, resetting PostHog identity");
        // posthog.reset(); 
    }
  }, [user, isLoading]);

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
} 