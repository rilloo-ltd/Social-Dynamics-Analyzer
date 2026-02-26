import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { STATS_FILE, ensureDataDir } from '@/lib/dataUtils';

export async function POST(request: NextRequest) {
  try {
    ensureDataDir();
    const { promptTokens, responseTokens, model, sessionId } = await request.json();
    const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));

    if (!stats.geminiUsage) stats.geminiUsage = [];
    stats.geminiUsage.push({
        timestamp: new Date().toISOString(),
        promptTokens,
        responseTokens,
        model
    });

    if (sessionId && stats.sessions && stats.sessions[sessionId]) {
        stats.sessions[sessionId].geminiUsage.push({
            promptTokens,
            responseTokens,
            model,
            timestamp: new Date().toISOString()
        });
    }

    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error logging gemini usage:', error);
    return NextResponse.json({ error: 'Failed to log gemini usage' }, { status: 500 });
  }
}
