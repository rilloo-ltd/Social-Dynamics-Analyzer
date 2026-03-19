'use server';

import 'server-only';
import { GoogleGenAI, Type } from "@google/genai";
import { ChatMessage, ChunkingStrategy } from "@/types";
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { PredictionServiceClient, helpers } from '@google-cloud/aiplatform';
import { logger } from './logger';
import { createGroupAnalysisChunks, createIndividualAnalysisChunks, getTotalWordCount } from './chat-utils';
import { getPrompt, type PromptKey } from './prompts';
import { getPromptData } from './firestore-admin';

// Gemini model configuration - change here to update all analyses
const GEMINI_MODEL = "gemini-3-flash-preview";

/**
 * Get active prompt - checks Firestore for draft/testing version first,
 * then falls back to production file-based version
 */
async function getActivePrompt(promptId: PromptKey, userId?: string): Promise<string> {
  try {
    // Check if there's a Firestore version
    const promptData = await getPromptData(promptId);
    
    // If Firestore has a draft and it's activated for testing, use it
    if (promptData && promptData.useDraft && promptData.draft) {
      logger.info('Using draft prompt from Firestore', { promptId });
      return promptData.draft;
    }
    
    // If Firestore has a production version, use it
    if (promptData && promptData.production) {
      return promptData.production;
    }
  } catch (error) {
    logger.warning('Failed to load prompt from Firestore, using file version', 
      { promptId }, 
      error instanceof Error ? error : undefined
    );
  }
  
  // Fall back to file-based version
  return getPrompt(promptId);
}

const getSystemInstruction = async () => {
  return await getActivePrompt('systemInstruction');
};

const truncateChatForContext = (messages: ChatMessage[], limit = 20000): string => {
  if (!messages || messages.length === 0) return "";
  
  let accumulatedLength = 0;
  let startIndex = 0;
  
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    const msgLen = (m.content?.length || 0) + (m.sender?.length || 0) + 20;
    accumulatedLength += msgLen;
    if (accumulatedLength >= limit) {
      startIndex = i;
      break;
    }
  }

  const sourceMessages = messages.slice(startIndex);
  let fullText = '';
  let currentSender = '';
  let lastDateStr = '';

  for (const m of sourceMessages) {
    if (!m.content.trim()) continue;
    // Convert date to Date object in case it's a string/number from API serialization
    const dateObj = m.date instanceof Date ? m.date : new Date(m.date);
    const dateStr = dateObj.getDate().toString().padStart(2, '0') + '/' + 
                    (dateObj.getMonth() + 1).toString().padStart(2, '0') + '/' + 
                    dateObj.getFullYear();
    if (dateStr !== lastDateStr) {
        fullText += `\n[${dateStr}]\n`;
        lastDateStr = dateStr;
        currentSender = '';
    }
    if (m.sender !== currentSender) {
        fullText += `\n${m.sender}:\n`;
        currentSender = m.sender;
    }
    fullText += `${m.content}\n`;
  }

  return fullText.trim();
};

