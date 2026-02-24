
import { ChatMessage, ParsedChat } from '../types';

/**
 * Strips HTML-like tags from text to prevent XSS.
 */
const sanitizeInput = (text: string): string => {
  return text.replace(/<[^>]*>?/gm, '');
};

// Hoisted regex for performance
const SENSITIVE_PATTERN = /(password|pass|pwd|סיסמה|סיסמא|קוד|user|username|login|כניסה|משתמש)\s*[:=]\s*(\S+)/gi;

// Common suffixes that indicate the same person (Hebrew and English)
// Includes: New, Old, Work, Home, Mobile, numbers, single letters
const SUFFIX_PATTERNS = [
  // Hebrew
  'חדש', 'ישן', 'עבודה', 'בית', 'נייד', 'טלפון', 'מספר נוסף', 'בבית', 'בעבודה',
  // English
  'new', 'old', 'work', 'home', 'mobile', 'cell', 'phone', 'tel',
  // Digits and single chars
  '\\d+', // Any number sequence like "2", "3"
  '[a-zA-Z\u0590-\u05FF]', // Single letter/character
];

// Regex to identify if a remainder string is just a suffix + symbols
// Matches: " (New)", " - Work", " 2", etc.
const SUFFIX_REGEX = new RegExp(`^\\s*[-_()]*\\s*(${SUFFIX_PATTERNS.join('|')})\\s*[-_()]*\\s*$`, 'i');

/**
 * Replaces potential sensitive patterns like passwords or login details with gibberish.
 */
const scrubSensitiveData = (text: string): string => {
  let scrubbed = text;
  scrubbed = scrubbed.replace(SENSITIVE_PATTERN, (match, label, value) => {
    return `${label}: *****`;
  });
  return scrubbed;
};

/**
 * Creates a unique "fingerprint" for a name to detect duplicates
 * that differ only by invisible characters or whitespace.
 */
const generateNameFingerprint = (name: string): string => {
  return name
    // Keep only letters (Hebrew/English), numbers. Strip everything else.
    // This merges "Benj" + <HiddenChar> and "Benj" into the same ID.
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLowerCase();
};

/**
 * Cleans a name for display purposes (removes LTR/RTL marks but keeps spaces).
 */
const cleanDisplayName = (name: string): string => {
  return name
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '') // Remove BiDi chars
    .replace(/[\x00-\x1F\x7F]/g, '') // Remove ASCII control chars
    .trim();
};

/**
 * Consolidates participants that are likely the same person.
 * e.g., "Danny" and "Danny New" -> Merged to "Danny"
 */
const consolidateParticipants = (rawParticipants: string[]): Record<string, string> => {
  // Sort by length (shortest first) so we find the "base" name first
  const sorted = [...rawParticipants].sort((a, b) => a.length - b.length || a.localeCompare(b));
  
  const mapping: Record<string, string> = {}; // Original -> Merged
  const canonicalNames = new Set<string>();

  for (const name of sorted) {
    let mergedTo = name;
    
    // Check if this name is a variation of an existing canonical name
    for (const canonical of canonicalNames) {
      // 1. Must start with the canonical name
      if (name.toLowerCase().startsWith(canonical.toLowerCase())) {
        const remainder = name.slice(canonical.length);
        
        // 2. The remainder must be "noise" or a known suffix
        // e.g. Canonical: "Yishai", Name: "Yishai Work". Remainder: " Work"
        if (!remainder.trim() || SUFFIX_REGEX.test(remainder)) {
          mergedTo = canonical;
          break;
        }
      }
    }

    mapping[name] = mergedTo;
    if (mergedTo === name) {
      canonicalNames.add(name);
    }
  }

  return mapping;
};

/**
 * Helper to yield control to the main thread
 */
const yieldToMain = () => new Promise(resolve => setTimeout(resolve, 0));

