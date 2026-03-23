import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb, recordAnalyticsEvent } from '@/lib/firestore-admin';

async function safeRecordPaymentEvent(event: Parameters<typeof recordAnalyticsEvent>[0]) {
  try {
    await recordAnalyticsEvent(event);
  } catch (error) {
    console.error('Failed to record PayPal webhook analytics event:', error);
  }
}

// Verify PayPal webhook signature
async function verifyWebhookSignature(
  headers: Headers,
  body: any
): Promise<boolean> {
  // In production, implement proper webhook signature verification
  // https://developer.paypal.com/api/rest/webhooks/rest/#verify-webhook-signature
  
  const PAYPAL_API = process.env.PAYPAL_API_URL || 'https://api-m.paypal.com';
  const clientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;

  if (!clientId || !secret || !webhookId) {
    console.warn('PayPal webhook verification credentials missing');
    return true; // Allow in dev, but should fail in production
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

    // Verify webhook signature
    const verifyResponse = await fetch(`${PAYPAL_API}/v1/notifications/verify-webhook-signature`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({
        transmission_id: headers.get('paypal-transmission-id'),
        transmission_time: headers.get('paypal-transmission-time'),
        cert_url: headers.get('paypal-cert-url'),
        auth_algo: headers.get('paypal-auth-algo'),
        transmission_sig: headers.get('paypal-transmission-sig'),
        webhook_id: webhookId,
        webhook_event: body
      })
    });

    const verifyData = await verifyResponse.json();
    return verifyData.verification_status === 'SUCCESS';
  } catch (error) {
    console.error('Webhook verification error:', error);
    return false;
  }
}

