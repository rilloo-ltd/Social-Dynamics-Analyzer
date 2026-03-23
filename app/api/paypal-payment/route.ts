import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, recordAnalyticsEvent, updateUserTier } from '@/lib/firestore-admin';

async function safeRecordPaymentEvent(event: Parameters<typeof recordAnalyticsEvent>[0]) {
  try {
    await recordAnalyticsEvent(event);
  } catch (error) {
    console.error('Failed to record PayPal payment analytics event:', error);
  }
}

// Verify PayPal payment on server-side
async function verifyPayPalPayment(orderId: string): Promise<boolean> {
  const PAYPAL_API = process.env.PAYPAL_API_URL || 'https://api-m.sandbox.paypal.com';
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

    // Verify the order
    const orderResponse = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });

    const orderData = await orderResponse.json();

    // Check if payment was completed
    return orderData.status === 'COMPLETED';
  } catch (error) {
    console.error('PayPal verification error:', error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, orderId, tier, amount } = await req.json();

    if (!userId || !orderId || !tier) {
      await safeRecordPaymentEvent({
        category: 'payment',
        eventName: 'tier_purchase_failed',
        status: 'failed',
        userId: userId || null,
        tier: tier || null,
        endpoint: '/api/paypal-payment',
        errorCode: 'missing_fields',
        message: 'Missing required PayPal payment fields',
        metadata: { orderId: orderId || null, amount: amount ?? null },
      });
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify the payment with PayPal
    const isValid = await verifyPayPalPayment(orderId);

    if (!isValid) {
      await safeRecordPaymentEvent({
        category: 'payment',
        eventName: 'tier_purchase_failed',
        status: 'failed',
        userId,
        tier,
        endpoint: '/api/paypal-payment',
        errorCode: 'verification_failed',
        message: 'Payment verification failed',
        metadata: { orderId, amount: amount ?? null },
      });
      return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 });
    }

    // Expected amounts
    const expectedAmounts = {
      basic: 5.00,
      super: 30
    };

    if (amount !== expectedAmounts[tier as keyof typeof expectedAmounts]) {
      await safeRecordPaymentEvent({
        category: 'payment',
        eventName: 'tier_purchase_failed',
        status: 'failed',
        userId,
        tier,
        endpoint: '/api/paypal-payment',
        errorCode: 'invalid_amount',
        message: 'Payment amount did not match expected tier price',
        metadata: { orderId, amount },
      });
      return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 });
    }

    // Update user tier in Firestore
    const maxUploads = tier === 'basic' ? 10 : 50;
    await updateUserTier(userId, tier as 'free' | 'basic' | 'super', maxUploads);
    await getAdminDb().collection('users').doc(userId).collection('transactions').add({
      type: 'tier_purchase',
      orderId,
      tier,
      amount,
      currency: 'USD',
      timestamp: new Date().toISOString(),
    });

    await safeRecordPaymentEvent({
      category: 'payment',
      eventName: 'tier_purchase_completed',
      status: 'completed',
      userId,
      tier,
      endpoint: '/api/paypal-payment',
      message: 'Tier purchase verified and applied',
      metadata: { orderId, amount },
    });

    console.log(`[PayPal] User ${userId} upgraded to ${tier} tier with order ${orderId}`);

    return NextResponse.json({ 
      success: true,
      tier,
      maxUploads,
      message: 'Payment verified and tier updated'
    });
  } catch (error) {
    await safeRecordPaymentEvent({
      category: 'payment',
      eventName: 'tier_purchase_failed',
      status: 'failed',
      endpoint: '/api/paypal-payment',
      errorCode: 'server_error',
      message: error instanceof Error ? error.message : 'PayPal payment processing error',
    });
    console.error('PayPal payment processing error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
