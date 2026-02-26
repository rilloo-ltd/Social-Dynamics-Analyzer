import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { STATS_FILE, ensureDataDir } from '@/lib/dataUtils';

export async function POST(request: NextRequest) {
  try {
    ensureDataDir();
    const { rating, comment, sessionId } = await request.json();
    const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));

    if (sessionId && stats.sessions && stats.sessions[sessionId]) {
        if (!stats.sessions[sessionId].feedbacks) {
            stats.sessions[sessionId].feedbacks = [];
        }
        stats.sessions[sessionId].feedbacks.push({
            rating,
            comment,
            timestamp: new Date().toISOString()
        });
        fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error logging feedback:', error);
    return NextResponse.json({ error: 'Failed to log feedback' }, { status: 500 });
  }
}
