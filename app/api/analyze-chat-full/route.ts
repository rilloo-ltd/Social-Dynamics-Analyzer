import { NextRequest, NextResponse } from 'next/server';
import { serverAnalyzeChatFull } from '@/lib/gemini-server';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, targetUser, limit } = body;

    if (!messages || !targetUser) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    logger.info('Individual chat analysis started', {
      targetUser,
      messageCount: messages.length,
      limit
    });

    const result = await serverAnalyzeChatFull(messages, targetUser, limit || Infinity);

    return NextResponse.json(result);
  } catch (error) {
    logger.error('Individual chat analysis failed', {}, error instanceof Error ? error : undefined);
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
