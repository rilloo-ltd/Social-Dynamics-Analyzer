'use server';

import { updateUserTier } from '@/lib/firestore-admin';
import { logger } from '@/lib/logger';

/**
 * Validates and redeems a one-time friends code from the referralCodes collection.
 * Grants 'friends' tier (unlimited) for 7 days.
 */
export async function redeemPromoCodeAction(userId: string, promoCode: string) {
  try {
    const { getAdminDb, getUserTier } = await import('@/lib/firestore-admin');
    const normalizedCode = promoCode.trim().toUpperCase();
    const db = getAdminDb();

    // Reject if user already has an active friends tier
    const currentTier = await getUserTier(userId);
    if (currentTier.tier === 'friends') {
      return { success: false, message: 'כבר יש לך גישת Friends פעילה.' };
    }

    // Atomically check and decrement usesRemaining
    const txResult = await db.runTransaction(async (tx: any) => {
      const codeRef = db.collection('referralCodes').doc(normalizedCode);
      const codeDoc = await tx.get(codeRef);

      if (!codeDoc.exists) {
        return { valid: false, message: 'קוד לא תקין. בדוק שהקוד נכתב נכון.' };
      }

      const data = codeDoc.data();
      if (!data || data.usesRemaining <= 0) {
        return { valid: false, message: 'הקוד כבר נוצל.' };
      }

      tx.update(codeRef, {
        usesRemaining: data.usesRemaining - 1,
        usedBy: [...(data.usedBy || []), { userId, timestamp: new Date().toISOString() }],
      });

      return { valid: true };
    });

    if (!txResult.valid) {
      // Not a referral code — check credit codes
      const creditTxResult = await db.runTransaction(async (tx: any) => {
        const codeRef = db.collection('creditCodes').doc(normalizedCode);
        const codeDoc = await tx.get(codeRef);

        if (!codeDoc.exists) {
          return { valid: false, message: 'קוד לא תקין. בדוק שהקוד נכתב נכון.' };
        }

        const data = codeDoc.data();
        if (!data || data.usesRemaining <= 0) {
          return { valid: false, message: 'הקוד כבר נוצל.' };
        }

        tx.update(codeRef, {
          usesRemaining: data.usesRemaining - 1,
          usedBy: [...(data.usedBy || []), { userId, timestamp: new Date().toISOString() }],
        });

        return { valid: true, credits: Number(data.credits) || 2 };
      });

      if (!creditTxResult.valid) {
        return { success: false, message: creditTxResult.message };
      }

      const { addBonusUploadsToUser } = await import('@/lib/firestore-admin');
      await addBonusUploadsToUser(userId, creditTxResult.credits);

      logger.info('Credit code redeemed', { userId, code: normalizedCode, credits: creditTxResult.credits });

      return {
        success: true,
        message: `✅ הקוד הופעל! ${creditTxResult.credits} ניתוחים נוספים נוספו לחשבונך לצמיתות.`,
      };
    }

    // Grant friends tier for 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    await updateUserTier(userId, 'friends', 999999, expiresAt);

    logger.info('Friends code redeemed', { userId, code: normalizedCode, expiresAt });

    return {
      success: true,
      message: '🎉 הקוד הופעל בהצלחה! יש לך גישת Friends לשבוע שלם!',
    };
  } catch (error) {
    logger.error('Error redeeming promo code', { userId, promoCode }, error instanceof Error ? error : undefined);
    return { success: false, message: 'אירעה שגיאה בהפעלת הקוד. נסה שוב.' };
  }
}

/**
 * Checks if user has unlimited access via promo code
 */
export async function checkUnlimitedAccessAction(userId: string) {
  try {
    const { getUserTier } = await import('@/lib/firestore-admin');
    const userTier = await getUserTier(userId);
    
    // User has unlimited if they have super or friends tier with high max uploads
    const hasUnlimited = (userTier.tier === 'super' || userTier.tier === 'friends') && userTier.maxDailyUploads >= 999999;
    
    return { hasUnlimited, tier: userTier.tier, maxDailyUploads: userTier.maxDailyUploads };
  } catch (error) {
    logger.error('Error checking unlimited access', { userId }, error instanceof Error ? error : undefined);
    return { hasUnlimited: false, tier: 'free', maxDailyUploads: 3 };
  }
}
