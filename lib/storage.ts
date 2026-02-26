import 'server-only';
import fs from 'fs';
import path from 'path';

const isProd = process.env.NODE_ENV === 'production' || !!process.env.K_SERVICE;
const DATA_DIR = isProd ? '/tmp/data' : path.join(process.cwd(), 'data');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const CHATS_FILE = path.join(DATA_DIR, 'chats.json');

interface Stats {
  uploads: Array<{ timestamp: string; participantsCount: number; tokensCount: number; sessionId: string }>;
  buttonPresses: Record<string, number>;
  geminiUsage: Array<{ timestamp: string; inputTokens: number; outputTokens: number; model: string }>;
  sessions: Record<string, { shares: Array<{ type: string; platform?: string; timestamp: string }>; images: Array<{ prompt: string; timestamp: string }>; feedback?: { rating: number; comment: string; timestamp: string } }>;
}

interface Chat {
  code: string;
  text: string;
  timestamp: string;
  outputs: Record<string, { output: any; timestamp: string }>;
}

// Ensure data directory and files exist
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STATS_FILE)) {
    fs.writeFileSync(STATS_FILE, JSON.stringify({ uploads: [], buttonPresses: {}, geminiUsage: [], sessions: {} }));
  }
  if (!fs.existsSync(CHATS_FILE)) {
    fs.writeFileSync(CHATS_FILE, JSON.stringify({}));
  }
}

ensureDataDir();

export function readStats(): Stats {
  ensureDataDir();
  try {
    const data = fs.readFileSync(STATS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.error('Error reading stats file:', e);
    return { uploads: [], buttonPresses: {}, geminiUsage: [], sessions: {} };
  }
}

export function writeStats(stats: Stats): void {
  ensureDataDir();
  fs.writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

export function readChats(): Record<string, Chat> {
  ensureDataDir();
  try {
    const data = fs.readFileSync(CHATS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (e) {
    console.error('Error reading chats file:', e);
    return {};
  }
}

export function writeChats(chats: Record<string, Chat>): void {
  ensureDataDir();
  fs.writeFileSync(CHATS_FILE, JSON.stringify(chats, null, 2));
}

export function generateChatCode(text: string): string {
  const allWords = text.split(/\s+/);
  const contentWords = [];
  
  for (const rawWord of allWords) {
    let w = rawWord.trim();
    if (!w) continue;
    if (/^\[.*?\]$/.test(w)) continue;
    
    const pMatch = w.match(/^(P\d+:)(.*)/);
    if (pMatch) {
      const rest = pMatch[2];
      if (!rest) continue;
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
  
  return [...first10, ...last10].map(w => w.charAt(0)).join('');
}
