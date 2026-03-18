
export interface ChatMessage {
  date: Date;
  sender: string;
  content: string;
  rawLine: string;
}

export interface AnalysisResult {
  type: AnalysisType;
  content: string;
}

export enum AnalysisType {
  PERSONALITY = 'personality',
  OTHERS_THOUGHTS = 'others_thoughts',
  IMPROVEMENT = 'improvement',
  HIDDEN_THOUGHTS = 'hidden_thoughts',
  GROUP_DYNAMICS = 'group_dynamics',
  ROMANTIC_DYNAMICS = 'romantic_dynamics',
}

export interface ParsedChat {
  messages: ChatMessage[];
  participants: string[];
  anonymizedMessages: ChatMessage[];
  // Map of Original Name -> Placeholder Name
  nameMap: Record<string, string>;
  // Map of Placeholder Name -> Original Name (for reconstruction)
  reverseMap: Record<string, string>;
}

export type CardColor = 'blue' | 'purple' | 'green' | 'red' | 'yellow' | 'teal' | 'pink' | 'cyan' | 'orange' | 'indigo' | 'slate';

export type UserTier = 'free' | 'advanced' | 'super';

// Chunking types for smart sampling of large chats
export type ChunkingStrategy = 'full' | 'sampled';

export interface DateDensity {
  date: string;
  messageCount: number;
  wordCount: number;
  density: number;
}

export interface ChunkInfo {
  startDate: string;
  endDate: string;
  messages: ChatMessage[];
  wordCount: number;
  reason: string;
}