const cleanJson = (text: string): string => {
  if (!text) return "{}";
  
  // Remove markdown code blocks
  let cleaned = text.replace(/```json\s*|\s*```/g, "").replace(/```/g, "").trim();
  
  // Try to extract JSON object if there's extra text
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    cleaned = jsonMatch[0];
  }
  
  // Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
  
  // Remove control characters but preserve newlines and tabs in strings
  cleaned = cleaned.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '');
  
  // Try to fix incomplete JSON by ensuring it ends properly
  // Count opening and closing braces
  const openBraces = (cleaned.match(/\{/g) || []).length;
  const closeBraces = (cleaned.match(/\}/g) || []).length;
  
  if (openBraces > closeBraces) {
    // Close any unclosed strings first
    const lastQuote = cleaned.lastIndexOf('"');
    const lastColon = cleaned.lastIndexOf(':');
    const lastComma = cleaned.lastIndexOf(',');
    const lastCloseBrace = cleaned.lastIndexOf('}');
    
    // If last character isn't a quote or brace, we might have an unclosed string
    if (lastQuote > Math.max(lastColon, lastComma, lastCloseBrace)) {
      // Count quotes to see if we have an odd number (unclosed string)
      const quotesBeforeLast = (cleaned.substring(0, lastQuote).match(/"/g) || []).length;
      if (quotesBeforeLast % 2 === 0) {
        // Even number before, so last quote opens a string - close it
        cleaned += '"';
      }
    }
    
    // Add missing closing braces
    cleaned += '}'.repeat(openBraces - closeBraces);
  }
  
  return cleaned;
};

const getApiKey = async (): Promise<string> => {
  if (process.env.GEMINI_API_KEY) {
    return process.env.GEMINI_API_KEY;
  }

  if (process.env.NODE_ENV === 'development') {
    const apiKey = process.env.API_KEY;
    if(apiKey) return apiKey;
  }

  try {
    const client = new SecretManagerServiceClient();
    const name = 'projects/social-analyzer-24750033-dc53d/secrets/GEMINI_API_KEY/versions/latest';
    const [version] = await client.accessSecretVersion({ name });
    const payload = version.payload?.data?.toString();
    if (payload) {
      return payload;
    }
    throw new Error('Secret payload is empty');
  } catch (error) {
    logger.error('Failed to access GEMINI_API_KEY from Secret Manager', {
      environment: process.env.NODE_ENV
    }, error instanceof Error ? error : undefined);
    throw new Error('Could not fetch GEMINI_API_KEY from Secret Manager');
  }
};

export async function serverAnalyzeChatFull(
  messages: ChatMessage[],
  targetUser: string,
  limit: number
): Promise<{
  personality: string;
  othersThoughts: string;
  improvement: string;
  hiddenThoughts: string;
  strategy?: ChunkingStrategy;
  originalWordCount?: number;
}> {
  const ai = new GoogleGenAI({ apiKey: await getApiKey() });

  // Apply smart chunking for large chats (> 50k words)
  const chunkResult = createIndividualAnalysisChunks(messages, targetUser, 50000);
  const chunkedMessages = chunkResult.chunks;
  const strategy = chunkResult.strategy;
  const originalWordCount = chunkResult.originalWordCount;
  
  // Verification logging (user requirement)
  if (originalWordCount > 50000) {
    const finalWordCount = getTotalWordCount(chunkedMessages);
    const reduction = ((originalWordCount - finalWordCount) / originalWordCount * 100).toFixed(1);
    console.log(`[Individual Analysis Verification]`);
    console.log(`  Original: ${originalWordCount} words`);
    console.log(`  Final: ${finalWordCount} words`);
    console.log(`  Reduction: ${reduction}%`);
    console.log(`  Still over 50k? ${finalWordCount > 50000 ? 'YES ⚠️' : 'NO ✓'}`);
  }

  const chatContext = truncateChatForContext(chunkedMessages, limit);

  const samplingNote = strategy === 'sampled' ? `
  שים לב: אלו הם קטעים נבחרים משיחה ארוכה יותר המתמקדים ב-${targetUser}, לא את כל השיחה המלאה.
  אבל אל תספר למשתמש על זה - תן ניתוח כאילו זו השיחה המלאה.
  ` : '';

  // Load prompts dynamically
  const systemInstruction = await getSystemInstruction();
  const individualAnalysisPrompt = await getActivePrompt('individualAnalysis');
  
  // Replace template placeholders
  const finalPrompt = individualAnalysisPrompt.replace(/\{\{TARGET_USER\}\}/g, targetUser);

  const prompt = `
${systemInstruction}${samplingNote}

<chat_history>
${chatContext}
</chat_history>

${finalPrompt}
`;

  const result = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          personality: { type: Type.STRING },
          othersThoughts: { type: Type.STRING },
          improvement: { type: Type.STRING },
          hiddenThoughts: { type: Type.STRING }
        },
        required: ["personality", "othersThoughts", "improvement", "hiddenThoughts"]
      }
    }
  });
  
  const rawText = result.text || "";
  const cleanedText = cleanJson(rawText);
  
  let parsed;
  try {
    parsed = JSON.parse(cleanedText);
  } catch (error) {
    logger.error('JSON parse error in serverAnalyzeChatFull', {
      rawTextLength: rawText?.length || 0,
      cleanedTextLength: cleanedText?.length || 0,
      rawTextPreview: rawText?.substring(0, 500),
      cleanedTextPreview: cleanedText?.substring(0, 500),
      errorPosition: error instanceof SyntaxError ? (error.message.match(/position (\d+)/) || [])[1] : 'unknown',
      contextAroundError: error instanceof SyntaxError && error.message.includes('position') ? 
        (() => {
          const match = error.message.match(/position (\d+)/);
          if (match) {
            const pos = parseInt(match[1]);
            const start = Math.max(0, pos - 50);
            const end = Math.min(cleanedText.length, pos + 50);
            return cleanedText.substring(start, end);
          }
          return '';
        })() : ''
    }, error instanceof Error ? error : undefined);
    
    // Fallback: return empty structure
    return {
      personality: "מצטערים, התרחשה שגיאה בניתוח. אנא נסו שוב.",
      othersThoughts: "",
      improvement: "",
      hiddenThoughts: "",
    };
  }

  return {
    personality: parsed.personality || "",
    othersThoughts: parsed.othersThoughts || "",
    improvement: parsed.improvement || "",
    hiddenThoughts: parsed.hiddenThoughts || "",
    strategy,
    originalWordCount,
  };
}

export async function serverAnalyzeGroupDynamics(
  messages: ChatMessage[],
  selectedParticipants: string[] | undefined,
  limit: number
): Promise<{ result: string; strategy?: ChunkingStrategy; originalWordCount?: number }> {
  const ai = new GoogleGenAI({ apiKey: await getApiKey() });

  // Apply smart chunking for large chats (> 50k words)
  const chunkResult = createGroupAnalysisChunks(messages, 50000);
  const chunkedMessages = chunkResult.chunks;
  const strategy = chunkResult.strategy;
  const originalWordCount = chunkResult.originalWordCount;

  const chatContext = truncateChatForContext(chunkedMessages, limit);
  
  const samplingNote = strategy === 'sampled' ? `
  שים לב: אלו הם קטעים נבחרים משיחה ארוכה יותר, לא את כל השיחה המלאה.
  אבל אל תספר למשתמש על זה - תן ניתוח כאילו זו השיחה המלאה.
  ` : '';
  
  // Load prompts dynamically
  const systemInstruction = await getSystemInstruction();
  const groupPromptKey = selectedParticipants && selectedParticipants.length > 0 
    ? 'groupDynamicsWithParticipants' 
    : 'groupDynamicsWithoutParticipants';
  const groupAnalysisPrompt = await getActivePrompt(groupPromptKey);
  
  // Replace template placeholders
  const participantList = selectedParticipants && selectedParticipants.length > 0
    ? selectedParticipants.join(", ")
    : "";
  const finalPrompt = groupAnalysisPrompt
    .replace(/\{\{PARTICIPANT_COUNT\}\}/g, selectedParticipants?.length?.toString() || "0")
    .replace(/\{\{PARTICIPANT_LIST\}\}/g, participantList);

  const prompt = `
${systemInstruction}${samplingNote}

<chat_history>
${chatContext}
</chat_history>

${finalPrompt}
`;

  const result = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt
  });
  
  return {
    result: result.text || "",
    strategy,
    originalWordCount
  };
}

export async function serverAnalyzeRomanticDynamics(
  messages: ChatMessage[],
  limit: number
): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: await getApiKey() });

  const chatContext = truncateChatForContext(messages, limit);

  // Load prompts dynamically
  const systemInstruction = await getSystemInstruction();
  const romanticAnalysisPrompt = await getActivePrompt('romanticDynamics');

  const prompt = `
  ${systemInstruction}
  
  <chat_history>
  ${chatContext}
  </chat_history>
  
  ${romanticAnalysisPrompt}
  `;

  const result = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt
  });
  
  return result.text || "";
}

export async function serverSummarizeForSharing(analysisText: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: await getApiKey() });

  // Load prompt dynamically
  const summarizationPrompt = await getActivePrompt('summarization');
  const finalPrompt = summarizationPrompt.replace(/\{\{ANALYSIS_TEXT\}\}/g, analysisText);

  const prompt = finalPrompt;

  const result = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt
  });
  
  return result.text || "";
}

export async function serverGenerateCartoonImage(prompt: string): Promise<string> {
  logger.info('Vertex AI Imagen: Starting image generation', {
    promptLength: prompt.length,
    promptPreview: prompt.substring(0, 200)
  });
  
  const projectId = process.env.FIREBASE_PROJECT_ID || 'social-analyzer-24750033-dc53d';
  const location = 'us-central1';
  
  logger.info('Vertex AI Imagen: Configuration', {
    projectId,
    location
  });

  const fullPrompt = `3D animated cartoon style with expressive characters. ${prompt}. 
High quality, vibrant colors, cute and friendly character design, colorful background, 
cinematic lighting, professional 3D rendering, joyful atmosphere.`;

  // Configure credentials for local vs production
  let clientOptions: any = {
    apiEndpoint: `${location}-aiplatform.googleapis.com`,
  };

  // In local development, use service account key
  try {
    const serviceAccountKey = require('../firebase-admin-key.json');
    clientOptions.credentials = serviceAccountKey;
    logger.info('Vertex AI Imagen: Using local service account credentials');
  } catch (error) {
    // In production (Firebase App Hosting), use Application Default Credentials
    logger.info('Vertex AI Imagen: Using Application Default Credentials (production)');
  }

  // Initialize the Prediction Service Client
  const predictionServiceClient = new PredictionServiceClient(clientOptions);

  // Construct the resource name for the model - using Imagen 4 (latest)
  const endpoint = `projects/${projectId}/locations/${location}/publishers/google/models/imagen-4.0-generate-001`;

  logger.info('Vertex AI Imagen: Prepared endpoint', { endpoint });

  const instanceValue = helpers.toValue({
    prompt: fullPrompt,
  });

  const instances = [instanceValue!];

  const parameter = {
    sampleCount: 1,
  };
  const parameters = helpers.toValue(parameter);

  const request = {
    endpoint,
    instances,
    parameters,
  };

  logger.info('Vertex AI Imagen: Sending prediction request');

  try {
    const [response] = await predictionServiceClient.predict(request);
    
    logger.info('Vertex AI Imagen: Response received', {
      predictionsCount: response.predictions?.length || 0
    });

    if (!response.predictions || response.predictions.length === 0) {
      logger.error('Vertex AI Imagen: No predictions in response', {
        hasResponse: !!response,
        responseKeys: response ? Object.keys(response) : []
      });
      throw new Error('Vertex AI response contained no predictions');
    }

    const prediction = response.predictions[0];
    
    // Access the struct value directly to avoid protobuf type issues
    const predictionStruct = prediction?.structValue?.fields || {};
    
    logger.info('Vertex AI Imagen: Processing prediction', {
      predictionKeys: Object.keys(predictionStruct),
      fieldDetails: Object.entries(predictionStruct).map(([key, value]) => ({
        key,
        hasStringValue: !!value.stringValue,
        hasListValue: !!value.listValue,
        hasStructValue: !!value.structValue,
        stringValueLength: value.stringValue?.length || 0
      }))
    });

    // Check for RAI (Responsible AI) filtering first
    const raiReason = predictionStruct['raiFilteredReason']?.stringValue;
    if (raiReason) {
      logger.warning('Vertex AI Imagen: Image blocked by content filters', {
        raiReason
      });
      throw new Error('התמונה נחסמה על ידי מסנני התוכן של Google. נסה לנסח מחדש את הבקשה.');
    }

    // Check for image data - Imagen 4 uses bytesBase64Encoded as stringValue
    const bytesField = predictionStruct['bytesBase64Encoded']?.stringValue;
    const imageField = predictionStruct['image']?.stringValue;
    
    if (bytesField) {
      logger.info('Vertex AI Imagen: Image generated successfully via bytesBase64Encoded', {
        imageSize: bytesField.length
      });
      return `data:image/png;base64,${bytesField}`;
    } else if (imageField) {
      logger.info('Vertex AI Imagen: Image generated successfully via image field', {
        imageSize: imageField.length
      });
      return `data:image/png;base64,${imageField}`;
    } else {
      logger.error('Vertex AI Imagen: Unexpected response format', {
        availableFields: Object.keys(predictionStruct),
        structPreview: JSON.stringify(predictionStruct, null, 2).substring(0, 500)
      });
      throw new Error('Unable to extract image from Vertex AI response');
    }
  } catch (error: any) {
    logger.error('Vertex AI Imagen: Prediction error', {
      errorMessage: error.message
    }, error);
    throw new Error(`Image generation failed: ${error.message}`);
  }
}

export interface VisualAssetData {
  headline: string;
  points: string[];
  visualPrompt: string;
}

export async function serverGetVisualAssetData(
  analysisText: string,
  title: string
): Promise<VisualAssetData> {
  const ai = new GoogleGenAI({ apiKey: await getApiKey() });

  const prompt = `
Based on the following psychological analysis with the title "${title}", 
create a visually appealing summary for a social media card.

1. A short, catchy headline (max 5 words) in Hebrew.
2. Exactly 3 short, impactful bullet points in Hebrew summarizing the key insights. Keep participant names as they appear.
3. A detailed visual prompt for an image generator in English. The style should be "3D animated cartoon style" featuring friendly, expressive animals that represent the "vibe" of the analysis. Avoid mentioning copyrighted brands or franchises.

Analysis:
${analysisText}
`;

  const result = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          headline: { type: Type.STRING },
          points: { type: Type.ARRAY, items: { type: Type.STRING } },
          visualPrompt: { type: Type.STRING }
        },
        required: ["headline", "points", "visualPrompt"]
      }
    }
  });

  const cleanedText = cleanJson(result.text || "{}");
  
  let data;
  try {
    data = JSON.parse(cleanedText);
  } catch (error) {
    console.error('JSON Parse Error in serverGetVisualAssetData:', error);
    console.error('Raw text:', result.text);
    console.error('Cleaned text:', cleanedText);
    
    // Fallback data
    data = {
      headline: "הניתוח הפסיכולוגי שלך",
      points: ["ניתוח מפורט זמין בקרוב"],
      visualPrompt: "A friendly cartoon character in a bright, cheerful setting, 3D animated style"
    };
  }
  
  return {
    headline: data.headline || "הניתוח הפסיכולוגי שלך",
    points: data.points || [],
    visualPrompt: data.visualPrompt || "A friendly animal in a bright setting, 3D animated cartoon style"
  };
}
