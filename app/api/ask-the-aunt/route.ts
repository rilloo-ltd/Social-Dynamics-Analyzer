import { NextRequest, NextResponse } from 'next/server';
import { serverAskTheAunt } from '@/lib/gemini-server';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { chatSections, targetUser, question } = body;

    if (!Array.isArray(chatSections) || !question) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    logger.info('Ask the Aunt analysis started', {
      targetUser,
      questionLength: String(question).length,
      sectionCount: chatSections.length
    });

    const result = await serverAskTheAunt(chatSections, targetUser, question);
    return NextResponse.json(result);
  } catch (error) {
    logger.error('Ask the Aunt analysis failed', {}, error instanceof Error ? error : undefined);

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
