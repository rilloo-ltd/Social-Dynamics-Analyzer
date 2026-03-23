'use client';

import { useCallback, useEffect, useState } from 'react';
import { User as FirebaseUser, onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getStoredTestAuthEmail } from '@/lib/auth';
import { isAllowedAdminEmail, normalizeEmail } from '@/lib/admin-identity';

export function useAdminAccess() {
  const [authUser, setAuthUser] = useState<FirebaseUser | null>(null);
  const [testAuthEmail, setTestAuthEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    setTestAuthEmail(getStoredTestAuthEmail());

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      if (user) {
        setTestAuthEmail(null);
      } else {
        setTestAuthEmail(getStoredTestAuthEmail());
      }
      setChecking(false);
    });

    return () => unsubscribe();
  }, []);

  const visibleEmail = authUser?.email || testAuthEmail || null;
  const isAdmin = isAllowedAdminEmail(visibleEmail);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    if (authUser) {
      const token = await authUser.getIdToken();
      return {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      };
    }

    if (testAuthEmail) {
      return {
        'x-test-auth-email': normalizeEmail(testAuthEmail),
        'Content-Type': 'application/json',
      };
    }

    return {
      'Content-Type': 'application/json',
    };
  }, [authUser, testAuthEmail]);

  return {
    authUser,
    visibleEmail,
    isAdmin,
    checking,
    getAuthHeaders,
  };
}
