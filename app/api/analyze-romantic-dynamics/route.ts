import { NextRequest, NextResponse } from 'next/server';
import { serverAnalyzeRomanticDynamics } from '@/lib/gemini-server';
import { logger } from '@/lib/logger';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, limit } = body;

    if (!messages) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    logger.info('Romantic dynamics analysis started', {
      messageCount: messages.length,
      limit
    });

    const result = await serverAnalyzeRomanticDynamics(messages, limit || Infinity);

    return NextResponse.json(result);
  } catch (error) {
    logger.error('Romantic dynamics analysis failed', {}, error instanceof Error ? error : undefined);
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Analysis failed' },
      { status: 500 }
    );
  }
}
