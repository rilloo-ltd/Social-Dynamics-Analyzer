'use server';

import { getAllStats, clearAllChats, updateUserTier } from '@/lib/firestore-admin';
import { UNLIMITED_PROMO_CODES } from '@/lib/constants';
import { logger } from '@/lib/logger';

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

/**
 * Validates and redeems a promo code for unlimited access
 */
export async function redeemPromoCodeAction(userId: string, promoCode: string) {
  try {
    // Validate promo code
    const normalizedCode = promoCode.trim().toUpperCase();
    
    if (!UNLIMITED_PROMO_CODES.includes(normalizedCode)) {
      logger.info('Invalid promo code attempt', { userId, promoCode: normalizedCode });
      return { 
        success: false, 
        message: 'קוד לא תקין. בדוק שהקוד נכתב נכון.' 
      };
    }

    // Grant unlimited access by setting super tier with unlimited uploads
    await updateUserTier(userId, 'super', 999999);
    
    logger.info('Promo code redeemed successfully', { userId, promoCode: normalizedCode });
    
    return { 
      success: true, 
      message: '🎉 הקוד הופעל בהצלחה! יש לך גישה בלתי מוגבלת לאפליקציה!' 
    };
  } catch (error) {
    logger.error('Error redeeming promo code', { userId, promoCode }, error instanceof Error ? error : undefined);
    return { 
      success: false, 
      message: 'אירעה שגיאה בהפעלת הקוד. נסה שוב.' 
    };
  }
}

/**
 * Checks if user has unlimited access via promo code
 */
export async function checkUnlimitedAccessAction(userId: string) {
  try {
    const { getUserTier } = await import('@/lib/firestore-admin');
    const userTier = await getUserTier(userId);
    
    // User has unlimited if they have super tier with high max uploads
    const hasUnlimited = userTier.tier === 'super' && userTier.maxDailyUploads >= 999999;
    
    return { hasUnlimited, tier: userTier.tier, maxDailyUploads: userTier.maxDailyUploads };
  } catch (error) {
    logger.error('Error checking unlimited access', { userId }, error instanceof Error ? error : undefined);
    return { hasUnlimited: false, tier: 'free', maxDailyUploads: 2 };
  }
}
