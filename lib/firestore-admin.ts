import 'server-only';

// Server-side Firestore operations using Firebase Admin SDK
// This file is for API routes and server actions

let adminInitialized = false;
let adminDb: any = null;

function getAdminDb() {
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
        console.log('Loading Firebase Admin credentials from firebase-admin-key.json');
        const serviceAccountContent = fs.readFileSync(serviceAccountPath, 'utf-8');
        const serviceAccount = JSON.parse(serviceAccountContent);
        credential = admin.credential.cert(serviceAccount);
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.log('Loading Firebase Admin credentials from GOOGLE_APPLICATION_CREDENTIALS');
        credential = admin.credential.applicationDefault();
      } else {
        console.log('Using default Firebase Admin credentials (for Cloud Run/GCP)');
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
    console.error('Firebase Admin SDK not initialized:', error);
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

// ============ CHAT OPERATIONS ============

export async function storeChat(userId: string, chatCode: string, text: string) {
  const db = getAdminDb();
  
  await db.collection('users').doc(userId).collection('chats').doc(chatCode).set({
    code: chatCode,
    text,
    timestamp: new Date().toISOString(),
    outputs: {}
  });
  
  return chatCode;
}

export async function getChat(userId: string, chatCode: string) {
  const db = getAdminDb();
  
  const chatDoc = await db.collection('users').doc(userId).collection('chats').doc(chatCode).get();
  
  if (!chatDoc.exists) {
    return null;
  }
  
  return chatDoc.data();
}

export async function updateChatOutput(userId: string, chatCode: string, type: string, output: any) {
  const db = getAdminDb();
  
  await db.collection('users').doc(userId).collection('chats').doc(chatCode).update({
    [`outputs.${type}`]: {
      output,
      timestamp: new Date().toISOString()
    }
  });
}

// ============ UPLOAD TRACKING ============

export async function checkDailyUploadLimit(userId: string, maxUploads: number = 2) {
  const db = getAdminDb();
  const today = new Date().toISOString().split('T')[0];
  
  const statsDoc = await db.collection('users').doc(userId).collection('dailyStats').doc(today).get();
  
  if (!statsDoc.exists) {
    return { canUpload: true, currentCount: 0, remainingUploads: maxUploads };
  }
  
  const data = statsDoc.data();
  const currentCount = data?.uploadCount || 0;
  
  return {
    canUpload: currentCount < maxUploads,
    currentCount,
    remainingUploads: Math.max(0, maxUploads - currentCount)
  };
}

export async function incrementDailyUpload(userId: string, maxUploads: number = 2) {
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
    return { success: true, currentCount: 1, remainingUploads: maxUploads - 1 };
  }
  
  const currentCount = statsDoc.data()?.uploadCount || 0;
  
  if (currentCount >= maxUploads) {
    throw new Error('Daily upload limit reached');
  }
  
  await statsRef.update({
    uploadCount: currentCount + 1,
    lastUpload: new Date().toISOString()
  });
  
  return {
    success: true,
    currentCount: currentCount + 1,
    remainingUploads: Math.max(0, maxUploads - currentCount - 1)
  };
}

export async function resetDailyUploadLimit(userId: string) {
  const db = getAdminDb();
  const today = new Date().toISOString().split('T')[0];
  
  try {
    await db.collection('users').doc(userId).collection('dailyStats').doc(today).delete();
    return { success: true, message: 'Daily upload limit reset successfully' };
  } catch (error) {
    console.error('Error resetting daily upload limit:', error);
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
    
    console.log(`[Firestore] Updated user ${userId} to tier: ${tier}, max uploads: ${maxDailyUploads}`);
    return { success: true };
  } catch (error) {
    console.error('Error updating user tier:', error);
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
    console.error('Error getting user tier:', error);
    return { tier: 'free', maxDailyUploads: 2 };
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
