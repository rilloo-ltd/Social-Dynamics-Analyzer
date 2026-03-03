import 'server-only';
import { db } from './firebase';
import { 
  collection, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';

export interface Stats {
  uploads: Array<{ timestamp: string; participantsCount: number; tokensCount: number; sessionId: string }>;
  buttonPresses: Record<string, number>;
  geminiUsage: Array<{ timestamp: string; inputTokens: number; outputTokens: number; model: string }>;
  sessions: Record<string, { 
    shares: Array<{ type: string; platform?: string; timestamp: string }>; 
    images: Array<{ prompt: string; timestamp: string }>; 
    feedback?: { rating: number; comment: string; timestamp: string } 
  }>;
}

export interface Chat {
  code: string;
  text: string;
  timestamp: string;
  outputs: Record<string, { output: any; timestamp: string }>;
}

// Firestore collection references
const CHATS_COLLECTION = 'chats';
const STATS_DOC = 'app-stats';
const STATS_COLLECTION = 'stats';

/**
 * Read stats from Firestore
 */
export async function readStats(): Promise<Stats> {
  try {
    const statsRef = doc(db, STATS_COLLECTION, STATS_DOC);
    const statsSnap = await getDoc(statsRef);
    
    if (statsSnap.exists()) {
      return statsSnap.data() as Stats;
    }
    
    // Return default stats if document doesn't exist
    return { 
      uploads: [], 
      buttonPresses: {}, 
      geminiUsage: [], 
      sessions: {} 
    };
  } catch (e) {
    console.error('Error reading stats from Firestore:', e);
    return { 
      uploads: [], 
      buttonPresses: {}, 
      geminiUsage: [], 
      sessions: {} 
    };
  }
}

/**
 * Write stats to Firestore
 */
export async function writeStats(stats: Stats): Promise<void> {
  try {
    const statsRef = doc(db, STATS_COLLECTION, STATS_DOC);
    await setDoc(statsRef, stats, { merge: true });
  } catch (e) {
    console.error('Error writing stats to Firestore:', e);
    throw e;
  }
}

/**
 * Read a specific chat by code from Firestore
 */
export async function readChat(code: string): Promise<Chat | null> {
  try {
    const chatRef = doc(db, CHATS_COLLECTION, code);
    const chatSnap = await getDoc(chatRef);
    
    if (chatSnap.exists()) {
      return chatSnap.data() as Chat;
    }
    
    return null;
  } catch (e) {
    console.error('Error reading chat from Firestore:', e);
    return null;
  }
}

/**
 * Write/update a chat in Firestore
 */
export async function writeChat(chat: Chat): Promise<void> {
  try {
    const chatRef = doc(db, CHATS_COLLECTION, chat.code);
    await setDoc(chatRef, chat, { merge: true });
  } catch (e) {
    console.error('Error writing chat to Firestore:', e);
    throw e;
  }
}

/**
 * Update chat outputs in Firestore
 */
export async function updateChatOutputs(code: string, type: string, output: any): Promise<void> {
  try {
    const chatRef = doc(db, CHATS_COLLECTION, code);
    const chatSnap = await getDoc(chatRef);
    
    if (!chatSnap.exists()) {
      throw new Error(`Chat with code ${code} not found`);
    }
    
    const currentOutputs = chatSnap.data()?.outputs || {};
    currentOutputs[type] = {
      output,
      timestamp: new Date().toISOString()
    };
    
    await updateDoc(chatRef, {
      outputs: currentOutputs
    });
  } catch (e) {
    console.error('Error updating chat outputs in Firestore:', e);
    throw e;
  }
}

/**
 * Generate chat code from text (same as file-based implementation)
 */
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
