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
import { logger } from '@/lib/logger';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from '@/lib/constants';

export async function uploadChatAction(userId: string, text: string, forceNew?: boolean) {
  try {
    if (!userId) {
      logger.error('Upload chat action failed: Missing user ID', { userId });
      throw new Error('User ID required');
    }
    
    if (!text) {
      logger.error('Upload chat action failed: No text provided', { userId });
      throw new Error('No text provided');
    }

    // Log payload size for debugging
    const sizeInBytes = Buffer.byteLength(text, 'utf8');
    const sizeInKB = (sizeInBytes / 1024).toFixed(2);
    const sizeMB = (sizeInBytes / 1024 / 1024).toFixed(2);
    
    logger.info('Upload chat action started', {
      userId,
      fileSize: sizeInBytes,
      fileSizeKB: parseFloat(sizeInKB),
      fileSizeMB: parseFloat(sizeMB),
      forceNew
    });

    if (sizeInBytes > MAX_FILE_SIZE_BYTES) {
      logger.warning('File too large rejected', {
        userId,
        fileSize: sizeInBytes,
        fileSizeKB: parseFloat(sizeInKB),
        fileSizeMB: parseFloat(sizeMB),
        maxAllowedMB: MAX_FILE_SIZE_MB
      });
      throw new Error(`הקובץ גדול מדי (${sizeMB} MB). המקסימום המותר הוא ${MAX_FILE_SIZE_MB} MB.`);
    }

    const code = generateChatCode(text);
    if (!code) {
      logger.error('Failed to generate chat code', { userId });
      throw new Error('Could not generate chat code (empty content)');
    }

    // Check if chat already exists
    const existingChat = await getChat(userId, code);
    
    if (existingChat && !forceNew) {
      logger.info('Chat already exists, returning cached data', {
        userId,
        chatCode: code,
        hasOutputs: !!existingChat.outputs
      });
      return { success: true, code, existingOutputs: existingChat.outputs || {} };
    }

    await storeChat(userId, code, text);

    logger.info('Chat stored successfully', {
      userId,
      chatCode: code,
      fileSize: sizeInBytes
    });
    return { success: true, code, existingOutputs: {} };
  } catch (error) {
    logger.error('Upload chat action failed with unexpected error', {
      userId,
      textLength: text?.length || 0,
      forceNew
    }, error instanceof Error ? error : undefined);
    throw error;
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
