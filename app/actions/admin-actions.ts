'use server';

import { logger } from '@/lib/logger';

/**
 * Validates and redeems a one-time friends code from the referralCodes collection.
 * Grants 'friends' tier (unlimited) for 7 days.
 */
export async function redeemPromoCodeAction(userId: string, promoCode: string) {
  logger.info('Promo code redemption blocked because promo privileges are disabled', {
    userId,
    promoCode: promoCode ? '[redacted]' : '',
  });

  return {
    success: false,
    message: 'קודי הטבה אינם פעילים יותר. לכל המשתמשים יש עכשיו אותה מכסה מתחדשת של 3 שליחות בכל 24 שעות.',
  };
}

/**
 * Checks if user has unlimited access via promo code
 */
export async function checkUnlimitedAccessAction(userId: string) {
  return { hasUnlimited: false, tier: 'free', maxDailyUploads: 3 };
}
