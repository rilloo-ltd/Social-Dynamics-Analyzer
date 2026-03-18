import 'server-only';
import { logger } from './logger';
import { sanitizeCacheKey } from './cache-utils';

// Server-side Firestore operations using Firebase Admin SDK
// This file is for API routes and server actions

// ============ ADMIN USERS ============
/**
 * Check if a user is an admin with unlimited processing privileges
 * Admin status is stored in Firestore: users/{userId} with field isAdmin: true
 */
async function isAdminUser(userId: string): Promise<boolean> {
  const db = getAdminDb();
  
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return false;
    }
    
    const userData = userDoc.data();
    return userData?.isAdmin === true;
  } catch (error) {
    logger.error('Error checking admin status', { userId }, error instanceof Error ? error : undefined);
    return false;
  }
}

let adminInitialized = false;
let adminDb: any = null;

export function getAdminDb() {
  if (adminInitialized) {
    return adminDb;
  }

  try {
    // Dynamic import to avoid errors if firebase-admin is not installed yet
    const admin = require('firebase-admin');
    const path = require('path');
    const fs = require('fs');
    
    if (!admin.apps.length) {
      let credential;
      
      // Try to load service account key from file
      const serviceAccountPath = path.join(process.cwd(), 'firebase-admin-key.json');
      
      if (fs.existsSync(serviceAccountPath)) {
        logger.info('Loading Firebase Admin credentials from firebase-admin-key.json');
        const serviceAccountContent = fs.readFileSync(serviceAccountPath, 'utf-8');
        const serviceAccount = JSON.parse(serviceAccountContent);
        credential = admin.credential.cert(serviceAccount);
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        logger.info('Loading Firebase Admin credentials from GOOGLE_APPLICATION_CREDENTIALS');
        credential = admin.credential.applicationDefault();
      } else {
        logger.info('Using default Firebase Admin credentials (for Cloud Run/GCP)');
        credential = admin.credential.applicationDefault();
      }
      
      admin.initializeApp({
        credential,
        projectId: process.env.FIREBASE_PROJECT_ID || 'social-analyzer-24750033-dc53d'
      });
    }
    
    adminDb = admin.firestore();
    adminInitialized = true;
    return adminDb;
  } catch (error) {
    logger.error('Firebase Admin SDK not initialized', {}, error instanceof Error ? error : undefined);
    throw new Error('Firebase Admin SDK initialization failed. Check credentials.');
  }
}

// Firestore structure:
// users/{userId}/
//   - dailyStats: { date, uploadCount, lastUpload }
//   - chats/{chatCode}: { text, timestamp, outputs }
//   - uploads/{uploadId}: { timestamp, participantsCount, tokensCount }
//   - sessions/{sessionId}: { shares[], images[], feedback }
//   - referralCodes/{codeId}: { code, usesRemaining, usedBy[] }
// 
// globalStats/
//   - buttonPresses: { buttonId: count }
//   - geminiUsage/{usageId}: { timestamp, inputTokens, outputTokens, model }

// ============ UTILITY FUNCTIONS ============

/**
 * Validate that a string is safe to use as a Firestore document ID
 */
function isValidFirestoreDocumentId(id: string): boolean {
  if (!id || id.length === 0) return false;
  if (id.length > 1500) return false;
  if (id === '.' || id === '..') return false;
  if (id.includes('/')) return false;
  // Check for invalid characters (only allow alphanumeric, dash, underscore)
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) return false;
  return true;
}

/**
 * Generate a unique, Firestore-safe chat code from text content
 * Uses SHA-256 hash to ensure compatibility with Firestore document IDs
 */
export function generateChatCode(text: string): string {
  if (!text || !text.trim()) {
    return '';
  }
  
  // Use Node.js crypto to generate a hash
  const crypto = require('crypto');
  const hash = crypto.createHash('sha256').update(text).digest('hex');
  
  // Take first 32 characters for a reasonable document ID length
  // This is URL-safe and Firestore-compatible (only hex chars: 0-9, a-f)
  const code = hash.substring(0, 32);
  
  // Validate (should always pass, but defensive check)
  if (!isValidFirestoreDocumentId(code)) {
    logger.error('Generated invalid Firestore document ID', { code });
    throw new Error('Failed to generate valid chat code');
  }
  
  return code;
}

// ============ CHAT OPERATIONS ============

