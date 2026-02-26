'use server';

import { readStats, readChats, writeChats } from '@/lib/storage';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Magav1!';

export async function verifyAdminPasswordAction(password: string) {
  if (password === ADMIN_PASSWORD) {
    return { success: true };
  }
  return { success: false, message: 'Invalid password' };
}

export async function getAdminStatsAction() {
  const stats = readStats();
  const chats = readChats();

  // Enrich stats with chat outputs for display
  const enrichedStats = {
    ...stats,
    chats: Object.values(chats).map(chat => ({
      code: chat.code,
      timestamp: chat.timestamp,
      outputs: chat.outputs
    }))
  };

  return enrichedStats;
}

export async function resetCacheAction() {
  writeChats({});
  return { success: true, message: 'Cache cleared' };
}
