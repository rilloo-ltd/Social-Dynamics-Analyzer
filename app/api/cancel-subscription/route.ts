import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, recordAnalyticsEvent } from '@/lib/firestore-admin';

async function safeRecordPaymentEvent(event: Parameters<typeof recordAnalyticsEvent>[0]) {
  try {
    await recordAnalyticsEvent(event);
  } catch (error) {
    console.error('Failed to record cancel-subscription analytics event:', error);
  }
}

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

async function cancelPayPalSubscription(subscriptionId: string): Promise<boolean> {
  const PAYPAL_API = process.env.PAYPAL_API_URL || 'https://api-m.paypal.com';
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;

  if (!clientId || !secret) {
    throw new Error('PayPal credentials missing');
  }

  try {
    // Get access token
    const authResponse = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': `Basic ${Buffer.from(`${clientId}:${secret}`).toString('base64')}`
      },
      body: 'grant_type=client_credentials'
    });

    const authData = await authResponse.json();
    const accessToken = authData.access_token;

    // Cancel the subscription
    const cancelResponse = await fetch(
      `${PAYPAL_API}/v1/billing/subscriptions/${subscriptionId}/cancel`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          reason: 'User requested cancellation'
        })
      }
    );

    return cancelResponse.status === 204;
  } catch (error) {
    console.error('PayPal cancellation error:', error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, subscriptionId } = await req.json();

    if (!userId || !subscriptionId) {
      await safeRecordPaymentEvent({
        category: 'payment',
        eventName: 'subscription_cancelled',
        status: 'failed',
        userId: userId || null,
        endpoint: '/api/cancel-subscription',
        errorCode: 'missing_fields',
        message: 'Missing required cancellation fields',
        metadata: { subscriptionId: subscriptionId || null },
      });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify authentication token
    const authHeader = req.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      await safeRecordPaymentEvent({
        category: 'payment',
        eventName: 'subscription_cancelled',
        status: 'failed',
        userId,
        endpoint: '/api/cancel-subscription',
        errorCode: 'missing_token',
        message: 'Missing bearer token for cancellation request',
        metadata: { subscriptionId },
      });
      return NextResponse.json({ error: 'Unauthorized - Missing token' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    const adminAuth = getAdminAuth();
    
    if (!adminAuth) {
      await safeRecordPaymentEvent({
        category: 'payment',
        eventName: 'subscription_cancelled',
        status: 'failed',
        userId,
        endpoint: '/api/cancel-subscription',
        errorCode: 'auth_unavailable',
        message: 'Server authentication unavailable during cancellation',
        metadata: { subscriptionId },
      });
      return NextResponse.json({ error: 'Server authentication error' }, { status: 500 });
    }

    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      
      // Verify the requesting user matches the userId
      if (decodedToken.uid !== userId) {
        await safeRecordPaymentEvent({
          category: 'payment',
          eventName: 'subscription_cancelled',
          status: 'failed',
          userId,
          endpoint: '/api/cancel-subscription',
          errorCode: 'forbidden_user_mismatch',
          message: 'User attempted to cancel another user subscription',
          metadata: { subscriptionId },
        });
        return NextResponse.json({ error: 'Unauthorized - Cannot cancel other user subscriptions' }, { status: 403 });
      }
    } catch (authError) {
      await safeRecordPaymentEvent({
        category: 'payment',
        eventName: 'subscription_cancelled',
        status: 'failed',
        userId,
        endpoint: '/api/cancel-subscription',
        errorCode: 'invalid_token',
        message: 'Invalid authentication token for cancellation request',
        metadata: { subscriptionId },
      });
      console.error('Token verification failed:', authError);
      return NextResponse.json({ error: 'Invalid authentication token' }, { status: 401 });
    }

    // Cancel subscription with PayPal
    const cancelled = await cancelPayPalSubscription(subscriptionId);

    if (!cancelled) {
      await safeRecordPaymentEvent({
        category: 'payment',
        eventName: 'subscription_cancelled',
        status: 'failed',
        userId,
        endpoint: '/api/cancel-subscription',
        errorCode: 'paypal_cancel_failed',
        message: 'Failed to cancel subscription with PayPal',
        metadata: { subscriptionId },
      });
      return NextResponse.json({ error: 'Failed to cancel subscription with PayPal' }, { status: 400 });
    }

    // Update user in Firestore
    const db = getAdminDb();
    await db.collection('users').doc(userId).update({
      subscriptionStatus: 'CANCELLED',
      updatedAt: new Date().toISOString()
    });

    // Log the cancellation
    await db.collection('users').doc(userId).collection('transactions').add({
      type: 'subscription_cancelled',
      subscriptionId,
      timestamp: new Date().toISOString()
    });

    await safeRecordPaymentEvent({
      category: 'payment',
      eventName: 'subscription_cancelled',
      status: 'completed',
      userId,
      endpoint: '/api/cancel-subscription',
      message: 'Subscription cancelled successfully',
      metadata: { subscriptionId },
    });

    console.log(`[PayPal] Subscription ${subscriptionId} cancelled for user ${userId}`);

    return NextResponse.json({ 
      success: true,
      message: 'Subscription cancelled successfully'
    });
  } catch (error) {
    await safeRecordPaymentEvent({
      category: 'payment',
      eventName: 'subscription_cancelled',
      status: 'failed',
      endpoint: '/api/cancel-subscription',
      errorCode: 'server_error',
      message: error instanceof Error ? error.message : 'Cancel subscription server error',
    });
    console.error('Cancel subscription error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