export async function storeChat(userId: string, chatCode: string, text: string) {
  const db = getAdminDb();
  
  try {
    // Don't store the full text to avoid Firestore 1MB document limit
    // Only store metadata - the text stays in memory on the client
    await db.collection('users').doc(userId).collection('chats').doc(chatCode).set({
      code: chatCode,
      textLength: text.length,
      textPreview: text.substring(0, 500), // Store small preview for reference
      timestamp: new Date().toISOString(),
      outputs: {}
    });
    
    logger.info('Chat metadata stored in Firestore', { userId, chatCode, textLength: text.length });
    return chatCode;
  } catch (error) {
    logger.error('Failed to store chat metadata in Firestore', {
      userId,
      chatCode,
      chatCodeLength: chatCode.length,
      textLength: text.length
    }, error instanceof Error ? error : undefined);
    throw error;
  }
}

export async function getChat(userId: string, chatCode: string) {
  const db = getAdminDb();
  
  try {
    const chatDoc = await db.collection('users').doc(userId).collection('chats').doc(chatCode).get();
    
    if (!chatDoc.exists) {
      return null;
    }
    
    return chatDoc.data();
  } catch (error) {
    logger.error('Failed to get chat from Firestore', {
      userId,
      chatCode,
      chatCodeLength: chatCode.length
    }, error instanceof Error ? error : undefined);
    throw error;
  }
}

export async function updateChatOutput(userId: string, chatCode: string, type: string, output: any) {
  const db = getAdminDb();
  
  // Sanitize the cache key to ensure valid Firestore field path
  const sanitizedType = sanitizeCacheKey(type);
  
  await db.collection('users').doc(userId).collection('chats').doc(chatCode).update({
    [`outputs.${sanitizedType}`]: {
      output,
      timestamp: new Date().toISOString()
    }
  });
}

// ============ UPLOAD TRACKING ============

export async function checkDailyUploadLimit(userId: string, maxUploads: number = 2) {
  // Admin users have unlimited uploads
  if (await isAdminUser(userId)) {
    return { canUpload: true, currentCount: 0, remainingUploads: 999999 };
  }

  // Check if user has unlimited access via promo code
  const userTier = await getUserTier(userId);
  const effectiveMaxUploads = userTier.maxDailyUploads;
  
  // Users with 999999 max uploads have unlimited access
  if (effectiveMaxUploads >= 999999) {
    return { canUpload: true, currentCount: 0, remainingUploads: 999999 };
  }

  const db = getAdminDb();
  const today = new Date().toISOString().split('T')[0];
  
  const statsDoc = await db.collection('users').doc(userId).collection('dailyStats').doc(today).get();
  
  if (!statsDoc.exists) {
    return { canUpload: true, currentCount: 0, remainingUploads: effectiveMaxUploads };
  }
  
  const data = statsDoc.data();
  const currentCount = data?.uploadCount || 0;
  
  return {
    canUpload: currentCount < effectiveMaxUploads,
    currentCount,
    remainingUploads: Math.max(0, effectiveMaxUploads - currentCount)
  };
}

export async function incrementDailyUpload(userId: string, maxUploads: number = 2) {
  // Admin users bypass limits but we still track their uploads
  const isAdmin = await isAdminUser(userId);
  
  // Check if user has unlimited access via promo code
  const userTier = await getUserTier(userId);
  const hasUnlimited = isAdmin || userTier.maxDailyUploads >= 999999;

  const db = getAdminDb();
  const today = new Date().toISOString().split('T')[0];
  
  const statsRef = db.collection('users').doc(userId).collection('dailyStats').doc(today);
  const statsDoc = await statsRef.get();
  
  if (!statsDoc.exists) {
    await statsRef.set({
      date: today,
      uploadCount: 1,
      lastUpload: new Date().toISOString()
    });
    return { success: true, currentCount: 1, remainingUploads: hasUnlimited ? 999999 : userTier.maxDailyUploads - 1 };
  }
  
  const currentCount = statsDoc.data()?.uploadCount || 0;
  
  // Only enforce limit for users without unlimited access
  if (!hasUnlimited && currentCount >= userTier.maxDailyUploads) {
    throw new Error('Daily upload limit reached');
  }
  
  await statsRef.update({
    uploadCount: currentCount + 1,
    lastUpload: new Date().toISOString()
  });
  
  return {
    success: true,
    currentCount: currentCount + 1,
    remainingUploads: hasUnlimited ? 999999 : Math.max(0, userTier.maxDailyUploads - currentCount - 1)
  };
}

export async function resetDailyUploadLimit(userId: string) {
  const db = getAdminDb();
  const today = new Date().toISOString().split('T')[0];
  
  try {
    await db.collection('users').doc(userId).collection('dailyStats').doc(today).delete();
    logger.info('Daily upload limit reset successfully', { userId, date: today });
    return { success: true, message: 'Daily upload limit reset successfully' };
  } catch (error) {
    logger.error('Error resetting daily upload limit', { userId, date: today }, error instanceof Error ? error : undefined);
    throw new Error('Failed to reset daily upload limit');
  }
}

