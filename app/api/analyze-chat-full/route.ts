import { NextRequest, NextResponse } from 'next/server';
import { serverAnalyzeChatFull } from '@/lib/gemini-server';
import { recordAnalyticsEvent } from '@/lib/firestore-admin';
import {
  consumeSuccessfulAnalysisQuota,
  ensureAnalysisQuotaAvailable,
  isAnalysisQuotaExceededError,
} from '@/lib/analysis-quota';
import { hasCompletedFullAnalysisOutput } from '@/lib/analysis-output';
import { withAnalysisTimeout } from '@/lib/analysis-timeout';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  let body: any = null;
  try {
    body = await request.json();
    const { messages, targetUser, limit, tier, analysisMode, userId, userEmail, sessionId } = body;

    if (!messages || !targetUser) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    logger.info('Individual chat analysis started', {
      targetUser,
      messageCount: messages.length,
      limit,
      tier: tier || 'free',
      analysisMode: analysisMode || 'default'
    });

    await ensureAnalysisQuotaAvailable(userId || null, userEmail || null);

    const routeStartedAt = Date.now();
    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'individual_analysis',
      status: 'started',
      userId: userId || null,
      userEmail: userEmail || null,
      sessionId: sessionId || null,
      tier: tier || 'free',
      analysisType: 'individual_analysis',
      analysisMode: analysisMode || 'standard',
      endpoint: '/api/analyze-chat-full',
      message: 'Individual analysis started',
      metadata: {
        messageCount: messages.length,
        targetUser,
      },
    });

    const result = await withAnalysisTimeout(
      serverAnalyzeChatFull(
        messages,
        targetUser,
        limit || Infinity,
        tier || 'free',
        analysisMode,
        { userId: userId || null, userEmail: userEmail || null, sessionId: sessionId || null }
      )
    );

    if (!hasCompletedFullAnalysisOutput(result)) {
      throw new Error('לא התקבל פלט לניתוח.');
    }

    const quota = await consumeSuccessfulAnalysisQuota(userId || null, userEmail || null);

    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'individual_analysis',
      status: 'completed',
      userId: userId || null,
      userEmail: userEmail || null,
      sessionId: sessionId || null,
      tier: tier || 'free',
      analysisType: 'individual_analysis',
      analysisMode: analysisMode || 'standard',
      model: result.telemetry?.model || null,
      endpoint: '/api/analyze-chat-full',
      durationMs: result.telemetry?.durationMs || (Date.now() - routeStartedAt),
      message: 'Individual analysis completed',
      metadata: {
        messageCount: messages.length,
      },
    });

    return NextResponse.json({
      ...result,
      quota,
    });
  } catch (error) {
    const isQuotaError = isAnalysisQuotaExceededError(error);
    logger.error('Individual chat analysis failed', {}, error instanceof Error ? error : undefined);
    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'individual_analysis',
      status: isQuotaError ? 'rejected' : 'failed',
      level: isQuotaError ? 'warning' : 'error',
      userId: body?.userId || null,
      userEmail: body?.userEmail || null,
      sessionId: body?.sessionId || null,
      tier: body?.tier || 'free',
      analysisType: 'individual_analysis',
      analysisMode: body?.analysisMode || 'standard',
      endpoint: '/api/analyze-chat-full',
      errorCode: error instanceof Error ? error.name : 'AnalysisError',
      message: error instanceof Error ? error.message : 'Analysis failed',
      metadata: {
        targetUser: body?.targetUser || null,
        messageCount: Array.isArray(body?.messages) ? body.messages.length : 0,
        quota: isQuotaError ? error.quota : null,
      },
    }).catch(() => {});
    
    return NextResponse.json(
      isQuotaError
        ? {
            error: error.message,
            quotaExceeded: true,
            ...error.quota,
          }
        : { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: isQuotaError ? 429 : 500 }
    );
  }
}
