const HTML_ENTITY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/&nbsp;|&#160;/gi, ' '],
  [/&amp;/gi, '&'],
  [/&lt;/gi, '<'],
  [/&gt;/gi, '>'],
  [/&quot;/gi, '"'],
  [/&#39;|&apos;/gi, "'"],
];

export const normalizeGeneratedText = (text: string): string => {
  if (!text) return '';

  let normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  for (const [pattern, replacement] of HTML_ENTITY_REPLACEMENTS) {
    normalized = normalized.replace(pattern, replacement);
  }

  normalized = normalized
    .replace(/\\n/g, '\n')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/p\s*>/gi, '\n\n')
    .replace(/<\s*p\b[^>]*>/gi, '\n\n')
    .replace(/<\s*\/div\s*>/gi, '\n')
    .replace(/<\s*div\b[^>]*>/gi, '\n')
    .replace(/<\s*li\b[^>]*>/gi, '\n- ')
    .replace(/<\s*\/li\s*>/gi, '')
    .replace(/<\s*\/?(?:ul|ol)\b[^>]*>/gi, '\n')
    .replace(/<\s*\/?(?:strong|b|em|i|span)\b[^>]*>/gi, '')
    .replace(/<\s*\/?[a-z][a-z0-9-]*\b[^>]*>/gi, '');

  normalized = normalized
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  return normalized.trim();
};
