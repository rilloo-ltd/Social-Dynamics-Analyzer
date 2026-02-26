import { NextResponse } from 'next/server';
import fs from 'fs';
import { STATS_FILE, CHATS_FILE, ensureDataDir } from '@/lib/dataUtils';

export async function GET() {
  try {
    ensureDataDir();
    const stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf-8'));
    
    if (stats.sessions && fs.existsSync(CHATS_FILE)) {
        try {
            const chats = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf-8'));
            Object.values(stats.sessions).forEach((session: any) => {
                if (session.chatCode && chats[session.chatCode]) {
                    session.chatOutputs = chats[session.chatCode].outputs || {};
                }
            });
        } catch (e) {
            console.error("Error reading chats file for stats enrichment", e);
        }
    }
    
    return NextResponse.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    return NextResponse.json({ error: 'Failed to get stats' }, { status: 500 });
  }
}
