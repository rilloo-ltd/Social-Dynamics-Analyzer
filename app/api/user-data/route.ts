import { NextRequest, NextResponse } from 'next/server';
import {
  ensureUserInitialized,
  getAdminDb,
  getRollingSubmissionQuota,
  MAX_SUBMISSIONS_PER_WINDOW,
} from '@/lib/firestore-admin';

// Get Firebase Admin Auth
function getAdminAuth() {
  try {
    const admin = require('firebase-admin');
    
    // Ensure Firebase Admin is initialized first
    if (!admin.apps.length) {
      // Initialize by calling getAdminDb which handles the init
      getAdminDb();
    }
    
    return admin.auth();
  } catch (error) {
    console.error('Error getting admin auth:', error);
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    let authenticatedEmail: string | undefined;

    if (!userId) {
      return NextResponse.json({ error: 'Missing userId' }, { status: 400 });
    }

    // Verify authentication token
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized - Missing token' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const adminAuth = getAdminAuth();
    
    if (!adminAuth) {
      return NextResponse.json({ error: 'Server authentication error' }, { status: 500 });
    }

    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      
      // Verify the requesting user matches the userId being queried
      if (decodedToken.uid !== userId) {
        return NextResponse.json({ error: 'Unauthorized - Cannot access other user data' }, { status: 403 });
      }

      authenticatedEmail = decodedToken.email || undefined;
    } catch (authError) {
      console.error('Token verification failed:', authError);
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    const db = getAdminDb();
    await ensureUserInitialized(userId, authenticatedEmail);
    const submissionQuota = await getRollingSubmissionQuota(userId);

    // Get user data
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      return NextResponse.json({ 
        success: true, 
        userData: {
          tier: 'free',
          maxDailyUploads: MAX_SUBMISSIONS_PER_WINDOW,
          totalUploadsUsed: 0
        },
        transactions: [],
        submissionQuota,
        uploadsToday: submissionQuota.currentCount
      });
    }

    const userData = userDoc.data();
    const totalUploadsUsed = typeof userData?.totalUploadsUsed === 'number' ? userData.totalUploadsUsed : 0;

    // Get transactions
    const transactionsSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('transactions')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();

    const transactions = transactionsSnapshot.docs.map((doc: any) => ({
      id: doc.id,
      ...doc.data()
    }));

    return NextResponse.json({ 
      success: true,
      userData: {
        ...userData,
        tier: userData?.tier || 'free',
        maxDailyUploads: MAX_SUBMISSIONS_PER_WINDOW,
        totalUploadsUsed
      },
      transactions,
      submissionQuota,
      uploadsToday: submissionQuota.currentCount
    });
  } catch (error) {
    console.error('Error fetching user data:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
