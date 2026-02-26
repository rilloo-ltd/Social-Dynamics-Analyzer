import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { CHATS_FILE, ensureDataDir } from '@/lib/dataUtils';

export async function POST(request: NextRequest) {
  try {
    ensureDataDir();
    const { code, type, output } = await request.json();
    
    if (!code || !type || !output) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    let chats: any = {};
    if (fs.existsSync(CHATS_FILE)) {
        try {
            chats = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf-8'));
        } catch (e) {
            console.error("Error reading chats file", e);
            return NextResponse.json({ error: 'Database error' }, { status: 500 });
        }
    }

    if (!chats[code]) {
        return NextResponse.json({ error: 'Chat not found' }, { status: 404 });
    }

    if (!chats[code].outputs) {
        chats[code].outputs = {};
    }

    chats[code].outputs[type] = {
        output,
        timestamp: new Date().toISOString()
    };

    fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating chat:', error);
    return NextResponse.json({ error: 'Failed to update chat' }, { status: 500 });
  }
}
