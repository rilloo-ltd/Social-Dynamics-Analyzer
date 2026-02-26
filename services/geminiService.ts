import "server-only";
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
    throw new Error("GEMINI_API_KEY environment variable is not set.");
}
const genAI = new GoogleGenerativeAI(API_KEY);

const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

const generationConfig = {
    temperature: 1,
    topK: 0,
    topP: 0.95,
    maxOutputTokens: 8192,
};

const safetySettings = [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

const CHAT_ANALYSIS_PROMPT = `
[Your existing prompt here...]
`;

export async function analyzeChatFull(messages: string, participant: string, userName: string) {
    const prompt = CHAT_ANALYSIS_PROMPT
        .replace("{userName}", userName)
        .replace("{participant}", participant)
        .replace("{messages}", messages);

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = await response.text();

    try {
        const parsed = JSON.parse(text);
        return parsed;
    } catch (e) {
        console.error("Could not parse Gemini's JSON response: ", text);
        throw new Error("Failed to get a valid analysis from the AI.");
    }
}

export async function getChatMetadata(messages: string, limit: number = 20000) {
    const truncatedMessages = getTruncatedMessages(messages, limit);
    const prompt = `Please analyze the following chat log and provide a summary of the most interesting highlights. These highlights should be quotes from the chat that are particularly funny, insightful, or revealing about the relationships between the participants. Return a JSON object with a single key, "highlights", which is an array of strings. 

CHAT LOG:
${truncatedMessages}`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = await response.text();

    try {
        const parsed = JSON.parse(text);
        return parsed;
    } catch (e) {
        console.error("Could not parse Gemini's JSON response for metadata: ", text);
        return { highlights: [] };
    }
}

export function getTruncatedMessages(messages: string, charLimit: number) {
    if (messages.length <= charLimit) return messages;
    const beginning = messages.substring(0, charLimit / 2);
    const end = messages.substring(messages.length - charLimit / 2);
    return beginning + "\n...\n" + end;
}

export async function analyzeGroupDynamics(messages: string, participants: string[], userName: string | undefined, limit: number) {
    const prompt = `
[Your existing group dynamics prompt here...]
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return await response.text();
}

export async function analyzeRomanticDynamics(messages: string, userName: string | undefined, limit: number) {
    const prompt = `
[Your existing romantic dynamics prompt here...]
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    return await response.text();
}

export async function summarizeForSharing(text: string, chatCode?: string | null): Promise<string> {
    const prompt = `Please summarize the following analysis for sharing on social media. Keep it concise and engaging. At the end, add a call to action to try the app. CHAT CODE: ${chatCode}. ANALYSIS: ${text}`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return await response.text();
}

export interface VisualAssetData {
  visualPrompt: string;
  headline: string;
  points: string[];
}

export async function getVisualAssetData(analysis: string, title: string, chatCode?: string | null): Promise<VisualAssetData> {
    const prompt = `Based on the following analysis, generate data for a visual asset. The data should be a JSON object with three keys: "visualPrompt", "headline", and "points". The visualPrompt should be a short, creative prompt for an image generation model to create a cartoon-style image that represents the analysis. The headline should be a catchy title for the visual asset. The points should be an array of 3-5 short, insightful bullet points that summarize the key findings of the analysis. CHAT CODE: ${chatCode}. ANALYSIS: ${analysis}`;
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = await response.text();
    try {
        return JSON.parse(text);
    } catch (e) {
        console.error("Could not parse Gemini's JSON response for visual asset data: ", text);
        throw new Error("Failed to get a valid visual asset data from the AI.");
    }
}

export async function generateCartoonImage(prompt: string): Promise<string> {
    // This is a placeholder for a real image generation API call
    // In a real application, you would use a service like DALL-E, Midjourney, or a self-hosted model.
    return `https://picsum.photos/seed/${encodeURIComponent(prompt)}/1080/1080`;
}
