import { NextRequest, NextResponse } from 'next/server';
import { serverAnalyzeGroupDynamics } from '@/lib/gemini-server';
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
    const { messages, selectedParticipants, limit, userId, sessionId } = body;
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

    logger.info('Group dynamics analysis started', {
      messageCount: messages.length,
      participantCount: selectedParticipants?.length,
      limit,
      modelPreference: modelPreference || 'fast'
    });

    const routeStartedAt = Date.now();
    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'group_analysis',
      status: 'started',
      userId: authedUserId,
      userEmail: authedUserEmail,
      sessionId: sessionId || null,
      tier: null,
      analysisType: 'group_analysis',
      analysisMode: modelPreference || 'fast',
      endpoint: '/api/analyze-group-dynamics',
      message: 'Group analysis started',
      metadata: {
        messageCount: messages.length,
        participantCount: selectedParticipants?.length || 0,
        modelPreference: modelPreference || 'fast',
      },
    });

    const result = await withAnalysisTimeout(
      serverAnalyzeGroupDynamics(
        messages,
        selectedParticipants,
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
      eventName: 'group_analysis',
      status: 'completed',
      userId: authedUserId,
      userEmail: authedUserEmail,
      sessionId: sessionId || null,
      tier: null,
      analysisType: 'group_analysis',
      analysisMode: modelPreference || 'fast',
      model: result.telemetry?.model || null,
      endpoint: '/api/analyze-group-dynamics',
      durationMs: result.telemetry?.durationMs || (Date.now() - routeStartedAt),
      message: 'Group analysis completed',
      metadata: {
        messageCount: messages.length,
        participantCount: selectedParticipants?.length || 0,
        modelPreference: modelPreference || 'fast',
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error('Group dynamics analysis failed', {}, error instanceof Error ? error : undefined);
    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'group_analysis',
      status: 'failed',
      level: 'error',
      userId: authedUserId || body?.userId || null,
      userEmail: authedUserEmail || null,
      sessionId: body?.sessionId || null,
      tier: null,
      analysisType: 'group_analysis',
      analysisMode: 'fast',
      endpoint: '/api/analyze-group-dynamics',
      errorCode: error instanceof Error ? error.name : 'AnalysisError',
      message: error instanceof Error ? error.message : 'Analysis failed',
      metadata: {
        messageCount: Array.isArray(body?.messages) ? body.messages.length : 0,
        participantCount: Array.isArray(body?.selectedParticipants) ? body.selectedParticipants.length : 0,
        modelPreference: 'fast',
      },
    }).catch(() => {});
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
