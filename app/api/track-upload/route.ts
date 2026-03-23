import { NextRequest, NextResponse } from 'next/server';
import { checkDailyUploadLimit, incrementDailyUpload, getUserTier, ensureUserInitialized, recordAnalyticsEvent } from '@/lib/firestore-admin';

export async function POST(req: NextRequest) {
  try {
    let body: { userId?: string; action?: string };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid or missing JSON body' }, { status: 400 });
    }
    const { userId, action } = body;

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    // Ensure user document exists with defaults before checking tier
    await ensureUserInitialized(userId);

    // Get user's tier and max uploads from database
    const { tier, maxDailyUploads } = await getUserTier(userId);

    if (action === 'check') {
      const result = await checkDailyUploadLimit(userId, maxDailyUploads);
      const limitMessage = tier === 'free'
        ? 'מיצית את מכסת הניתוחים שלך. כדי להמשיך לקבל ניתוחים צריך להצטרף למנוי.'
        : 'הגעת למכסת הניתוחים שלך כרגע. אפשר לנסות שוב אחרי חידוש המכסה או לשדרג את המנוי.';

      if (!result.canUpload) {
        await recordAnalyticsEvent({
          category: 'analysis',
          eventName: 'analysis_rejected_limit',
          status: 'rejected',
          userId,
          tier,
          message: tier === 'free'
            ? 'Analysis rejected because the free overall limit was reached'
            : 'Analysis rejected because the daily limit was reached',
          metadata: {
            currentCount: result.currentCount,
            maxUploads: maxDailyUploads,
            limitKind: tier === 'free' ? 'overall' : 'daily',
          },
        }).catch(() => {});
      }
      return NextResponse.json({ 
        canUpload: result.canUpload, 
        error: result.canUpload ? null : limitMessage,
        currentCount: result.currentCount, 
        maxUploads: maxDailyUploads,
        remainingUploads: result.remainingUploads
      });
    } else if (action === 'increment') {
      try {
        const result = await incrementDailyUpload(userId, maxDailyUploads);
        return NextResponse.json({
          ...result,
          maxUploads: maxDailyUploads,
        });
      } catch (error: any) {
        if (error.message === 'Daily upload limit reached') {
          await recordAnalyticsEvent({
            category: 'analysis',
            eventName: 'analysis_rejected_limit',
            status: 'rejected',
            userId,
            tier,
            message: 'Analysis increment rejected because daily limit was reached',
            metadata: {
              currentCount: maxDailyUploads,
              maxUploads: maxDailyUploads,
              limitKind: tier === 'free' ? 'overall' : 'daily',
            },
          }).catch(() => {});
          return NextResponse.json({ 
            error: tier === 'free'
              ? 'מיצית את מכסת הניתוחים שלך. כדי להמשיך לקבל ניתוחים צריך להצטרף למנוי.'
              : 'הגעת למכסת הניתוחים שלך כרגע. אפשר לנסות שוב אחרי חידוש המכסה או לשדרג את המנוי.',
            currentCount: maxDailyUploads,
            maxUploads: maxDailyUploads,
            remainingUploads: 0,
          }, { status: 429 });
        }
        throw error;
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Track upload error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
