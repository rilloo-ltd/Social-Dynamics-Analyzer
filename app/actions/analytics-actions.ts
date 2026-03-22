'use server';

import { 
  logUpload as firestoreLogUpload,
  logButtonPress,
  logShare as firestoreLogShare,
  logImageGeneration as firestoreLogImage,
  logFeedback as firestoreLogFeedback,
  logGeminiUsage
} from '@/lib/firestore-admin';

export async function uploadChatAction(userId: string, chatCode: string, textLength: number, forceNew: boolean = false) {
  return { success: true, code: null, hasExistingOutputs: false, storageDisabled: true };
}

export async function loadCachedOutputsAction(userId: string, chatCode: string) {
  return { success: true, outputs: {}, storageDisabled: true };
}

export async function updateChatCacheAction(userId: string, code: string, type: string, output: any) {
  return { success: true, storageDisabled: true };
}

export async function logUploadAction(userId: string, participantsCount: number, tokensCount: number) {
  if (!userId) {
    throw new Error('User ID required');
  }

  const sessionId = await firestoreLogUpload(userId, participantsCount, tokensCount);

  return { success: true, sessionId };
}

export async function logButtonClickAction(buttonId: string) {
  await logButtonPress(buttonId);
  return { success: true };
}

export async function logShareAction(userId: string, sessionId: string, type: string, platform?: string) {
  if (!userId || !sessionId) {
    throw new Error('User ID and session ID required');
  }

  await firestoreLogShare(userId, sessionId, type, platform);
  return { success: true };
}

export async function logImageGenerationAction(userId: string, sessionId: string, prompt: string) {
  if (!userId || !sessionId) {
    throw new Error('User ID and session ID required');
  }

  await firestoreLogImage(userId, sessionId, prompt);
  return { success: true };
}

export async function logFeedbackAction(userId: string, sessionId: string, rating: number, comment: string) {
  if (!userId || !sessionId) {
    throw new Error('User ID and session ID required');
  }

  await firestoreLogFeedback(userId, sessionId, rating, comment);
  return { success: true };
}

export async function logGeminiUsageAction(inputTokens: number, outputTokens: number, model: string) {
  await logGeminiUsage(inputTokens, outputTokens, model);
  return { success: true };
}
