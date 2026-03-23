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
  const [isAdmin, setIsAdmin] = useState(false);

  // Step 1: resolve Firebase auth state
  useEffect(() => {
    const stored = getStoredTestAuthEmail();
    setTestAuthEmail(stored);

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setAuthUser(user);
      if (user) {
        setTestAuthEmail(null);
      } else {
        const s = getStoredTestAuthEmail();
        setTestAuthEmail(s);
        // Dev test-header path: no UID, fall back to email list
        setIsAdmin(s ? isAllowedAdminEmail(s) : false);
        setChecking(false);
      }
    });

    return () => unsubscribe();
  }, []);

  // Step 2: once a real Firebase user is known, ask the API (checks Firestore isAdmin)
  useEffect(() => {
    if (!authUser) return;

    setChecking(true);
    let cancelled = false;

    authUser.getIdToken()
      .then((token) =>
        fetch('/api/check-admin', {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          cache: 'no-store',
        })
      )
      .then((res) => res.json())
      .then((data) => { if (!cancelled) setIsAdmin(data.isAdmin === true); })
      .catch(() => { if (!cancelled) setIsAdmin(false); })
      .finally(() => { if (!cancelled) setChecking(false); });

    return () => { cancelled = true; };
  }, [authUser]);

  const visibleEmail = authUser?.email || testAuthEmail || null;

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
