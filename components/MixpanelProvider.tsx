'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { analytics, MixpanelEvents } from '@/lib/mixpanel';
import { User } from 'firebase/auth';

interface MixpanelProviderProps {
  user: User | null;
  children: React.ReactNode;
}

export function MixpanelProvider({ user, children }: MixpanelProviderProps) {
  const pathname = usePathname();

  // Identify user when logged in
  useEffect(() => {
    if (user) {
      analytics.identify(user.uid);
      analytics.setUserProperties({
        email: user.email,
        display_name: user.displayName || undefined,
        $email: user.email, // Mixpanel special property
        $name: user.displayName || undefined, // Mixpanel special property
      });
      
      // Set first seen date (only once)
      analytics.setUserPropertyOnce('first_seen', new Date().toISOString());
    } else {
      analytics.reset();
    }
  }, [user]);

  // Track page views
  useEffect(() => {
    const pageName = pathname === '/' ? 'Home' : 
                     pathname === '/login' ? 'Login' : 
                     pathname === '/signup' ? 'Sign Up' : 
                     pathname === '/admin' ? 'Admin' : 
                     pathname;

    analytics.trackPageView(pageName, {
      user_id: user?.uid,
      is_authenticated: !!user,
    });
  }, [pathname, user]);

  return <>{children}</>;
}
