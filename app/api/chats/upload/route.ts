import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import { CHATS_FILE, ensureDataDir } from '@/lib/dataUtils';

export async function POST(request: NextRequest) {
  try {
    ensureDataDir();
    const { text, forceNew } = await request.json();
    
    if (!text) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 });
    }

    // Code Generation Logic
    const allWords = text.split(/\s+/);
    const contentWords = [];
    
    for (const rawWord of allWords) {
        let w = rawWord.trim();
        if (!w) continue;
        
        if (/^\[.*?\]$/.test(w)) continue;
        
        const pMatch = w.match(/^(P\d+:)(.*)/);
        if (pMatch) {
            const rest = pMatch[2];
            if (!rest) {
                continue;
            }
            w = rest;
        }
        
        if (w) {
            contentWords.push(w);
        }
    }

    let first10: string[] = [];
    let last10: string[] = [];

    if (contentWords.length <= 20) {
        first10 = contentWords;
        last10 = []; 
    } else {
        first10 = contentWords.slice(0, 10);
        last10 = contentWords.slice(-10);
    }
    
    const code = [...first10, ...last10]
      .map(w => w.charAt(0))
      .join('');

    if (!code) {
        return NextResponse.json({ error: 'Could not generate chat code (empty content)' }, { status: 400 });
    }

    let chats: any = {};
    if (fs.existsSync(CHATS_FILE)) {
        try {
            chats = JSON.parse(fs.readFileSync(CHATS_FILE, 'utf-8'));
        } catch (e) {
            console.error("Error reading chats file, resetting", e);
            chats = {};
        }
    }

    if (chats[code] && !forceNew) {
        console.log(`Chat with code ${code} already exists. Returning existing data.`);
        return NextResponse.json({ success: true, code, existingOutputs: chats[code].outputs || {} });
    }
    
    chats[code] = {
      code,
      text,
      timestamp: new Date().toISOString(),
      outputs: forceNew ? {} : (chats[code]?.outputs || {})
    };
    fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));

    return NextResponse.json({ success: true, code, existingOutputs: {} });
  } catch (error) {
    console.error('Error storing chat:', error);
    return NextResponse.json({ error: 'Failed to store chat' }, { status: 500 });
  }
}