export const parseChatFile = async (text: string, onProgress?: (percent: number) => void): Promise<ParsedChat> => {
  const sanitizedRawText = sanitizeInput(text);
  const lines = sanitizedRawText.split('\n');
  const messages: ChatMessage[] = [];
  
  // Map of Fingerprint -> Canonical Display Name (Initial strict dedupe)
  const fingerprintToName: Record<string, string> = {};
  
  const iosRegex = /^\[(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}),?\s(\d{1,2}:\d{2}(?::\d{2})?)\]\s(.*?):\s?(.*)/;
  const androidRegex = /^(\d{1,2}[./-]\d{1,2}[./-]\d{2,4}),?\s(\d{1,2}:\d{2})\s[\-–]\s(.*?):\s?(.*)/;

  const CHUNK_SIZE = 1000; // Reduced chunk size for better responsiveness
  const totalLines = lines.length;

  let currentMessage: ChatMessage | null = null;

  // 1. Single Pass: Parse lines into messages and collect raw participants
  for (let i = 0; i < totalLines; i++) {
    if (i % CHUNK_SIZE === 0) {
      await yieldToMain();
      if (onProgress) onProgress(Math.round((i / totalLines) * 30)); 
    }
    
    const line = lines[i];
    if (!line.trim()) continue;
    
    // Optimization: Skip system messages quickly
    if (line.includes('Messages and calls are end-to-end encrypted')) continue;
    if (line.includes('הודעות ושיחות מוצפנות')) continue;

    const firstChar = line[0];
    const isPotentialStart = firstChar === '[' || (firstChar >= '0' && firstChar <= '9');

    let match = null;
    if (isPotentialStart) {
      match = line.match(iosRegex) || line.match(androidRegex);
    }

    if (match) {
      const [_, dateStr, timeStr, rawSender, content] = match;
      
      // Filter out system messages that look like senders
      if (rawSender.includes('This message was deleted') || rawSender.includes('הודעה זו נמחקה')) continue;
      
      // Filter deleted messages
      if (content.includes('הודעה זו נמחקה') || content.includes('This message was deleted')) continue;

      // Filter omitted media content
      if (content.match(/Media omitted|מדיה הושמטה|image omitted|video omitted|audio omitted|sticker omitted|GIF omitted/i)) continue;
      
      const fingerprint = generateNameFingerprint(rawSender);
      if (!fingerprint) continue; // Skip empty names

      if (!fingerprintToName[fingerprint]) {
        fingerprintToName[fingerprint] = cleanDisplayName(rawSender);
      }
      const strictName = fingerprintToName[fingerprint];

      const dateParts = dateStr.split(/[./-]/);
      let dateObj = new Date();
      if (dateParts.length === 3) {
        const day = parseInt(dateParts[0]);
        const month = parseInt(dateParts[1]) - 1;
        let year = parseInt(dateParts[2]);
        if (year < 100) year += 2000;
        const timeParts = timeStr.split(':');
        const hours = parseInt(timeParts[0]);
        const minutes = parseInt(timeParts[1]);
        const seconds = timeParts[2] ? parseInt(timeParts[2]) : 0;
        dateObj = new Date(year, month, day, hours, minutes, seconds);
      }

      currentMessage = {
        date: dateObj,
        sender: strictName, // Temporarily use strict name
        content: content.trim(),
        rawLine: line
      };
      messages.push(currentMessage);

    } else if (currentMessage) {
      // Safety Check: If it looks like a header but didn't match, don't append it to content.
      // This prevents empty messages (that failed regex) from polluting previous messages.
      const looksLikeHeader = /^(?:\[?\d{1,2}[./-]\d{1,2}[./-]\d{2,4})/.test(line);
      if (looksLikeHeader) {
          continue;
      }

      // It's a continuation of the previous message
      if (!line.match(/Media omitted|מדיה הושמטה|image omitted|video omitted|audio omitted|sticker omitted|GIF omitted/i)) {
          currentMessage.content += '\n' + line;
          currentMessage.rawLine += '\n' + line;
      }
    }
  }

  // 2. Intelligent Participant Merging
  if (onProgress) onProgress(35);
  
  const initialUniqueParticipants = Object.values(fingerprintToName);
  const participantMergeMap = consolidateParticipants(initialUniqueParticipants);
  
  // Update messages with merged participant names
  const finalParticipantsSet = new Set<string>();
  
  messages.forEach(msg => {
    const mergedName = participantMergeMap[msg.sender] || msg.sender;
    msg.sender = mergedName;
    finalParticipantsSet.add(mergedName);
  });
  
  const uniqueParticipants = Array.from(finalParticipantsSet).sort();

  // 3. Create Anonymization Maps
  const nameMap: Record<string, string> = {};
  const reverseMap: Record<string, string> = {};
  
  uniqueParticipants.forEach((realName, index) => {
    const placeholder = `P${index + 1}`; // Rule 4: P1, P2, etc.
    nameMap[realName] = placeholder;
    reverseMap[placeholder] = realName;
  });

  // 4. Generate Anonymized Content
  // We need to match against all variations of the name to scrub them from text
  // e.g. If "Yishai Work" was merged to "Yishai", we still want to scrub "Yishai Work" from the text body if it appears there.
  // Combine unique participants AND the keys from the merge map to ensure we catch original names in text.
  const allKnownNames = new Set([...uniqueParticipants, ...Object.keys(participantMergeMap)]);
  const sortedNamesForRegex = Array.from(allKnownNames).sort((a, b) => b.length - a.length);
  const escapedNames = sortedNamesForRegex.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const masterNameRegex = escapedNames.length > 0 ? new RegExp(escapedNames.join('|'), 'g') : null;

  const anonymizedMessages: ChatMessage[] = [];
  const totalMsgs = messages.length;
  
  for (let i = 0; i < totalMsgs; i++) {
    if (i % 500 === 0) { 
      await yieldToMain();
      if (onProgress) onProgress(40 + Math.round((i / totalMsgs) * 60)); 
    }
    
    const msg = messages[i];
    let anonContent = msg.content;

    // Rule 2: Remove messages with links
    if (/https?:\/\/\S+|www\.\S+/i.test(anonContent)) continue;

    // Rule 6: Remove empty messages
    if (!anonContent.trim()) continue;
    
    if (anonContent.length > 3) {
       anonContent = scrubSensitiveData(anonContent);
    }

    if (masterNameRegex) {
      // Replace any occurrence of a name (original or merged) with the placeholder of the *merged* name
      anonContent = anonContent.replace(masterNameRegex, (matched) => {
         // 1. Find the canonical name for this match (handle unmerged variations found in text)
         const canonical = participantMergeMap[matched] || matched;
         // 2. Find the placeholder for the canonical name
         return nameMap[canonical] || matched;
      });
    }

    // Rule 1: Trim excessive spaces around punctuation
    anonContent = anonContent
        .replace(/\s+([.,?!:;])/g, '$1') // Remove space before punctuation
        .replace(/([.,?!:;])\s+/g, '$1'); // Remove space after punctuation

    anonymizedMessages.push({
      ...msg,
      sender: nameMap[msg.sender], // sender is already merged at step 2
      content: anonContent
    });
  }
  
  if (onProgress) onProgress(100);

  return {
    messages,
    participants: uniqueParticipants,
    anonymizedMessages,
    nameMap,
    reverseMap
  };
};
