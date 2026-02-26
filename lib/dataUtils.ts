import fs from 'fs';
import path from 'path';

const isProd = process.env.NODE_ENV === 'production';
export const DATA_DIR = isProd ? '/tmp/data' : path.join(process.cwd(), 'data');
export const STATS_FILE = path.join(DATA_DIR, 'stats.json');
export const CHATS_FILE = path.join(DATA_DIR, 'chats.json');

// Ensure data directory exists
export function ensureDataDir() {
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

// Initialize on import
ensureDataDir();
