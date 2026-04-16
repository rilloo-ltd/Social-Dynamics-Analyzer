import { NextRequest, NextResponse } from 'next/server';
import { serverAskTheAunt } from '@/lib/gemini-server';
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
    const { chatSections, targetUser, question, userId, sessionId, questionMode } = body;
    const modelPreference = 'fast' as const;

    if (!Array.isArray(chatSections) || !question) {
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

    logger.info('Ask the Aunt analysis started', {
      targetUser,
      questionLength: String(question).length,
      sectionCount: chatSections.length,
      modelPreference: modelPreference || 'fast'
    });

    const routeStartedAt = Date.now();
    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'ask_aunt',
      status: 'started',
      userId: authedUserId,
      userEmail: authedUserEmail,
      sessionId: sessionId || null,
      tier: null,
      analysisType: 'ask_aunt',
      analysisMode: modelPreference || 'fast',
      endpoint: '/api/ask-the-aunt',
      message: 'Ask the Aunt started',
      metadata: {
        sectionCount: chatSections.length,
        questionMode: questionMode || (targetUser ? 'person' : 'general'),
        targetUser: targetUser || null,
        modelPreference: modelPreference || 'fast',
      },
    });

    const result = await withAnalysisTimeout(
      serverAskTheAunt(
        chatSections,
        targetUser,
        question,
        modelPreference || 'fast',
        { userId: authedUserId, userEmail: authedUserEmail, sessionId: sessionId || null }
      )
    );

    if (!hasCompletedSingleAnalysisOutput(result)) {
      throw new Error('לא התקבל פלט לניתוח.');
    }

    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'ask_aunt',
      status: 'completed',
      userId: authedUserId,
      userEmail: authedUserEmail,
      sessionId: sessionId || null,
      tier: null,
      analysisType: 'ask_aunt',
      analysisMode: modelPreference || 'fast',
      model: result.telemetry?.model || null,
      endpoint: '/api/ask-the-aunt',
      durationMs: result.telemetry?.durationMs || (Date.now() - routeStartedAt),
      message: 'Ask the Aunt completed',
      metadata: {
        sectionCount: chatSections.length,
        questionMode: questionMode || (targetUser ? 'person' : 'general'),
        targetUser: targetUser || null,
        modelPreference: modelPreference || 'fast',
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    logger.error('Ask the Aunt analysis failed', {}, error instanceof Error ? error : undefined);
    await recordAnalyticsEvent({
      category: 'analysis',
      eventName: 'ask_aunt',
      status: 'failed',
      level: 'error',
      userId: authedUserId || body?.userId || null,
      userEmail: authedUserEmail || null,
      sessionId: body?.sessionId || null,
      tier: null,
      analysisType: 'ask_aunt',
      analysisMode: 'fast',
      endpoint: '/api/ask-the-aunt',
      errorCode: error instanceof Error ? error.name : 'AnalysisError',
      message: error instanceof Error ? error.message : 'Analysis failed',
      metadata: {
        sectionCount: Array.isArray(body?.chatSections) ? body.chatSections.length : 0,
        questionMode: body?.questionMode || (body?.targetUser ? 'person' : 'general'),
        targetUser: body?.targetUser || null,
        modelPreference: 'fast',
      },
    }).catch(() => {});

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
