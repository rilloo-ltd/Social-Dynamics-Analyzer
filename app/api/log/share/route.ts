import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { STATS_FILE, ensureDataDir } from '@/lib/dataUtils';

export async function POST(request: NextRequest) {
  try {
    ensureDataDir();
    const { type, platform, sessionId } = await request.json();
    const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    
    if (sessionId && stats.sessions && stats.sessions[sessionId]) {
        stats.sessions[sessionId].shares.push({
            type,
            platform,
            timestamp: new Date().toISOString()
        });
        fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error logging share:', error);
    return NextResponse.json({ error: 'Failed to log share' }, { status: 500 });
  }
}
