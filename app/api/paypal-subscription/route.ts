import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/firestore-admin';

// Verify PayPal subscription on server-side
async function verifyPayPalSubscription(subscriptionId: string): Promise<{
  valid: boolean;
  status?: string;
  planId?: string;
  nextBillingTime?: string;
}> {
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

    // Verify the subscription
    const subscriptionResponse = await fetch(`${PAYPAL_API}/v1/billing/subscriptions/${subscriptionId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const subscriptionData = await subscriptionResponse.json();

    // Check if subscription is active
    return {
      valid: subscriptionData.status === 'ACTIVE',
      status: subscriptionData.status,
      planId: subscriptionData.plan_id,
      nextBillingTime: subscriptionData.billing_info?.next_billing_time
    };
  } catch (error) {
    console.error('PayPal subscription verification error:', error);
    return { valid: false };
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, subscriptionId, tier } = await req.json();

    if (!userId || !subscriptionId || !tier) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify the subscription with PayPal
    const verification = await verifyPayPalSubscription(subscriptionId);

    if (!verification.valid) {
      return NextResponse.json({ error: 'Subscription verification failed' }, { status: 400 });
    }

    // Determine max uploads based on tier
    const maxUploads = tier === 'basic' ? 10 : 50;

    // Update user in Firestore with subscription details
    const db = getAdminDb();
    await db.collection('users').doc(userId).set({
      tier,
      maxDailyUploads: maxUploads,
      subscriptionId,
      subscriptionStatus: verification.status,
      subscriptionPlanId: verification.planId,
      subscriptionStartDate: new Date().toISOString(),
      nextBillingDate: verification.nextBillingTime,
      updatedAt: new Date().toISOString()
    }, { merge: true });

    // Log the transaction
    await db.collection('users').doc(userId).collection('transactions').add({
      type: 'subscription_activated',
      subscriptionId,
      tier,
      amount: tier === 'basic' ? 0.10 : 30.00,
      currency: 'USD',
      timestamp: new Date().toISOString()
    });

    console.log(`[PayPal] User ${userId} activated subscription ${subscriptionId} for ${tier} tier`);

    return NextResponse.json({ 
      success: true,
      tier,
      maxUploads,
      status: verification.status,
      nextBillingDate: verification.nextBillingTime,
      message: 'Subscription verified and activated'
    });
  } catch (error) {
    console.error('PayPal subscription processing error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
