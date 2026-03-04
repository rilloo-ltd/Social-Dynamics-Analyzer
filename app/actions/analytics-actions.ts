'use server';

import { readChats, writeChats, generateChatCode, readStats, writeStats } from '@/lib/storage';
import { randomBytes } from 'crypto';

export async function uploadChatAction(text: string, forceNew?: boolean) {
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

  const chats = readChats();

  if (chats[code] && !forceNew) {
    console.log(`Chat with code ${code} already exists. Returning existing data.`);
    return { success: true, code, existingOutputs: chats[code].outputs || {} };
  }

  chats[code] = {
    code,
    text,
    timestamp: new Date().toISOString(),
    outputs: forceNew ? {} : (chats[code]?.outputs || {})
  };

  writeChats(chats);

  console.log(`[uploadChatAction] Chat stored successfully with code: ${code}`);
  return { success: true, code, existingOutputs: {} };
}

export async function updateChatCacheAction(code: string, type: string, output: any) {
  if (!code || !type || !output) {
    throw new Error('Missing required fields');
  }

  const chats = readChats();

  if (!chats[code]) {
    throw new Error('Chat not found');
  }

  if (!chats[code].outputs) {
    chats[code].outputs = {};
  }

  chats[code].outputs[type] = {
    output,
    timestamp: new Date().toISOString()
  };

  writeChats(chats);

  return { success: true };
}

export async function logUploadAction(participantsCount: number, tokensCount: number) {
  const stats = readStats();
  const sessionId = randomBytes(16).toString('hex');

  stats.uploads.push({
    timestamp: new Date().toISOString(),
    participantsCount,
    tokensCount,
    sessionId
  });

  if (!stats.sessions) {
    stats.sessions = {};
  }
  stats.sessions[sessionId] = { shares: [], images: [] };

  writeStats(stats);

  return { success: true, sessionId };
}

export async function logButtonClickAction(buttonId: string) {
  const stats = readStats();

  if (!stats.buttonPresses) {
    stats.buttonPresses = {};
  }

  stats.buttonPresses[buttonId] = (stats.buttonPresses[buttonId] || 0) + 1;

  writeStats(stats);

  return { success: true };
}

export async function logShareAction(sessionId: string, type: string, platform?: string) {
  const stats = readStats();

  if (!stats.sessions) {
    stats.sessions = {};
  }

  if (!stats.sessions[sessionId]) {
    stats.sessions[sessionId] = { shares: [], images: [] };
  }

  stats.sessions[sessionId].shares.push({
    type,
    platform,
    timestamp: new Date().toISOString()
  });

  writeStats(stats);

  return { success: true };
}

export async function logImageGenerationAction(sessionId: string, prompt: string) {
  const stats = readStats();

  if (!stats.sessions) {
    stats.sessions = {};
  }

  if (!stats.sessions[sessionId]) {
    stats.sessions[sessionId] = { shares: [], images: [] };
  }

  stats.sessions[sessionId].images.push({
    prompt,
    timestamp: new Date().toISOString()
  });

  writeStats(stats);

  return { success: true };
}

export async function logFeedbackAction(sessionId: string, rating: number, comment: string) {
  const stats = readStats();

  if (!stats.sessions) {
    stats.sessions = {};
  }

  if (!stats.sessions[sessionId]) {
    stats.sessions[sessionId] = { shares: [], images: [] };
  }

  stats.sessions[sessionId].feedback = {
    rating,
    comment,
    timestamp: new Date().toISOString()
  };

  writeStats(stats);

  return { success: true };
}

export async function logGeminiUsageAction(inputTokens: number, outputTokens: number, model: string) {
  const stats = readStats();

  if (!stats.geminiUsage) {
    stats.geminiUsage = [];
  }

  stats.geminiUsage.push({
    timestamp: new Date().toISOString(),
    inputTokens,
    outputTokens,
    model
  });

  writeStats(stats);

  return { success: true };
}
