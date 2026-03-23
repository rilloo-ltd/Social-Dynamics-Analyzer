import { NextRequest, NextResponse } from 'next/server';
import { serverAskTheAunt } from '@/lib/gemini-server';
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
    const { chatSections, targetUser, question, tier, analysisMode, userId, userEmail, sessionId, questionMode } = body;

    if (!Array.isArray(chatSections) || !question) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    logger.info('Ask the Aunt analysis started', {
      targetUser,
      questionLength: String(question).length,
      sectionCount: chatSections.length,
      tier: tier || 'free',
      analysisMode: analysisMode || 'default'
    });

    await ensureAnalysisQuotaAvailable(userId || null, userEmail || null);

    const routeStartedAt = Date.now();
    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'ask_aunt',
      status: 'started',
      userId: userId || null,
      userEmail: userEmail || null,
      sessionId: sessionId || null,
      tier: tier || 'free',
      analysisType: 'ask_aunt',
      analysisMode: analysisMode || 'standard',
      endpoint: '/api/ask-the-aunt',
      message: 'Ask the Aunt started',
      metadata: {
        sectionCount: chatSections.length,
        questionMode: questionMode || (targetUser ? 'person' : 'general'),
        targetUser: targetUser || null,
      },
    });

    const result = await withAnalysisTimeout(
      serverAskTheAunt(
        chatSections,
        targetUser,
        question,
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
      eventName: 'ask_aunt',
      status: 'completed',
      userId: userId || null,
      userEmail: userEmail || null,
      sessionId: sessionId || null,
      tier: tier || 'free',
      analysisType: 'ask_aunt',
      analysisMode: analysisMode || 'standard',
      model: result.telemetry?.model || null,
      endpoint: '/api/ask-the-aunt',
      durationMs: result.telemetry?.durationMs || (Date.now() - routeStartedAt),
      message: 'Ask the Aunt completed',
      metadata: {
        sectionCount: chatSections.length,
        questionMode: questionMode || (targetUser ? 'person' : 'general'),
        targetUser: targetUser || null,
      },
    });

    return NextResponse.json({
      ...result,
      quota,
    });
  } catch (error) {
    const isQuotaError = isAnalysisQuotaExceededError(error);
    logger.error('Ask the Aunt analysis failed', {}, error instanceof Error ? error : undefined);
    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'ask_aunt',
      status: isQuotaError ? 'rejected' : 'failed',
      level: isQuotaError ? 'warning' : 'error',
      userId: body?.userId || null,
      userEmail: body?.userEmail || null,
      sessionId: body?.sessionId || null,
      tier: body?.tier || 'free',
      analysisType: 'ask_aunt',
      analysisMode: body?.analysisMode || 'standard',
      endpoint: '/api/ask-the-aunt',
      errorCode: error instanceof Error ? error.name : 'AnalysisError',
      message: error instanceof Error ? error.message : 'Analysis failed',
      metadata: {
        sectionCount: Array.isArray(body?.chatSections) ? body.chatSections.length : 0,
        questionMode: body?.questionMode || (body?.targetUser ? 'person' : 'general'),
        targetUser: body?.targetUser || null,
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
