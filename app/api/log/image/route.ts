import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { STATS_FILE, ensureDataDir } from '@/lib/dataUtils';

export async function POST(request: NextRequest) {
  try {
    ensureDataDir();
    const { model, sessionId } = await request.json();
    const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));

    if (sessionId && stats.sessions && stats.sessions[sessionId]) {
        if (!stats.sessions[sessionId].imagesGenerated) {
            stats.sessions[sessionId].imagesGenerated = [];
        }
        stats.sessions[sessionId].imagesGenerated.push({
            model,
            timestamp: new Date().toISOString()
        });
        fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error logging image generation:', error);
    return NextResponse.json({ error: 'Failed to log image generation' }, { status: 500 });
  }
}
