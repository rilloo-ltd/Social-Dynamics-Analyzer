'use server';

import { updateUserTier } from '@/lib/firestore-admin';
import { logger } from '@/lib/logger';

// Promo codes for unlimited access (server-side only)
const UNLIMITED_PROMO_CODES = [
  'FRIENDS2026',
  'UNLIMITED_ACCESS',
  'VIP_PASS'
];

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
    return { hasUnlimited: false, tier: 'free', maxDailyUploads: 3 };
  }
}
