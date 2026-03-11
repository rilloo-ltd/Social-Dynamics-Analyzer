import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firestore-admin';

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
      const userId = decodedToken.uid;

      const db = getAdminDb();
      const userDoc = await db.collection('users').doc(userId).get();
      
      const isAdmin = userDoc.exists && userDoc.data()?.isAdmin === true;

      return NextResponse.json({ 
        success: true,
        isAdmin
      });
    } catch (authError) {
      console.error('Token verification failed:', authError);
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }
  } catch (error) {
    console.error('Error checking admin status:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