async function findUserBySubscriptionId(subscriptionId: string): Promise<string | null> {
  const db = getAdminDb();
  
  try {
    const usersSnapshot = await db.collection('users')
      .where('subscriptionId', '==', subscriptionId)
      .limit(1)
      .get();
    
    if (usersSnapshot.empty) {
      return null;
    }
    
    return usersSnapshot.docs[0].id;
  } catch (error) {
    console.error('Error finding user by subscription ID:', error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const eventType = body.event_type;
    const resource = body.resource;

    console.log(`[PayPal Webhook] Received event: ${eventType}`);

    // Verify webhook signature for security
    const isValid = await verifyWebhookSignature(req.headers, body);
    if (!isValid) {
      await safeRecordPaymentEvent({
        category: 'payment',
        eventName: 'paypal_webhook_invalid_signature',
        status: 'failed',
        endpoint: '/api/paypal-webhook',
        errorCode: 'invalid_signature',
        message: 'Invalid PayPal webhook signature',
        metadata: { eventType },
      });
      console.error('[PayPal Webhook] Invalid signature - rejecting request');
      return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
    }

    const db = getAdminDb();

    switch (eventType) {
      case 'BILLING.SUBSCRIPTION.ACTIVATED':
        // Subscription activated - already handled in /api/paypal-subscription
        console.log(`[Webhook] Subscription activated: ${resource.id}`);
        await safeRecordPaymentEvent({
          category: 'payment',
          eventName: 'subscription_activated',
          status: 'completed',
          endpoint: '/api/paypal-webhook',
          message: 'PayPal webhook reported subscription activation',
          metadata: { eventType, subscriptionId: resource.id || null },
        });
        break;

      case 'BILLING.SUBSCRIPTION.RENEWED':
      case 'PAYMENT.SALE.COMPLETED':
        // Monthly payment successful
        const userId = await findUserBySubscriptionId(resource.id || resource.billing_agreement_id);
        
        if (userId) {
          await db.collection('users').doc(userId).collection('transactions').add({
            type: 'subscription_payment',
            subscriptionId: resource.id || resource.billing_agreement_id,
            amount: parseFloat(resource.amount?.total || '0'),
            currency: resource.amount?.currency || 'USD',
            timestamp: new Date().toISOString()
          });

          await safeRecordPaymentEvent({
            category: 'payment',
            eventName: 'subscription_renewed',
            status: 'completed',
            userId,
            endpoint: '/api/paypal-webhook',
            message: 'Subscription renewal payment recorded',
            metadata: {
              eventType,
              subscriptionId: resource.id || resource.billing_agreement_id || null,
              amount: parseFloat(resource.amount?.total || '0'),
              currency: resource.amount?.currency || 'USD',
            },
          });
          
          console.log(`[Webhook] Payment recorded for user ${userId}`);
        } else {
          await safeRecordPaymentEvent({
            category: 'payment',
            eventName: 'subscription_renewed',
            status: 'failed',
            endpoint: '/api/paypal-webhook',
            errorCode: 'user_not_found',
            message: 'Could not match renewal webhook to a user',
            metadata: {
              eventType,
              subscriptionId: resource.id || resource.billing_agreement_id || null,
            },
          });
        }
        break;

      case 'BILLING.SUBSCRIPTION.CANCELLED':
        // User cancelled subscription
        const cancelledUserId = await findUserBySubscriptionId(resource.id);
        
        if (cancelledUserId) {
          await db.collection('users').doc(cancelledUserId).update({
            subscriptionStatus: 'CANCELLED',
            tier: 'free',
            maxDailyUploads: 3,
            updatedAt: new Date().toISOString()
          });
          
          await db.collection('users').doc(cancelledUserId).collection('transactions').add({
            type: 'subscription_cancelled',
            subscriptionId: resource.id,
            timestamp: new Date().toISOString()
          });

          await safeRecordPaymentEvent({
            category: 'payment',
            eventName: 'subscription_cancelled',
            status: 'completed',
            userId: cancelledUserId,
            endpoint: '/api/paypal-webhook',
            message: 'Subscription cancellation recorded from webhook',
            metadata: {
              eventType,
              subscriptionId: resource.id || null,
            },
          });
          
          console.log(`[Webhook] Subscription cancelled for user ${cancelledUserId}`);
        } else {
          await safeRecordPaymentEvent({
            category: 'payment',
            eventName: 'subscription_cancelled',
            status: 'failed',
            endpoint: '/api/paypal-webhook',
            errorCode: 'user_not_found',
            message: 'Could not match cancellation webhook to a user',
            metadata: {
              eventType,
              subscriptionId: resource.id || null,
            },
          });
        }
        break;

      case 'BILLING.SUBSCRIPTION.SUSPENDED':
        // Subscription suspended (payment failed)
        const suspendedUserId = await findUserBySubscriptionId(resource.id);
        
        if (suspendedUserId) {
          await db.collection('users').doc(suspendedUserId).update({
            subscriptionStatus: 'SUSPENDED',
            tier: 'free',
            maxDailyUploads: 3,
            updatedAt: new Date().toISOString()
          });

          await safeRecordPaymentEvent({
            category: 'payment',
            eventName: 'subscription_suspended',
            status: 'failed',
            userId: suspendedUserId,
            endpoint: '/api/paypal-webhook',
            message: 'Subscription suspended webhook received',
            metadata: {
              eventType,
              subscriptionId: resource.id || null,
            },
          });
          
          console.log(`[Webhook] Subscription suspended for user ${suspendedUserId}`);
        } else {
          await safeRecordPaymentEvent({
            category: 'payment',
            eventName: 'subscription_suspended',
            status: 'failed',
            endpoint: '/api/paypal-webhook',
            errorCode: 'user_not_found',
            message: 'Could not match suspension webhook to a user',
            metadata: {
              eventType,
              subscriptionId: resource.id || null,
            },
          });
        }
        break;

      case 'BILLING.SUBSCRIPTION.EXPIRED':
        // Subscription expired
        const expiredUserId = await findUserBySubscriptionId(resource.id);
        
        if (expiredUserId) {
          await db.collection('users').doc(expiredUserId).update({
            subscriptionStatus: 'EXPIRED',
            tier: 'free',
            maxDailyUploads: 3,
            updatedAt: new Date().toISOString()
          });

          await safeRecordPaymentEvent({
            category: 'payment',
            eventName: 'subscription_expired',
            status: 'failed',
            userId: expiredUserId,
            endpoint: '/api/paypal-webhook',
            message: 'Subscription expiration webhook received',
            metadata: {
              eventType,
              subscriptionId: resource.id || null,
            },
          });
          
          console.log(`[Webhook] Subscription expired for user ${expiredUserId}`);
        } else {
          await safeRecordPaymentEvent({
            category: 'payment',
            eventName: 'subscription_expired',
            status: 'failed',
            endpoint: '/api/paypal-webhook',
            errorCode: 'user_not_found',
            message: 'Could not match expiration webhook to a user',
            metadata: {
              eventType,
              subscriptionId: resource.id || null,
            },
          });
        }
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${eventType}`);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    await safeRecordPaymentEvent({
      category: 'payment',
      eventName: 'paypal_webhook_failed',
      status: 'failed',
      endpoint: '/api/paypal-webhook',
      errorCode: 'server_error',
      message: error instanceof Error ? error.message : 'Webhook processing failed',
    });
    console.error('Webhook processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
