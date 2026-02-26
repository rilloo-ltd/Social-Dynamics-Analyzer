import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { CHATS_FILE, ensureDataDir } from '@/lib/dataUtils';

export async function POST(request: NextRequest) {
  try {
    ensureDataDir();
    if (fs.existsSync(CHATS_FILE)) {
      fs.writeFileSync(CHATS_FILE, JSON.stringify({}));
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error resetting cache:', error);
    return NextResponse.json({ error: 'Failed to reset cache' }, { status: 500 });
  }
}
