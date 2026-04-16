import 'server-only';

import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firestore-admin';
import { normalizeEmail } from '@/lib/admin-identity';
import { logger } from '@/lib/logger';

export interface AuthenticatedRequestContext {
  userId: string;
  userEmail: string | null;
}

type AuthResult =
  | { ok: true; context: AuthenticatedRequestContext }
  | { ok: false; response: NextResponse };

function getAdminAuth() {
  try {
    const admin = require('firebase-admin');

    if (!admin.apps.length) {
      getAdminDb();
    }

    return admin.auth();
  } catch (error) {
    logger.error('Failed to initialize Firebase Admin auth for request', {}, error instanceof Error ? error : undefined);
    return null;
  }
}

export async function requireAuthenticatedRequest(
  request: NextRequest,
  expectedUserId?: string | null
): Promise<AuthResult> {
  const authHeader = request.headers.get('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized - Missing token' }, { status: 401 }),
    };
  }

  const adminAuth = getAdminAuth();

  if (!adminAuth) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Server authentication error' }, { status: 500 }),
    };
  }

  try {
    const decodedToken = await adminAuth.verifyIdToken(authHeader.substring(7));

    if (expectedUserId && decodedToken.uid !== expectedUserId) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Unauthorized - Cannot access another user' }, { status: 403 }),
      };
    }

    return {
      ok: true,
      context: {
        userId: decodedToken.uid,
        userEmail: normalizeEmail(decodedToken.email) || null,
      },
    };
  } catch (error) {
    logger.warning('Request token verification failed', {}, error instanceof Error ? error : undefined);
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 }),
    };
  }
}

export async function userOwnsSession(userId: string, sessionId?: string | null): Promise<boolean> {
  if (!userId || !sessionId) {
    return false;
  }

  const db = getAdminDb();
  const sessionDoc = await db.collection('users').doc(userId).collection('sessions').doc(sessionId).get();
  return sessionDoc.exists;
}
