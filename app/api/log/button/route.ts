import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { STATS_FILE, ensureDataDir } from '@/lib/dataUtils';

export async function POST(request: NextRequest) {
  try {
    ensureDataDir();
    const { buttonId, sessionId } = await request.json();
    const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    
    stats.buttonPresses[buttonId] = (stats.buttonPresses[buttonId] || 0) + 1;

    if (sessionId && stats.sessions && stats.sessions[sessionId]) {
        stats.sessions[sessionId].buttonsPressed.push({
            buttonId,
            timestamp: new Date().toISOString()
        });
    }

    fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error logging button:', error);
    return NextResponse.json({ error: 'Failed to log button' }, { status: 500 });
  }
}
