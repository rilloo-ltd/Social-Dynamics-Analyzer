import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { STATS_FILE, ensureDataDir } from '@/lib/dataUtils';

export async function POST(request: NextRequest) {
  try {
    ensureDataDir();
    const { participants, timestamp, anonymizedText, tokenCount, chatCode } = await request.json();
    const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    
    const sessionId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
    const ts = timestamp || new Date().toISOString();

    stats.uploads.push({
      timestamp: ts,
      participants: participants || 0
    });
    
    if (!stats.sessions) stats.sessions = {};
    stats.sessions[sessionId] = {
      id: sessionId,
      timestamp: ts,
      participants: participants || 0,
      anonymizedText: anonymizedText || "",
      chatCode: chatCode || null,
      buttonsPressed: [],
      shares: [],
      geminiUsage: [],
      imagesGenerated: [],
      initialTokenCount: tokenCount || 0
    };

    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    return NextResponse.json({ success: true, sessionId });
  } catch (error) {
    console.error('Error logging upload:', error);
    return NextResponse.json({ error: 'Failed to log upload' }, { status: 500 });
  }
}
