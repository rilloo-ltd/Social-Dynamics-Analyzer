import { NextRequest, NextResponse } from 'next/server';
import { serverAnalyzeRomanticDynamics } from '@/lib/gemini-server';
import { recordAnalyticsEvent } from '@/lib/firestore-admin';
import { hasCompletedSingleAnalysisOutput } from '@/lib/analysis-output';
import { withAnalysisTimeout } from '@/lib/analysis-timeout';
import { logger } from '@/lib/logger';
import { requireAuthenticatedRequest, userOwnsSession } from '@/lib/request-auth';

export async function POST(request: NextRequest) {
  let body: any = null;
  let authedUserId: string | null = null;
  let authedUserEmail: string | null = null;
  try {
    body = await request.json();
    const { messages, limit, userId, sessionId } = body;
    const modelPreference = 'fast' as const;

    if (!messages) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const auth = await requireAuthenticatedRequest(request, userId || null);
    if (!auth.ok) {
      return auth.response;
    }
    authedUserId = auth.context.userId;
    authedUserEmail = auth.context.userEmail;

    if (!(await userOwnsSession(authedUserId, sessionId))) {
      return NextResponse.json({ error: 'A valid uploaded chat session is required' }, { status: 403 });
    }

    logger.info('Romantic dynamics analysis started', {
      messageCount: messages.length,
      limit,
      modelPreference: modelPreference || 'fast'
    });

    const routeStartedAt = Date.now();
    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'romantic_analysis',
      status: 'started',
      userId: authedUserId,
      userEmail: authedUserEmail,
      sessionId: sessionId || null,
      tier: null,
      analysisType: 'romantic_analysis',
      analysisMode: modelPreference || 'fast',
      endpoint: '/api/analyze-romantic-dynamics',
      message: 'Romantic analysis started',
      metadata: {
        messageCount: messages.length,
        modelPreference: modelPreference || 'fast',
      },
    });

    const result = await withAnalysisTimeout(
      serverAnalyzeRomanticDynamics(
        messages,
        limit || Infinity,
        modelPreference || 'fast',
        { userId: authedUserId, userEmail: authedUserEmail, sessionId: sessionId || null }
      )
    );

    if (!hasCompletedSingleAnalysisOutput(result)) {
      throw new Error('לא התקבל פלט לניתוח.');
    }

    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'romantic_analysis',
      status: 'completed',
      userId: authedUserId,
      userEmail: authedUserEmail,
      sessionId: sessionId || null,
      tier: null,
      analysisType: 'romantic_analysis',
      analysisMode: modelPreference || 'fast',
      model: result.telemetry?.model || null,
      endpoint: '/api/analyze-romantic-dynamics',
      durationMs: result.telemetry?.durationMs || (Date.now() - routeStartedAt),
      message: 'Romantic analysis completed',
      metadata: {
        messageCount: messages.length,
        modelPreference: modelPreference || 'fast',
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error('Romantic dynamics analysis failed', {}, error instanceof Error ? error : undefined);
    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'romantic_analysis',
      status: 'failed',
      level: 'error',
      userId: authedUserId || body?.userId || null,
      userEmail: authedUserEmail || null,
      sessionId: body?.sessionId || null,
      tier: null,
      analysisType: 'romantic_analysis',
      analysisMode: 'fast',
      endpoint: '/api/analyze-romantic-dynamics',
      errorCode: error instanceof Error ? error.name : 'AnalysisError',
      message: error instanceof Error ? error.message : 'Analysis failed',
      metadata: {
        messageCount: Array.isArray(body?.messages) ? body.messages.length : 0,
        modelPreference: 'fast',
      },
    }).catch(() => {});
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
