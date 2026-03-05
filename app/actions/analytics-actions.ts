'use server';

import { generateChatCode } from '@/lib/firestore-admin';
import { 
  storeChat, 
  getChat, 
  updateChatOutput,
  logUpload as firestoreLogUpload,
  logButtonPress,
  logShare as firestoreLogShare,
  logImageGeneration as firestoreLogImage,
  logFeedback as firestoreLogFeedback,
  logGeminiUsage
} from '@/lib/firestore-admin';

export async function uploadChatAction(userId: string, text: string, forceNew?: boolean) {
  if (!userId) {
    throw new Error('User ID required');
  }
  
  if (!text) {
    throw new Error('No text provided');
  }

  // Log payload size for debugging
  const sizeInBytes = Buffer.byteLength(text, 'utf8');
  const sizeInKB = (sizeInBytes / 1024).toFixed(2);
  console.log(`[uploadChatAction] Payload size: ${sizeInKB} KB`);

  if (sizeInBytes > 3 * 1024 * 1024) { // 3MB limit
    throw new Error(`Chat text is too large (${sizeInKB} KB). Maximum allowed is 3 MB.`);
  }

  const code = generateChatCode(text);
  if (!code) {
    throw new Error('Could not generate chat code (empty content)');
  }

  // Check if chat already exists
  const existingChat = await getChat(userId, code);
  
  if (existingChat && !forceNew) {
    console.log(`Chat with code ${code} already exists. Returning existing data.`);
    return { success: true, code, existingOutputs: existingChat.outputs || {} };
  }

  await storeChat(userId, code, text);

  console.log(`[uploadChatAction] Chat stored successfully with code: ${code}`);
  return { success: true, code, existingOutputs: {} };
}

export async function updateChatCacheAction(userId: string, code: string, type: string, output: any) {
  if (!userId || !code || !type || !output) {
    throw new Error('Missing required fields');
  }

  await updateChatOutput(userId, code, type, output);

  return { success: true };
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
