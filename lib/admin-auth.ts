import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from './firestore-admin';
import { logger } from './logger';
import { isAllowedAdminEmail, normalizeEmail } from './admin-identity';

export interface AdminRequestIdentity {
  uid: string | null;
  email: string;
  authMode: 'firebase' | 'test-header';
}

function getAdminAuth() {
  try {
    const admin = require('firebase-admin');

    if (!admin.apps.length) {
      getAdminDb();
    }

    return admin.auth();
  } catch (error) {
    logger.error('Failed to initialize Firebase Admin auth for admin request', {}, error);
    return null;
  }
}

async function syncAdminIdentity(uid: string | null, email: string) {
  if (!uid) {
    return;
  }

  try {
    await getAdminDb().collection('users').doc(uid).set({
      email,
      isAdmin: true,
      adminSyncedAt: new Date().toISOString(),
    }, { merge: true });
  } catch (error) {
    logger.warning('Failed to sync admin identity to Firestore', { uid, email }, error);
  }
}

function getDevelopmentTestAdminEmail(req: NextRequest): string | null {
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  const candidate = normalizeEmail(req.headers.get('x-test-auth-email'));
  return isAllowedAdminEmail(candidate) ? candidate : null;
}

export async function requireAdminRequest(
  req: NextRequest
): Promise<{ ok: true; identity: AdminRequestIdentity } | { ok: false; response: NextResponse }> {
  const authHeader = req.headers.get('authorization');

  if (authHeader?.startsWith('Bearer ')) {
    const adminAuth = getAdminAuth();

    if (!adminAuth) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Server authentication error' }, { status: 500 }),
      };
    }

    try {
      const decodedToken = await adminAuth.verifyIdToken(authHeader.substring(7));
      const uid = decodedToken.uid;
      const email = normalizeEmail(decodedToken.email);

      // Check Firestore isAdmin flag — set via scripts/set-admin.js or admin SDK
      const userDoc = await getAdminDb().collection('users').doc(uid).get();
      if (!userDoc.exists || userDoc.data()?.isAdmin !== true) {
        return {
          ok: false,
          response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
        };
      }

      await syncAdminIdentity(uid, email);

      return {
        ok: true,
        identity: {
          uid,
          email,
          authMode: 'firebase',
        },
      };
    } catch (error) {
      logger.warning('Admin token verification failed', {}, error);
      return {
        ok: false,
        response: NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 }),
      };
    }
  }

  const testAdminEmail = getDevelopmentTestAdminEmail(req);
  if (testAdminEmail) {
    return {
      ok: true,
      identity: {
        uid: null,
        email: testAdminEmail,
        authMode: 'test-header',
      },
    };
  }

  return {
    ok: false,
    response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
  };
}
