import { NextRequest, NextResponse } from 'next/server';
import { updateUserTier } from '@/lib/firestore-admin';

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
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify the payment with PayPal
    const isValid = await verifyPayPalPayment(orderId);

    if (!isValid) {
      return NextResponse.json({ error: 'Payment verification failed' }, { status: 400 });
    }

    // Expected amounts
    const expectedAmounts = {
      basic: 0.10,
      super: 30
    };

    if (amount !== expectedAmounts[tier as keyof typeof expectedAmounts]) {
      return NextResponse.json({ error: 'Invalid payment amount' }, { status: 400 });
    }

    // Update user tier in Firestore
    const maxUploads = tier === 'basic' ? 10 : 50;
    await updateUserTier(userId, tier as 'free' | 'basic' | 'super', maxUploads);

    console.log(`[PayPal] User ${userId} upgraded to ${tier} tier with order ${orderId}`);

    return NextResponse.json({ 
      success: true,
      tier,
      maxUploads,
      message: 'Payment verified and tier updated'
    });
  } catch (error) {
    console.error('PayPal payment processing error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
