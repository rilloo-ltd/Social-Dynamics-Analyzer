/**
 * Client-side hash generation using Web Crypto API
 * Generates SHA-256 hash without sending large data to server
 */

export async function generateChatCodeClient(text: string): Promise<string> {
  if (!text || !text.trim()) {
    return '';
  }
  
  // Use Web Crypto API (available in browsers)
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  
  // Convert buffer to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  // Take first 32 characters (same as server-side)
  return hashHex.substring(0, 32);
}