export async function updateUserTier(
  userId: string, 
  tier: 'free' | 'basic' | 'super',
  maxDailyUploads: number
) {
  const db = getAdminDb();
  
  try {
    await db.collection('users').doc(userId).set({
      tier,
      maxDailyUploads,
      updatedAt: new Date().toISOString()
    }, { merge: true });
    
    logger.info('User tier updated', { userId, tier, maxDailyUploads });
    return { success: true };
  } catch (error) {
    logger.error('Error updating user tier', { userId, tier, maxDailyUploads }, error instanceof Error ? error : undefined);
    throw new Error('Failed to update user tier');
  }
}

export async function getUserTier(userId: string): Promise<{
  tier: 'free' | 'basic' | 'super';
  maxDailyUploads: number;
}> {
  const db = getAdminDb();
  
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return { tier: 'free', maxDailyUploads: 2 };
    }
    
    const data = userDoc.data();
    return {
      tier: data?.tier || 'free',
      maxDailyUploads: data?.maxDailyUploads || 2
    };
  } catch (error) {
    logger.error('Error getting user tier', { userId }, error instanceof Error ? error : undefined);
    return { tier: 'free', maxDailyUploads: 2 };
  }
}

/**
 * Initialize user document with default values if it doesn't exist
 * This ensures new users have a clean state in Firestore
 */
export async function ensureUserInitialized(userId: string, email?: string) {
  const db = getAdminDb();
  
  try {
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    
    if (!userDoc.exists) {
      // Create user document with defaults
      await userRef.set({
        tier: 'free',
        maxDailyUploads: 2,
        isAdmin: false,
        createdAt: new Date().toISOString(),
        ...(email && { email })
      });
      logger.info('Initialized new user document', { userId, email: email || 'none' });
    }
  } catch (error) {
    logger.warning('Error initializing user document', { userId }, error instanceof Error ? error : undefined);
    // Don't throw - this is a best-effort initialization
  }
}

/**
 * Set admin status for a user
 * @param userId - User ID to grant/revoke admin privileges
 * @param isAdmin - true to grant admin, false to revoke
 */
export async function setAdminStatus(userId: string, isAdmin: boolean) {
  const db = getAdminDb();
  
  try {
    await db.collection('users').doc(userId).set({
      isAdmin,
      adminUpdatedAt: new Date().toISOString()
    }, { merge: true });
    
    logger.info('Admin status updated', { userId, isAdmin });
    return { success: true, message: `Admin status ${isAdmin ? 'granted' : 'revoked'} for user ${userId}` };
  } catch (error) {
    logger.error('Error setting admin status', { userId, isAdmin }, error instanceof Error ? error : undefined);
    throw new Error('Failed to set admin status');
  }
}

// ============ ANALYTICS ============

export async function logUpload(userId: string, participantsCount: number, tokensCount: number) {
  const db = getAdminDb();
  
  const uploadRef = await db.collection('users').doc(userId).collection('uploads').add({
    timestamp: new Date().toISOString(),
    participantsCount,
    tokensCount
  });
  
  const sessionId = uploadRef.id;
  
  // Create session document
  await db.collection('users').doc(userId).collection('sessions').doc(sessionId).set({
    shares: [],
    images: [],
    createdAt: new Date().toISOString()
  });
  
  return sessionId;
}

export async function logButtonPress(buttonId: string) {
  const db = getAdminDb();
  
  const buttonRef = db.collection('globalStats').doc('buttonPresses');
  
  await buttonRef.set({
    [buttonId]: (await buttonRef.get()).data()?.[buttonId] || 0 + 1
  }, { merge: true });
}

export async function logShare(userId: string, sessionId: string, type: string, platform?: string) {
  const db = getAdminDb();
  
  const sessionRef = db.collection('users').doc(userId).collection('sessions').doc(sessionId);
  const sessionDoc = await sessionRef.get();
  const currentShares = sessionDoc.data()?.shares || [];
  
  await sessionRef.update({
    shares: [...currentShares, {
      type,
      platform,
      timestamp: new Date().toISOString()
    }]
  });
}

export async function logImageGeneration(userId: string, sessionId: string, prompt: string) {
  const db = getAdminDb();
  
  const sessionRef = db.collection('users').doc(userId).collection('sessions').doc(sessionId);
  const sessionDoc = await sessionRef.get();
  const currentImages = sessionDoc.data()?.images || [];
  
  await sessionRef.update({
    images: [...currentImages, {
      prompt,
      timestamp: new Date().toISOString()
    }]
  });
}

