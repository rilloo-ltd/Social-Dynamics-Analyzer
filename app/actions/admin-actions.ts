'use server';

import { getAllStats, clearAllChats } from '@/lib/firestore-admin';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Magav1!';

export async function verifyAdminPasswordAction(password: string) {
  if (password === ADMIN_PASSWORD) {
    return { success: true };
  }
  return { success: false, message: 'Invalid password' };
}

export async function getAdminStatsAction() {
  const stats = await getAllStats();

  // Format chats for display
  const enrichedStats = {
    ...stats,
    chats: stats.chats.map(chat => ({
      code: chat.code,
      timestamp: chat.timestamp,
      outputs: chat.outputs,
      userId: chat.userId
    }))
  };

  return enrichedStats;
}

export async function resetCacheAction() {
  await clearAllChats();
  return { success: true, message: 'Cache cleared' };
}
