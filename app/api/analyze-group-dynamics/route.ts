import { NextRequest, NextResponse } from 'next/server';
import { serverAnalyzeGroupDynamics } from '@/lib/gemini-server';
import { recordAnalyticsEvent } from '@/lib/firestore-admin';
import {
  consumeSuccessfulAnalysisQuota,
  ensureAnalysisQuotaAvailable,
  isAnalysisQuotaExceededError,
} from '@/lib/analysis-quota';
import { hasCompletedSingleAnalysisOutput } from '@/lib/analysis-output';
import { withAnalysisTimeout } from '@/lib/analysis-timeout';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  let body: any = null;
  try {
    body = await request.json();
    const { messages, selectedParticipants, limit, tier, analysisMode, userId, userEmail, sessionId } = body;

    if (!messages) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    logger.info('Group dynamics analysis started', {
      messageCount: messages.length,
      participantCount: selectedParticipants?.length,
      limit,
      tier: tier || 'free',
      analysisMode: analysisMode || 'default'
    });

    await ensureAnalysisQuotaAvailable(userId || null, userEmail || null);

    const routeStartedAt = Date.now();
    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'group_analysis',
      status: 'started',
      userId: userId || null,
      userEmail: userEmail || null,
      sessionId: sessionId || null,
      tier: tier || 'free',
      analysisType: 'group_analysis',
      analysisMode: analysisMode || 'standard',
      endpoint: '/api/analyze-group-dynamics',
      message: 'Group analysis started',
      metadata: {
        messageCount: messages.length,
        participantCount: selectedParticipants?.length || 0,
      },
    });

    const result = await withAnalysisTimeout(
      serverAnalyzeGroupDynamics(
        messages,
        selectedParticipants,
        limit || Infinity,
        tier || 'free',
        analysisMode,
        { userId: userId || null, userEmail: userEmail || null, sessionId: sessionId || null }
      )
    );

    if (!hasCompletedSingleAnalysisOutput(result)) {
      throw new Error('לא התקבל פלט לניתוח.');
    }

    const quota = await consumeSuccessfulAnalysisQuota(userId || null, userEmail || null);

    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'group_analysis',
      status: 'completed',
      userId: userId || null,
      userEmail: userEmail || null,
      sessionId: sessionId || null,
      tier: tier || 'free',
      analysisType: 'group_analysis',
      analysisMode: analysisMode || 'standard',
      model: result.telemetry?.model || null,
      endpoint: '/api/analyze-group-dynamics',
      durationMs: result.telemetry?.durationMs || (Date.now() - routeStartedAt),
      message: 'Group analysis completed',
      metadata: {
        messageCount: messages.length,
        participantCount: selectedParticipants?.length || 0,
      },
    });

    return NextResponse.json({
      ...result,
      quota,
    });
  } catch (error) {
    const isQuotaError = isAnalysisQuotaExceededError(error);
    logger.error('Group dynamics analysis failed', {}, error instanceof Error ? error : undefined);
    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'group_analysis',
      status: isQuotaError ? 'rejected' : 'failed',
      level: isQuotaError ? 'warning' : 'error',
      userId: body?.userId || null,
      userEmail: body?.userEmail || null,
      sessionId: body?.sessionId || null,
      tier: body?.tier || 'free',
      analysisType: 'group_analysis',
      analysisMode: body?.analysisMode || 'standard',
      endpoint: '/api/analyze-group-dynamics',
      errorCode: error instanceof Error ? error.name : 'AnalysisError',
      message: error instanceof Error ? error.message : 'Analysis failed',
      metadata: {
        messageCount: Array.isArray(body?.messages) ? body.messages.length : 0,
        participantCount: Array.isArray(body?.selectedParticipants) ? body.selectedParticipants.length : 0,
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
