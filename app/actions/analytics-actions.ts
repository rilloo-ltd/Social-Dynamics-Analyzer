'use server';

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
import { logger } from '@/lib/logger';

export async function uploadChatAction(userId: string, chatCode: string, textLength: number, forceNew: boolean = false) {
  if (!userId || !chatCode) {
    throw new Error('Missing required fields');
  }

  try {
    logger.info('Upload chat action started', {
      userId,
      chatCode,
      textLength,
      forceNew
    });

    // Check if chat already exists
    const existingChat = await getChat(userId, chatCode);
    
    if (existingChat && !forceNew) {
      logger.info('Chat already exists, returning cached data', {
        userId,
        chatCode,
        hasOutputs: !!existingChat.outputs
      });
      
      // Don't parse or return large outputs through Server Action
      // Client will load them separately if needed
      return { success: true, code: chatCode, hasExistingOutputs: !!existingChat.outputs };
    }

    // Store chat metadata (clear outputs if forceNew)
    await storeChat(userId, chatCode, textLength, forceNew || !existingChat);

    logger.info('Chat stored successfully', {
      userId,
      chatCode,
      textLength
    });
    return { success: true, code: chatCode, hasExistingOutputs: false };
  } catch (error) {
    logger.error('Upload chat action failed with unexpected error', {
      userId,
      chatCode,
      textLength,
      forceNew
    }, error instanceof Error ? error : undefined);
    throw error;
  }
}

export async function loadCachedOutputsAction(userId: string, chatCode: string) {
  if (!userId || !chatCode) {
    throw new Error('Missing required fields');
  }

  try {
    const existingChat = await getChat(userId, chatCode);
    
    if (!existingChat || !existingChat.outputs) {
      return { success: true, outputs: {} };
    }
    
    // Parse JSON strings back to objects if needed
    const parsedOutputs: any = {};
    for (const [key, value] of Object.entries(existingChat.outputs)) {
      // Skip timestamp fields
      if (key.endsWith('_timestamp')) continue;
      
      // Try to parse JSON strings back to objects
      if (typeof value === 'string') {
        try {
          parsedOutputs[key] = JSON.parse(value);
        } catch {
          // If not JSON, store as-is
          parsedOutputs[key] = value;
        }
      } else {
        parsedOutputs[key] = value;
      }
    }
    
    return { success: true, outputs: parsedOutputs };
  } catch (error) {
    logger.error('Load cached outputs failed', { userId, chatCode }, error instanceof Error ? error : undefined);
    return { success: false, outputs: {} };
  }
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
