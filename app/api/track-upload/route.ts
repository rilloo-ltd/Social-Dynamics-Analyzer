import { NextRequest, NextResponse } from 'next/server';
import {
  ensureUserInitialized,
  getRollingSubmissionQuota,
  logUpload,
  recordAnalyticsEvent,
  recordRollingSubmission,
} from '@/lib/firestore-admin';
import { requireAuthenticatedRequest } from '@/lib/request-auth';

const QUOTA_ERROR_MESSAGE = 'הגעת למכסת ההעלאות שלך כרגע. אפשר לשלוח עד 3 קבצים או טקסטים בכל 24 שעות.';

function withLegacyAliases(snapshot: Awaited<ReturnType<typeof getRollingSubmissionQuota>>) {
  return {
    ...snapshot,
    canUpload: snapshot.canSubmit,
    maxUploads: snapshot.maxSubmissions,
    remainingUploads: snapshot.remainingSubmissions,
  };
}

export async function POST(req: NextRequest) {
  try {
    let body: {
      userId?: string;
      action?: string;
      source?: 'primary_upload' | 'pasted_text' | 'ask_aunt_extra';
      participantsCount?: number;
      tokensCount?: number;
    };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid or missing JSON body' }, { status: 400 });
    }

    const auth = await requireAuthenticatedRequest(req, body.userId || null);
    if (!auth.ok) {
      return auth.response;
    }

    const { userId, userEmail } = auth.context;
    await ensureUserInitialized(userId, userEmail || undefined);

    const action = body.action || 'check';

    if (action === 'check') {
      const snapshot = await getRollingSubmissionQuota(userId);
      return NextResponse.json({
        ...withLegacyAliases(snapshot),
        error: snapshot.canSubmit ? null : QUOTA_ERROR_MESSAGE,
      });
    }

    if (action === 'record' || action === 'increment') {
      const snapshot = await recordRollingSubmission(userId, body.source || 'primary_upload');

      if (!snapshot.accepted) {
        return NextResponse.json({
          ...withLegacyAliases(snapshot),
          quotaExceeded: true,
          error: QUOTA_ERROR_MESSAGE,
        }, { status: 429 });
      }

      await recordAnalyticsEvent({
        category: 'upload',
        eventName: 'submission_quota_recorded',
        status: 'completed',
        userId,
        userEmail,
        message: 'Rolling submission quota recorded',
        metadata: {
          source: body.source || 'primary_upload',
          currentCount: snapshot.currentCount,
          maxSubmissions: snapshot.maxSubmissions,
          remainingSubmissions: snapshot.remainingSubmissions,
          resetAt: snapshot.resetAt,
        },
      }).catch(() => {});

      const participantsCount = Number(body.participantsCount);
      const tokensCount = Number(body.tokensCount);
      const shouldCreateSession =
        body.source !== 'ask_aunt_extra' &&
        Number.isFinite(participantsCount) &&
        Number.isFinite(tokensCount) &&
        participantsCount > 0 &&
        tokensCount >= 0;
      const sessionId = shouldCreateSession
        ? await logUpload(userId, participantsCount, tokensCount)
        : null;

      return NextResponse.json({
        ...withLegacyAliases(snapshot),
        ...(sessionId && { sessionId }),
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Track upload error:', error);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
