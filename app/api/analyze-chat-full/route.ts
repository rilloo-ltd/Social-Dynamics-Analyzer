import { NextRequest, NextResponse } from 'next/server';
import { serverAnalyzeChatFull } from '@/lib/gemini-server';
import { recordAnalyticsEvent } from '@/lib/firestore-admin';
import { hasCompletedFullAnalysisOutput } from '@/lib/analysis-output';
import { withAnalysisTimeout } from '@/lib/analysis-timeout';
import { logger } from '@/lib/logger';
import { requireAuthenticatedRequest, userOwnsSession } from '@/lib/request-auth';

export async function POST(request: NextRequest) {
  let body: any = null;
  let authedUserId: string | null = null;
  let authedUserEmail: string | null = null;
  try {
    body = await request.json();
    const { messages, targetUser, limit, userId, sessionId } = body;
    const modelPreference = 'fast' as const;

    if (!messages || !targetUser) {
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

    logger.info('Individual chat analysis started', {
      targetUser,
      messageCount: messages.length,
      limit,
      modelPreference: modelPreference || 'fast'
    });

    const routeStartedAt = Date.now();
    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'individual_analysis',
      status: 'started',
      userId: authedUserId,
      userEmail: authedUserEmail,
      sessionId: sessionId || null,
      tier: null,
      analysisType: 'individual_analysis',
      analysisMode: modelPreference || 'fast',
      endpoint: '/api/analyze-chat-full',
      message: 'Individual analysis started',
      metadata: {
        messageCount: messages.length,
        targetUser,
        modelPreference: modelPreference || 'fast',
      },
    });

    const result = await withAnalysisTimeout(
      serverAnalyzeChatFull(
        messages,
        targetUser,
        limit || Infinity,
        modelPreference || 'fast',
        { userId: authedUserId, userEmail: authedUserEmail, sessionId: sessionId || null }
      )
    );

    if (!hasCompletedFullAnalysisOutput(result)) {
      throw new Error('לא התקבל פלט לניתוח.');
    }

    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'individual_analysis',
      status: 'completed',
      userId: authedUserId,
      userEmail: authedUserEmail,
      sessionId: sessionId || null,
      tier: null,
      analysisType: 'individual_analysis',
      analysisMode: modelPreference || 'fast',
      model: result.telemetry?.model || null,
      endpoint: '/api/analyze-chat-full',
      durationMs: result.telemetry?.durationMs || (Date.now() - routeStartedAt),
      message: 'Individual analysis completed',
      metadata: {
        messageCount: messages.length,
        modelPreference: modelPreference || 'fast',
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error('Individual chat analysis failed', {}, error instanceof Error ? error : undefined);
    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'individual_analysis',
      status: 'failed',
      level: 'error',
      userId: authedUserId || body?.userId || null,
      userEmail: authedUserEmail || null,
      sessionId: body?.sessionId || null,
      tier: null,
      analysisType: 'individual_analysis',
      analysisMode: 'fast',
      endpoint: '/api/analyze-chat-full',
      errorCode: error instanceof Error ? error.name : 'AnalysisError',
      message: error instanceof Error ? error.message : 'Analysis failed',
      metadata: {
        targetUser: body?.targetUser || null,
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
