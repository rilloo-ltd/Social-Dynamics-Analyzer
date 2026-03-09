'use client';

import { useEffect, useState, ReactNode } from 'react';
import { auth } from '@/lib/firebase';
import { User } from 'firebase/auth';
import { MixpanelProvider } from './MixpanelProvider';

interface ClientLayoutProps {
  children: ReactNode;
}

export function ClientLayout({ children }: ClientLayoutProps) {
  const [authUser, setAuthUser] = useState<User | null>(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setAuthUser(user);
    });

    return () => unsubscribe();
  }, []);

  return (
    <MixpanelProvider user={authUser}>
      {children}
    </MixpanelProvider>
  );
}