export async function logFeedback(userId: string, sessionId: string, rating: number, comment: string) {
  const db = getAdminDb();
  
  await db.collection('users').doc(userId).collection('sessions').doc(sessionId).update({
    feedback: {
      rating,
      comment,
      timestamp: new Date().toISOString()
    }
  });
}

export async function logGeminiUsage(inputTokens: number, outputTokens: number, model: string) {
  const db = getAdminDb();
  
  await db.collection('globalStats').collection('geminiUsage').add({
    timestamp: new Date().toISOString(),
    inputTokens,
    outputTokens,
    model
  });
}

// ============ REFERRAL CODES ============

export async function generateReferralCode(userId: string, userName: string, code: string, uses: number = 3) {
  const db = getAdminDb();
  
  await db.collection('users').doc(userId).collection('referralCodes').doc(code).set({
    code,
    generatedBy: userId,
    userName,
    usesRemaining: uses,
    usedBy: [],
    createdAt: new Date().toISOString()
  });
  
  return code;
}

export async function validateReferralCode(code: string) {
  const db = getAdminDb();
  
  // Search for the code across all users
  // This requires a composite query or a global referral codes collection
  // For simplicity, we'll create a global collection
  const codeDoc = await db.collection('referralCodes').doc(code).get();
  
  if (!codeDoc.exists) {
    return { valid: false };
  }
  
  const data = codeDoc.data();
  return {
    valid: data.usesRemaining > 0,
    usesRemaining: data.usesRemaining
  };
}

export async function useReferralCode(code: string, userId: string) {
  const db = getAdminDb();
  
  const codeRef = db.collection('referralCodes').doc(code);
  const codeDoc = await codeRef.get();
  
  if (!codeDoc.exists) {
    throw new Error('Code not found');
  }
  
  const data = codeDoc.data();
  
  if (data.usesRemaining <= 0) {
    throw new Error('Code has no uses remaining');
  }
  
  await codeRef.update({
    usesRemaining: data.usesRemaining - 1,
    usedBy: [...(data.usedBy || []), { userId, timestamp: new Date().toISOString() }]
  });
  
  return { success: true };
}

export async function createGlobalReferralCode(userId: string, userName: string, code: string, uses: number = 3) {
  const db = getAdminDb();
  
  await db.collection('referralCodes').doc(code).set({
    code,
    generatedBy: userId,
    userName,
    usesRemaining: uses,
    usedBy: [],
    createdAt: new Date().toISOString()
  });
  
  return code;
}

// ============ ADMIN OPERATIONS ============

export async function getAllStats() {
  const db = getAdminDb();
  
  // Get global stats
  const buttonPressesDoc = await db.collection('globalStats').doc('buttonPresses').get();
  const geminiUsageSnapshot = await db.collection('globalStats').collection('geminiUsage').get();
  
  // Get all users' data
  const usersSnapshot = await db.collection('users').get();
  
  const uploads: any[] = [];
  const sessions: any = {};
  const chats: any[] = [];
  
  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    
    // Get user's uploads
    const uploadsSnapshot = await db.collection('users').doc(userId).collection('uploads').get();
    uploadsSnapshot.forEach((doc: any) => {
      uploads.push({
        ...doc.data(),
        sessionId: doc.id,
        userId
      });
    });
    
    // Get user's sessions
    const sessionsSnapshot = await db.collection('users').doc(userId).collection('sessions').get();
    sessionsSnapshot.forEach((doc: any) => {
      sessions[doc.id] = {
        ...doc.data(),
        userId
      };
    });
    
    // Get user's chats
    const chatsSnapshot = await db.collection('users').doc(userId).collection('chats').get();
    chatsSnapshot.forEach((doc: any) => {
      chats.push({
        ...doc.data(),
        userId
      });
    });
  }
  
  return {
    uploads,
    buttonPresses: buttonPressesDoc.exists ? buttonPressesDoc.data() : {},
    geminiUsage: geminiUsageSnapshot.docs.map((doc: any) => doc.data()),
    sessions,
    chats
  };
}

export async function clearAllChats() {
  const db = getAdminDb();
  
  const usersSnapshot = await db.collection('users').get();
  
  for (const userDoc of usersSnapshot.docs) {
    const chatsSnapshot = await db.collection('users').doc(userDoc.id).collection('chats').get();
    
    const batch = db.batch();
    chatsSnapshot.forEach((doc: any) => {
      batch.delete(doc.ref);
    });
    
    await batch.commit();
  }
  
  return { success: true };
}
